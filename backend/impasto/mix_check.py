"""Is the paint in the bowl the color the recipe wants? Measured from a photo, with no model call.

The painter says which color it's meant to be, and the rest comes from the photo:
the paint is found among its regions of color (impasto.scene), and anything white
in the shot corrects the light. With several paints in one photo, the one nearest
the chosen color is read. A tap on the photo overrides either, for when it picks wrong.
The paint's color is compared with the band's mix from the recipe (with its paste in
it, for tinted paste). If it's off, the tube that pulls it back comes from the same
search a check-in uses; for tinted paste, more paste is an option too.
"""

from __future__ import annotations

import cv2
import numpy as np

from impasto.checkin import DRIFT_DE, best_fix, describe_drift, median_hex, to_lab
from impasto.color import delta_e2000, hex_to_rgb, rgb_to_lab
from impasto.method import MAX_OFF_DE
from impasto.mixing import PLACEHOLDER_INVENTORY, without
from impasto.rectify import AS_SEEN, apply_white_balance, measure_white
from impasto.scene import SAME_HUE, Region, regions, white_spot, whitest

# The patch read around a tap, as a share of the photo's long side.
SAMPLE_SHARE = 0.01
MIN_RADIUS = 8
# Wet paint shines: pixels this bright before correction are glare on it, not its color.
GLARE = 250
MIN_CLEAN = 0.3
# Streaks: how far a*b* varies in paint that isn't mixed through. Lightness can't tell, since ridges shade themselves.
UNEVEN_HUE = 6.0
# Regions touching more of the photo's edge than this are what the bowl stands on.
EDGE = 0.02
# With several paints in the photo, those at least this share of the biggest's size are in the running.
PEER_AREA = 0.4
# What the paint reads like when it could be taken for white paper: a pale, tinted paste.
PALE_L = 65.0
PALE_CHROMA = 30.0

NO_WHITE = "Nothing white in the photo to correct the light against, so this is the color as the camera saw it. A white rag, bowl or paper in the shot makes it more exact."
NOT_FOUND = "Couldn't tell the paint from what's around it. Tap the paint on the photo."


def tap_disc(image: np.ndarray, point: tuple[float, float]) -> np.ndarray:
    """The pixels around a tap."""
    height, width = image.shape[:2]
    x, y = round(point[0]), round(point[1])
    if not (0 <= x < width and 0 <= y < height):
        raise ValueError("That tap is off the photo. Tap the paint again.")
    radius = max(MIN_RADIUS, round(max(height, width) * SAMPLE_SHARE))
    disc = np.zeros((height, width), np.uint8)
    cv2.circle(disc, (x, y), radius, 1, -1)
    return disc.astype(bool)


def read_paint(image: np.ndarray, where: np.ndarray, white) -> tuple[str, list[str]]:
    """The paint's color over a mask of the photo, as hex, and anything that makes the reading doubtful."""
    clean = where & (image.max(axis=2) < GLARE)
    warnings = []
    if clean.sum() < MIN_CLEAN * where.sum():
        warnings.append("That spot is mostly glare. Move the light, or tap a part of the paint that doesn't shine.")
        clean = where
    # Only the pixels that count are corrected: a whole photo at full size is slow, and this runs on every check.
    rows, columns = np.nonzero(where)
    top, bottom, left, right = rows.min(), rows.max() + 1, columns.min(), columns.max() + 1
    corrected = apply_white_balance(image[top:bottom, left:right], white)
    inside = clean[top:bottom, left:right]
    hue = to_lab(corrected)[..., 1:][inside]
    if float(hue.std(axis=0).max()) > UNEVEN_HUE:
        warnings.append("The color is uneven there: it looks streaky. Mix it through, then check it again.")
    return median_hex(corrected, inside), warnings


def planned_lab_cv(planned_hex: str) -> tuple[float, float, float]:
    """A plan color in the scale of a Region's lab."""
    red, green, blue = hex_to_rgb(planned_hex)
    return tuple(float(v) for v in to_lab(np.array([[[blue, green, red]]], dtype=np.uint8))[0, 0])


def pale_like(region: Region, planned_hex: str) -> bool:
    """Could this near-white region be the paint itself: is the band pale too, and the region not what the bowl stands on?"""
    lightness, a, b = planned_lab_cv(planned_hex)
    return lightness >= PALE_L and float(np.hypot(a, b)) <= PALE_CHROMA and region.edge <= EDGE


def like(region: Region, white: Region) -> bool:
    """Is this more of the white thing, in another light: a fold of the same cloth, say? Pale paste differs in hue."""
    return region.whiteish and float(np.hypot(region.lab[1] - white.lab[1], region.lab[2] - white.lab[2])) < SAME_HUE


