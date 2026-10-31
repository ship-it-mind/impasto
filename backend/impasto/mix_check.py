"""Is the paint in the bowl the color the recipe wants? Measured from a photo, with no model call.

The painter taps white paper beside the bowl, then the paint, once per color in
the photo. The paint's color is read after white balance against the paper, as a
check-in reads the canvas, and compared with the band's mix from the recipe (with
its paste in it, for tinted paste). If it's off, the tube that pulls it back comes
from the same search a check-in uses; for tinted paste, more paste is an option too.
"""

from __future__ import annotations

import numpy as np

from impasto.checkin import DRIFT_DE, best_fix, describe_drift, median_hex, to_lab
from impasto.color import delta_e2000, hex_to_rgb, rgb_to_lab
from impasto.method import MAX_OFF_DE
from impasto.mixing import PLACEHOLDER_INVENTORY, without
from impasto.rectify import apply_white_balance, measure_white

# The patch read around a tap, as a share of the photo's long side.
SAMPLE_SHARE = 0.01
MIN_RADIUS = 8
# Wet paint shines: pixels this bright before correction are glare on it, not its color.
GLARE = 250
MIN_CLEAN = 0.3
# Streaks: how much L* varies in a patch of paint that isn't mixed through, or is half in shadow.
UNEVEN_L = 5.0


def read_paint(image: np.ndarray, point: tuple[float, float], white) -> tuple[str, list[str]]:
    """The paint's color around one tap, as hex, and anything that makes the reading doubtful."""
    height, width = image.shape[:2]
    x, y = round(point[0]), round(point[1])
    if not (0 <= x < width and 0 <= y < height):
        raise ValueError("That tap is off the photo. Tap the paint again.")
    radius = max(MIN_RADIUS, round(max(height, width) * SAMPLE_SHARE))
    top, left = max(0, y - radius), max(0, x - radius)
    patch = image[top : y + radius + 1, left : x + radius + 1]
    ys, xs = np.ogrid[top - y : patch.shape[0] + top - y, left - x : patch.shape[1] + left - x]
    disc = xs * xs + ys * ys <= radius * radius
    clean = disc & (patch.max(axis=2) < GLARE)

    warnings = []
    if clean.sum() < MIN_CLEAN * disc.sum():
        warnings.append("That spot is mostly glare. Move the light, or tap a part of the paint that doesn't shine.")
        clean = disc
    corrected = apply_white_balance(patch, white)
    if float(to_lab(corrected)[..., 0][clean].std()) > UNEVEN_L:
        warnings.append("The color is uneven there: streaks, a shadow or the bowl's edge. Mix it through, or tap a flatter part.")
    return median_hex(corrected, clean), warnings


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


def check(image: np.ndarray, white_point: tuple[float, float], samples: list[dict], recipe: dict) -> dict:
    """Each tapped color against its band's mix. image: the photo, upright, sRGB, BGR. samples: {band, point}."""
    warnings: list[str] = []
    white = measure_white(image, white_point, warnings)
    inventory = without(PLACEHOLDER_INVENTORY, recipe["mixing"]["without"])
    if recipe["mixing"]["paste_in_mix"]:
        inventory = {**inventory, "tubes": [*inventory["tubes"], inventory["paste"]]}

    results = []
    for sample in samples:
        band = recipe["bands"][sample["band"]]
        measured_hex, doubts = read_paint(image, sample["point"], white)
        planned, measured = rgb_to_lab(hex_to_rgb(band["mix_hex"])), rgb_to_lab(hex_to_rgb(measured_hex))
        delta_e = round(delta_e2000(planned, measured), 1)
        state = "match" if delta_e < MAX_OFF_DE else "close" if delta_e < DRIFT_DE else "off"
        fix = best_fix(measured_hex, band["mix_hex"], inventory) if state != "match" else None
        results.append({
            "band": sample["band"],
            "name": band["name"],
            "planned_hex": band["mix_hex"],
            "measured_hex": measured_hex,
            "delta_e": delta_e,
            "state": state,
            "drift": describe_drift(planned, measured) if state != "match" else None,
            "advice": advice(state, fix, band["card"]["recipe_line"], bool(doubts)),
            "warnings": doubts,
        })
    return {"results": results, "warnings": warnings}
