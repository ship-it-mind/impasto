"""Band segmentation: the artist's points + SAM masks → area and color per band.

    uv run python -m impasto.bands output/rectify/painting \
        --point cream=838,329 --point cream=651,85 --point "dark plum=780,917" ...

Reads rectified.png and rectify.json from a rectification folder. Points are
in rectified-canvas pixels; repeat a band name to give it more points (2–3
per band, spread along it). All bands go to SAM in one request. Writes
bands.json and bands.png (each band tinted, with its points) to the same folder.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np
from meta_sam_parser import FramePrompt, PromptObject, PromptPoint, build_object_prompt

from impasto.sam import masks_by_object, segment

# Holes and stray specks up to this size are paste-ridge highlights or
# texture shadows, not real parts of another band.
MAX_HOLE_CM2 = 25.0
# Pixels this close to a band edge are left out of its color, which blends there.
COLOR_EDGE_MARGIN_CM = 1.0

TINTS = [
    (75, 25, 230), (75, 180, 60), (25, 225, 255), (200, 130, 0),
    (48, 130, 245), (180, 30, 145), (240, 240, 70), (230, 50, 240),
]  # BGR


@dataclass
class Band:
    id: int
    name: str
    points_cm: list[tuple[float, float]]
    area_cm2: float
    masked_area_cm2: float
    color_lab: tuple[float, float, float]
    color_hex: str
    bbox_cm: tuple[float, float, float, float]


@dataclass
class BandMap:
    canvas_cm: tuple[float, float]
    px_per_cm: float
    canvas_area_cm2: float
    holes_filled_cm2: float
    gaps_assigned_cm2: float
    bands: list[Band]


def group_points(points: list[tuple[str, float, float]]) -> list[tuple[str, list[tuple[float, float]]]]:
    """Merge points that share a band name, keeping first-seen band order."""
    grouped: dict[str, list[tuple[float, float]]] = {}
    for name, x, y in points:
        grouped.setdefault(name, []).append((x, y))
    return list(grouped.items())


def fill_small_holes(mask: np.ndarray, max_hole_px: int) -> np.ndarray:
    """Fill enclosed holes in a mask that are smaller than max_hole_px."""
    holes = (~mask).astype(np.uint8)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
    height, width = mask.shape
    x, y, w, h, area = stats.T
    touches_border = (x == 0) | (y == 0) | (x + w == width) | (y + h == height)
    small = (area <= max_hole_px) & ~touches_border
    small[0] = False  # label 0 is the mask itself
    return mask | small[labels]


def drop_small_islands(mask: np.ndarray, min_island_px: int) -> np.ndarray:
    """Remove disconnected specks of a band, e.g. texture shadows inside a neighbor."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if count <= 2:
        return mask
    keep = stats[:, cv2.CC_STAT_AREA] >= min_island_px
    keep[0] = False  # label 0 is the background
    keep[1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])] = True  # never drop the band itself
    return keep[labels]


def resolve_bands(raw: list[np.ndarray], max_hole_px: int) -> tuple[list[np.ndarray], int, int]:
    """Fill holes, drop specks, keep bands disjoint, and give leftover canvas pixels to the nearest band.

    Every cm² of canvas gets paint, so gaps SAM left (edges, ridges between
    bands, dropped specks) are assigned to the closest band. Returns the final
    masks plus the pixel counts added by hole filling and by gap assignment.
    """
    claimed = np.logical_or.reduce(raw)
    filled = []
    for index, mask in enumerate(raw):
        others = np.logical_or.reduce([m for i, m in enumerate(raw) if i != index]) if len(raw) > 1 else np.zeros_like(mask)
        filled.append(fill_small_holes(mask, max_hole_px) & ~others)
    # Two bands can both fill the same hole; the earlier band keeps it.
    taken = np.zeros_like(raw[0])
    for index in range(len(filled)):
        filled[index] &= ~taken
        taken |= filled[index]
    holes_px = int(taken.sum() - claimed.sum())
    filled = [drop_small_islands(mask, max_hole_px) for mask in filled]
    taken = np.logical_or.reduce(filled)

    gaps = ~taken
    gaps_px = int(gaps.sum())
    if gaps_px:
        distances = np.stack(
            [cv2.distanceTransform((~m).astype(np.uint8), cv2.DIST_L2, 5) for m in filled]
        )
        nearest = distances.argmin(axis=0)
        for index in range(len(filled)):
            filled[index] |= gaps & (nearest == index)
    return filled, holes_px, gaps_px