def reference(found: list[Region], planned_hex: str, tapped: Region | None) -> Region | None:
    """The region to correct the light against, if there is one that isn't the paint."""
    candidates = [r for r in found if r is not tapped]
    white = whitest(candidates)
    if white is None:
        return None
    # Nothing else in the photo: a close-up of pale paste, not of paper.
    if tapped is None and all(like(r, white) for r in candidates):
        return None
    # One pale thing in the middle of the frame, and the band is pale too: that's the paste, on something that isn't white.
    if not any(r.whiteish and r is not white and r.area >= white.area / 4 for r in candidates) and pale_like(white, planned_hex):
        return None
    return white


def find_paint(found: list[Region], white: Region | None, image: np.ndarray, gains, planned_hex: str) -> Region | None:
    """The region most likely to be this paint: inside the frame rather than under it, and nearest the planned color among peers."""
    rest = [r for r in found if r is not white and not (white and like(r, white))]
    # A close-up has no surroundings: then what fills the frame is the paint.
    inside = [r for r in rest if r.edge <= EDGE] or rest
    if not inside:
        return None
    biggest = max(r.area for r in inside)
    peers = [r for r in inside if r.area >= PEER_AREA * biggest]
    if len(peers) == 1:
        return peers[0]
    planned = rgb_to_lab(hex_to_rgb(planned_hex))

    def off(region: Region) -> float:
        hex_color, _ = read_paint(image, region.full_mask(image.shape[:2]), gains)
        return delta_e2000(planned, rgb_to_lab(hex_to_rgb(hex_color)))

    return min(peers, key=off)


def advice(state: str, fix: tuple[str, float] | None, recipe_line: str, doubtful: bool) -> list[str]:
    """What to do about it, in order. A doubtful reading gets no tubes: they could push a good mix off."""
    if doubtful and state != "match":
        return ["Don't add anything yet: this reading can't be trusted. Sort out what's flagged below, then check it again."]
    if state == "match":
        return ["Go ahead and paint with it."]
    if state == "close":
        steps = ["Near enough to paint with: a photo can't separate colors this close."]
        return steps + [f"To get closer, {fix[0]}."] if fix else steps
    if not fix:
        return [f"A little of any tube won't bring this back. Mix it again from the recipe: {recipe_line}."]
    (text, after) = fix
    steps = [f"{text[0].upper()}{text[1:]}."]
    if after >= DRIFT_DE:
        steps.append(f"That only gets it part of the way. If there isn't much in the bowl, mix it again from the recipe: {recipe_line}.")
    return steps + ["Work it through until there are no streaks, then check it again."]


def check(
    image: np.ndarray,
    band_index: int,
    recipe: dict,
    paint_point: tuple[float, float] | None = None,
    white_point: tuple[float, float] | None = None,
) -> dict:
    """One color in the photo against its band's mix. image: the photo, upright, sRGB, BGR. The points override what's found."""
    band = recipe["bands"][band_index]
    found = regions(image)
    tapped = next((r for r in found if r.contains(paint_point)), None) if paint_point else None

    warnings: list[str] = []
    white_region = None
    if white_point is None:
        white_region = reference(found, band["mix_hex"], tapped)
        if white_region is not None:
            white_point = white_spot(white_region, image)
    if white_point is None:
        gains, warnings = AS_SEEN, [NO_WHITE]
    else:
        gains = measure_white(image, white_point, warnings)

    if paint_point:
        where = tap_disc(image, paint_point)
    else:
        paint = find_paint(found, white_region, image, gains, band["mix_hex"])
        if paint is None:
            raise ValueError(NOT_FOUND)
        where = paint.full_mask(image.shape[:2])
        paint_point = paint.spot()

    inventory = without(PLACEHOLDER_INVENTORY, recipe["mixing"]["without"])
    if recipe["mixing"]["paste_in_mix"]:
        inventory = {**inventory, "tubes": [*inventory["tubes"], inventory["paste"]]}
    measured_hex, doubts = read_paint(image, where, gains)
    planned, measured = rgb_to_lab(hex_to_rgb(band["mix_hex"])), rgb_to_lab(hex_to_rgb(measured_hex))
    delta_e = round(delta_e2000(planned, measured), 1)
    state = "match" if delta_e < MAX_OFF_DE else "close" if delta_e < DRIFT_DE else "off"
    fix = best_fix(measured_hex, band["mix_hex"], inventory) if state != "match" else None
    return {
        "results": [{
            "band": band_index,
            "name": band["name"],
            "planned_hex": band["mix_hex"],
            "measured_hex": measured_hex,
            "delta_e": delta_e,
            "state": state,
            "drift": describe_drift(planned, measured) if state != "match" else None,
            "advice": advice(state, fix, band["card"]["recipe_line"], bool(doubts)),
            "warnings": doubts,
            "point": list(paint_point),
        }],
        "white": list(white_point) if white_point else None,
        "warnings": warnings,
    }
