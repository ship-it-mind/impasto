"""Check-ins on the artist's own half-finished canvases (OUR-158).

Her test canvases weren't painted from a concept, so the plan is taken from
the most finished photo of each: rectified, white-balanced on bare canvas
(her photos have no paper in them), split into painted and bare as a check-in
does, and the paint clustered into her colors in CIELAB. Each large connected
patch of one color is a band. Every photo of the canvas is then checked in
against that plan: the earlier ones show real progress, and the plan photo
itself should come out fully painted with no drift.

Only one photo per canvas has its corners picked by hand (CANVASES). Each
other photo is registered to it with SIFT on the paint, or from features
matched by hand where SIFT fails (a steep angle and different light). That
also gives its corners when one is cut off, and turns it upright first if she
photographed the canvas the other way round. The white reference is the spot of bare
canvas furthest from any paint, pencil or shadow in all the photos.

    uv run spikes/checkin_real.py
    uv run spikes/checkin_real.py canvas-a

Reads spikes/inputs/checkin/<canvas>/. Writes spikes/output/checkin-real/<canvas>/:
the plan (plan.png, plan-bands.png, concept.json) and one check-in folder per photo.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from common import output_dir, require_file

# The check-in code lives in the package; spikes run as plain scripts from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from impasto.bands import TINTS  # noqa: E402
from impasto.checkin import (  # noqa: E402
    NO_BAND, WHITE_GROUND_LAB, check_in, local_std, median_hex, painted_mask, print_checkin, to_lab,
)
from impasto.rectify import DEFAULT_PX_PER_CM, rectify  # noqa: E402

INPUTS = Path(__file__).resolve().parent / "inputs" / "checkin"
PX_PER_CM = DEFAULT_PX_PER_CM
SIFT_LONG_SIDE = 1600
MIN_MATCHES = 40
# A patch of one color smaller than this is a stray, not a band.
MIN_BAND_CM2 = 150.0
# Smooths knife texture and pencil lines before the colors are clustered.
SMOOTH_CM = 1.5
# Shading changes lightness more than hue, so lightness counts less when clustering colors.
CLUSTER_L_WEIGHT = 0.5
# Stray marks (pencil lines, specks) further than this from every band aren't part of the plan.
STRAY_CM = 2.0
# Bare canvas for the white reference: within this much L* of the brightest canvas, and smooth.
BARE_L = 6.0
BARE_TEXTURE_L = 1.5


@dataclass
class Canvas:
    size: tuple[float, float]  # cm, as the canvas stands in the anchor photo
    photos: tuple[str, ...]  # in painting order; the last one is the plan
    anchor: int  # the photo whose corners are given
    corners: tuple[tuple[float, float], ...]  # in the anchor photo; may lie just outside it
    names: tuple[str, ...]  # one per color, darkest first
    # Extra color clusters expected from bare canvas in shadow; the most neutral ones are dropped.
    shadow_clusters: int = 0
    # Per photo index: features matched by hand, as (photo px, anchor's rectified-canvas px), instead of SIFT.
    matches: dict[int, tuple[tuple[tuple[float, float], tuple[float, float]], ...]] = field(default_factory=dict)


CANVASES = {
    "canvas-a": Canvas(
        size=(110, 140),
        photos=("WhatsApp Image 2026-10-27 at 15.19.19.jpeg", "WhatsApp Image 2026-10-27 at 15.19.19 (1).jpeg"),
        anchor=0,
        corners=((-18, -70), (3105, 200), (3008, 3785), (135, 4060)),
        names=("plum", "mauve", "sage", "cream"),
    ),
    "canvas-b": Canvas(
        size=(180, 150),
        photos=("WhatsApp Image 2026-10-27 at 15.19.21.jpeg", "WhatsApp Image 2026-10-27 at 15.19.23.jpeg"),
        anchor=1,
        corners=((162, 68), (2780, 20), (3040, 2285), (-67, 2450)),
        names=("dark plum", "plum", "rose", "taupe", "light taupe"),
        shadow_clusters=2,  # the photographer's shadow on the bare canvas, in two shades
        # Canvas top-right and bottom-right corners, the swoop's tip, where the dark plum
        # meets the top edge, and a small rose smudge left of the dark plum.
        matches={0: (
            ((2759, 507), (1800, 0)), ((2686, 3943), (1800, 1500)), ((258, 2712), (804, 967)),
            ((1708, 416), (1325.5, 0)), ((1747.5, 1171), (1358, 321)),
        )},
    ),
}


def downscale(image: np.ndarray) -> tuple[np.ndarray, float]:
    scale = SIFT_LONG_SIDE / max(image.shape[:2])
    small = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), scale


def register(photo: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Homography from photo pixels to the reference's rectified-canvas pixels, from SIFT on the paint."""
    sift = cv2.SIFT_create(nfeatures=10000)
    (small_photo, s_photo), (small_ref, s_ref) = downscale(photo), downscale(reference)
    kp_photo, des_photo = sift.detectAndCompute(cv2.equalizeHist(small_photo), None)
    kp_ref, des_ref = sift.detectAndCompute(cv2.equalizeHist(small_ref), None)
    pairs = cv2.BFMatcher().knnMatch(des_photo, des_ref, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < MIN_MATCHES:
        raise RuntimeError(f"Only {len(good)} SIFT matches; can't register the photo.")
    src = np.float32([kp_photo[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_ref[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    small_h, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    print(f"  registered on {int(inliers.sum())} of {len(good)} matches")
    return np.diag([1 / s_ref, 1 / s_ref, 1]) @ small_h @ np.diag([s_photo, s_photo, 1])


def from_matches(matches: tuple) -> np.ndarray:
    """Least-squares homography from hand-matched features, photo px → rectified-canvas px."""
    src = np.float64([photo for photo, _ in matches])
    dst = np.float64([canvas for _, canvas in matches])
    homography, _ = cv2.findHomography(src, dst, 0)
    error = np.linalg.norm(cv2.perspectiveTransform(src.reshape(-1, 1, 2), homography).reshape(-1, 2) - dst, axis=1)
    print(f"  registered on {len(matches)} hand-matched features, worst off by {error.max() / PX_PER_CM:.1f} cm")
    return homography


def to_photo(points: np.ndarray, homography: np.ndarray) -> np.ndarray:
    """Rectified-canvas pixels → photo pixels."""
    return cv2.perspectiveTransform(points.reshape(-1, 1, 2).astype(np.float64), np.linalg.inv(homography)).reshape(-1, 2)


def upright(photo: np.ndarray, points: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    """Turn the photo by quarter turns until the canvas's top-left corner is top-left in it.

    points starts with the canvas corners (TL, TR, BR, BL) and is turned along.
    The check-in orders corners by where they sit in the photo, so a canvas
    photographed the other way round would otherwise come out upside down.
    """
    for turns in range(4):
        corners = points[:4]
        sums, diffs = corners.sum(axis=1), corners[:, 1] - corners[:, 0]
        if np.argmin(sums) == 0 and np.argmax(sums) == 2 and np.argmin(diffs) == 1:
            return np.ascontiguousarray(photo), points, turns
        width = photo.shape[1]
        photo = np.rot90(photo)  # a quarter turn counter-clockwise
        points = np.stack([points[:, 1], width - 1 - points[:, 0]], axis=1)
    raise RuntimeError("Could not turn the canvas upright.")


def bare_canvas(warped: np.ndarray, in_photo: np.ndarray) -> np.ndarray:
    """Bright, smooth canvas: unpainted and out of shadow (before any white balance)."""
    lab = to_lab(cv2.GaussianBlur(warped, (0, 0), 2))
    lightness = lab[..., 0]
    smooth = local_std(lightness, round(2 * PX_PER_CM) | 1) < BARE_TEXTURE_L
    bright = lightness > np.percentile(lightness[in_photo], 99) - BARE_L
    return bright & smooth & in_photo


def white_point(bare: list[np.ndarray]) -> tuple[float, float]:
    """The rectified-canvas pixel deepest inside bare canvas in every photo."""
    common = np.logical_and.reduce(bare).astype(np.uint8)
    distance = cv2.distanceTransform(common, cv2.DIST_L2, 5)
    y, x = np.unravel_index(np.argmax(distance), distance.shape)
    if distance[y, x] < PX_PER_CM:
        raise RuntimeError("No bare canvas common to all photos for the white reference.")
    return float(x), float(y)


def plan_from_photo(
    warped: np.ndarray, in_photo: np.ndarray, names: tuple[str, ...], shadow_clusters: int,
) -> tuple[np.ndarray, list[dict]]:
    """Band map and bands from a rectified, white-balanced photo: her colors, one band per large patch."""
    painted = painted_mask(warped, WHITE_GROUND_LAB, PX_PER_CM) & in_photo
    smooth = cv2.medianBlur(warped, round(SMOOTH_CM * PX_PER_CM) | 1)
    lab = to_lab(smooth) * np.float32([CLUSTER_L_WEIGHT, 1, 1])
    samples = lab[painted].astype(np.float32)
    rng = np.random.default_rng(3)
    subset = samples[rng.choice(len(samples), min(len(samples), 60000), replace=False)]
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.1)
    _, _, centers = cv2.kmeans(subset, len(names) + shadow_clusters, None, criteria, 5, cv2.KMEANS_PP_CENTERS)
    nearest = np.argmin(np.linalg.norm(lab[..., None, :] - centers[None, None], axis=3), axis=2)
    by_chroma = np.argsort(np.hypot(centers[:, 1], centers[:, 2]))
    for shadow in by_chroma[:shadow_clusters]:
        painted &= nearest != shadow
    kept = sorted(by_chroma[shadow_clusters:], key=lambda i: centers[i, 0])  # darkest first, to match names

    min_px = MIN_BAND_CM2 * PX_PER_CM**2
    band_map = np.full(painted.shape, NO_BAND, np.uint8)
    bands = []
    for color, name in zip(kept, names):
        count, labels, stats, _ = cv2.connectedComponentsWithStats((painted & (nearest == color)).astype(np.uint8), connectivity=4)
        patches = sorted((i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] >= min_px),
                         key=lambda i: -stats[i, cv2.CC_STAT_AREA])
        for k, patch in enumerate(patches):
            band_map[labels == patch] = len(bands)
            bands.append({"name": name if k == 0 else f"{name} {k + 1}", "color": color})
    # Painted pixels in stray patches go to the nearest band, unless they're far from all of them.
    if bands:
        distances = np.stack([cv2.distanceTransform((band_map != i).astype(np.uint8), cv2.DIST_L2, 3) for i in range(len(bands))])
        stray = painted & (band_map == NO_BAND) & (distances.min(axis=0) <= STRAY_CM * PX_PER_CM)
        band_map[stray] = np.argmin(distances[:, stray], axis=0)
    for i, band in enumerate(bands):
        band["hex"] = median_hex(warped, band_map == i)  # on the check-in's footing: white is #ffffff
    return band_map, bands


def draw_plan(warped: np.ndarray, band_map: np.ndarray, bands: list[dict]) -> np.ndarray:
    drawn = warped.copy()
    for i, band in enumerate(bands):
        mask = band_map == i
        tint = np.array(TINTS[i % len(TINTS)], dtype=np.float32)
        drawn[mask] = (0.5 * drawn[mask] + 0.5 * tint).astype(np.uint8)
        ys, xs = np.nonzero(mask)
        cv2.putText(drawn, band["name"], (int(xs.mean()) - 40, int(ys.mean())), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
    return drawn


async def run(key: str, canvas: Canvas) -> None:
    print(f"{key}:")
    folder = INPUTS / key
    out = output_dir(f"checkin-real/{key}")
    photos = [cv2.imread(str(require_file(folder / name))) for name in canvas.photos]
    out_w, out_h = round(canvas.size[0] * PX_PER_CM), round(canvas.size[1] * PX_PER_CM)
    rect = np.array([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], dtype=np.float64)
    reference, info = rectify(photos[canvas.anchor], np.array(canvas.corners, dtype=np.float32), canvas.size, PX_PER_CM)
    homographies, bare = [], []
    for index, (name, photo) in enumerate(zip(canvas.photos, photos)):
        print(f" {name}")
        if index == canvas.anchor:
            homography = np.array(info.homography)
        elif index in canvas.matches:
            homography = from_matches(canvas.matches[index])
        else:
            homography = register(photo, reference)
        warped = cv2.warpPerspective(photo, homography, (out_w, out_h))
        in_photo = cv2.warpPerspective(np.full(photo.shape[:2], 255, np.uint8), homography, (out_w, out_h), flags=cv2.INTER_NEAREST) > 0
        homographies.append(homography)
        bare.append(bare_canvas(warped, cv2.erode(in_photo.astype(np.uint8), np.ones((15, 15))) > 0))
    white_px = np.array([white_point(bare)])
    print(f" white reference at {np.round(white_px[0] / PX_PER_CM).astype(int).tolist()} cm")

    placed = []  # per photo: upright photo path, corners, white point
    for index, (name, photo, homography) in enumerate(zip(canvas.photos, photos, homographies)):
        photo, points, turns = upright(photo, np.vstack([to_photo(rect, homography), to_photo(white_px, homography)]))
        corners, white = points[:4], points[4]
        path = folder / name
        if turns:
            path = out / f"photo-{index + 1}-upright.jpg"
            cv2.imwrite(str(path), photo, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(f" {name}: {'turned ' + str(90 * turns) + '° upright, ' if turns else ''}"
              f"corners {np.round(corners).astype(int).tolist()}")
        placed.append((path, corners, white))

    plan_path, corners, white = placed[-1]
    plan_photo = cv2.imread(str(plan_path))
    warped, plan_info = rectify(plan_photo, corners.astype(np.float32), canvas.size, PX_PER_CM, "registered", tuple(white))
    in_photo = cv2.warpPerspective(
        np.full(plan_photo.shape[:2], 255, np.uint8), np.array(plan_info.homography), (out_w, out_h), flags=cv2.INTER_NEAREST,
    ) > 0
    band_map, bands = plan_from_photo(warped, in_photo, canvas.names, canvas.shadow_clusters)
    cv2.imwrite(str(out / "plan.png"), band_map)
    cv2.imwrite(str(out / "plan-bands.png"), draw_plan(warped, band_map, bands))
    concept = {
        "title": f"{key}, from {canvas.photos[-1]}",
        "flow": "from photo",
        "bands": [{"name": b["name"], "hex": b["hex"], "width": 1, "relief": "medium"} for b in bands],
    }
    concept_path = out / "concept.json"
    concept_path.write_text(json.dumps(concept, indent=2) + "\n", encoding="utf-8")
    print(" plan: " + ", ".join(f"{b['name']} {b['hex']}" for b in bands))

    for index, (path, corners, white) in enumerate(placed):
        print(f"\n check-in {index + 1}/{len(placed)}: {canvas.photos[index]}")
        checkin = await check_in(
            path, concept_path, canvas.size, tuple(white), out / f"checkin-{index + 1}",
            corners=[tuple(c) for c in corners], plan_map=out / "plan.png",
        )
        print_checkin(checkin)
    print(f"\nWrote {out}\n")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("canvas", nargs="*", help=f"canvases to run: {', '.join(CANVASES)} (default: all)")
    args = parser.parse_args()
    for key in args.canvas:
        if key not in CANVASES:
            parser.error(f"No such canvas: {key}")
    for key in args.canvas or CANVASES:
        await run(key, CANVASES[key])


if __name__ == "__main__":
    asyncio.run(main())