def dominant_color(image: np.ndarray, mask: np.ndarray, margin_px: int) -> tuple[tuple[float, float, float], str]:
    """Median color in CIELAB over the band's interior.

    Median, not mean, because knife-ridge highlights and shadows skew a mean.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * margin_px + 1, 2 * margin_px + 1))
    interior = cv2.erode(mask.astype(np.uint8), kernel).astype(bool)
    if interior.sum() < 100:
        interior = mask
    lab = cv2.cvtColor(image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
    median = np.median(lab[interior], axis=0)
    bgr = cv2.cvtColor(median.reshape(1, 1, 3).astype(np.float32), cv2.COLOR_LAB2BGR)
    blue, green, red = (int(round(v)) for v in np.clip(bgr.ravel() * 255, 0, 255))
    lab_rounded = tuple(round(float(v), 1) for v in median)
    return lab_rounded, f"#{red:02x}{green:02x}{blue:02x}"


async def segment_bands(
    rectified: Path,
    points: list[tuple[str, float, float]],
    canvas_cm: tuple[float, float],
    px_per_cm: float,
) -> tuple[BandMap, list[np.ndarray]]:
    image = cv2.imread(str(rectified))
    if image is None:
        raise FileNotFoundError(rectified)
    height, width = image.shape[:2]
    bands_points = group_points(points)

    prompt = build_object_prompt(
        size=(width, height),
        objects=[
            PromptObject(
                id=index,
                prompts=[FramePrompt(points=[PromptPoint(round(x), round(y)) for x, y in pts])],
            )
            for index, (_, pts) in enumerate(bands_points)
        ],
    )
    result = await segment(rectified, prompt)
    by_object = masks_by_object(result, (width, height))
    empty = [name for index, (name, _) in enumerate(bands_points) if str(index) not in by_object]
    if empty:
        raise ValueError(f"SAM returned no mask for: {', '.join(empty)}. Move or add points.")
    raw = [by_object[str(index)] for index in range(len(bands_points))]

    max_hole_px = round(MAX_HOLE_CM2 * px_per_cm**2)
    masks, holes_px, gaps_px = resolve_bands(raw, max_hole_px)

    px_area = 1 / px_per_cm**2
    bands = []
    for index, ((name, pts), raw_mask, mask) in enumerate(zip(bands_points, raw, masks)):
        lab, hex_color = dominant_color(image, raw_mask, round(COLOR_EDGE_MARGIN_CM * px_per_cm))
        x, y, w, h = cv2.boundingRect(mask.astype(np.uint8))
        bands.append(
            Band(
                id=index,
                name=name,
                points_cm=[(round(px / px_per_cm, 1), round(py / px_per_cm, 1)) for px, py in pts],
                area_cm2=round(float(mask.sum()) * px_area, 1),
                masked_area_cm2=round(float(raw_mask.sum()) * px_area, 1),
                color_lab=lab,
                color_hex=hex_color,
                bbox_cm=tuple(round(v / px_per_cm, 1) for v in (x, y, w, h)),
            )
        )

    band_map = BandMap(
        canvas_cm=canvas_cm,
        px_per_cm=px_per_cm,
        canvas_area_cm2=round(width * height * px_area, 1),
        holes_filled_cm2=round(holes_px * px_area, 1),
        gaps_assigned_cm2=round(gaps_px * px_area, 1),
        bands=bands,
    )
    return band_map, masks


def draw_bands(image: np.ndarray, band_map: BandMap, masks: list[np.ndarray]) -> np.ndarray:
    drawn = image.copy()
    for index, (band, mask) in enumerate(zip(band_map.bands, masks)):
        tint = np.array(TINTS[index % len(TINTS)], dtype=np.float32)
        drawn[mask] = (0.45 * drawn[mask] + 0.55 * tint).astype(np.uint8)
        for x_cm, y_cm in band.points_cm:
            x, y = round(x_cm * band_map.px_per_cm), round(y_cm * band_map.px_per_cm)
            cv2.circle(drawn, (x, y), 10, (255, 255, 255), -1)
            cv2.circle(drawn, (x, y), 7, TINTS[index % len(TINTS)], -1)
    return drawn


def parse_point(value: str) -> tuple[str, float, float]:
    name, _, coords = value.partition("=")
    x, _, y = coords.partition(",")
    return name, float(x), float(y)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="rectification output folder")
    parser.add_argument(
        "--point", action="append", type=parse_point, required=True, metavar="NAME=X,Y",
        help="a point inside a band, in rectified pixels; repeat a name for more points",
    )
    args = parser.parse_args()

    info = json.loads((args.folder / "rectify.json").read_text(encoding="utf-8"))
    rectified = args.folder / "rectified.png"
    band_map, masks = await segment_bands(
        rectified, args.point, tuple(info["canvas_cm"]), info["px_per_cm"]
    )

    cv2.imwrite(str(args.folder / "bands.png"), draw_bands(cv2.imread(str(rectified)), band_map, masks))
    (args.folder / "bands.json").write_text(json.dumps(asdict(band_map), indent=2) + "\n", encoding="utf-8")

    total = sum(band.area_cm2 for band in band_map.bands)
    for band in band_map.bands:
        print(
            f"{band.id}. {band.name:<14} {band.color_hex}  {band.area_cm2:>8.1f} cm²  "
            f"{100 * band.area_cm2 / total:5.1f}%  (SAM mask {band.masked_area_cm2:.1f} cm²)"
        )
    print(
        f"\nTotal {total:.1f} of {band_map.canvas_area_cm2:.1f} cm² canvas; "
        f"holes filled {band_map.holes_filled_cm2} cm², gaps assigned {band_map.gaps_assigned_cm2} cm²"
    )
    print(f"Wrote {args.folder / 'bands.json'} and {args.folder / 'bands.png'}")


if __name__ == "__main__":
    asyncio.run(main())
