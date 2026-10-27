"""Canvas rectification: find the canvas in a photo and warp it to a flat, scaled rectangle.

    uv run python -m impasto.rectify photo.jpg --size 110x140
    uv run python -m impasto.rectify photo.jpg --size 110x140 \
        --corners 20,60 1170,45 1185,1480 95,1495

Corners are found automatically from SAM's "painting" mask unless --corners
gives them (top-left, top-right, bottom-right, bottom-left, in photo pixels).
Scale comes from the canvas size the artist enters, so every pixel of the
rectified image is 1/px_per_cm cm on the canvas. Writes rectified.png,
corners.png (the corners drawn on the photo) and rectify.json.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from impasto.sam import masks_by_object, segment

OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "rectify"
DEFAULT_PX_PER_CM = 10.0


@dataclass
class Rectification:
    canvas_cm: tuple[float, float]
    px_per_cm: float
    corners_px: list[tuple[float, float]]
    corner_source: str
    homography: list[list[float]]
    warnings: list[str]

    @property
    def output_size(self) -> tuple[int, int]:
        width_cm, height_cm = self.canvas_cm
        return round(width_cm * self.px_per_cm), round(height_cm * self.px_per_cm)


def order_corners(points: np.ndarray) -> np.ndarray:
    """Order four points as top-left, top-right, bottom-right, bottom-left."""
    points = np.asarray(points, dtype=np.float32).reshape(4, 2)
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1).ravel()
    return np.array(
        [
            points[np.argmin(sums)],
            points[np.argmin(diffs)],
            points[np.argmax(sums)],
            points[np.argmax(diffs)],
        ],
        dtype=np.float32,
    )


def quad_from_mask(mask: np.ndarray) -> np.ndarray:
    """Fit four corners to the largest region of a boolean mask."""
    contours, _ = cv2.findContours(
        mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        raise ValueError("The canvas mask is empty.")
    hull = cv2.convexHull(max(contours, key=cv2.contourArea))
    perimeter = cv2.arcLength(hull, closed=True)
    for fraction in np.linspace(0.005, 0.1, 40):
        approx = cv2.approxPolyDP(hull, fraction * perimeter, closed=True)
        if len(approx) == 4:
            return order_corners(approx)
    # No clean quadrilateral: fall back to the tightest rotated rectangle.
    return order_corners(cv2.boxPoints(cv2.minAreaRect(hull)))


async def detect_corners(photo: Path, size: tuple[int, int]) -> np.ndarray:
    result = await segment(photo, "painting")
    masks = masks_by_object(result, size)
    if not masks:
        raise ValueError("SAM found no painting in the photo; give --corners instead.")
    return quad_from_mask(np.logical_or.reduce(list(masks.values())))


def rectify(
    image: np.ndarray,
    corners: np.ndarray,
    canvas_cm: tuple[float, float],
    px_per_cm: float = DEFAULT_PX_PER_CM,
    corner_source: str = "manual",
) -> tuple[np.ndarray, Rectification]:
    corners = order_corners(corners)
    width_cm, height_cm = canvas_cm
    out_w, out_h = round(width_cm * px_per_cm), round(height_cm * px_per_cm)
    target = np.array([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], dtype=np.float32)
    homography = cv2.getPerspectiveTransform(corners, target)
    warped = cv2.warpPerspective(image, homography, (out_w, out_h), flags=cv2.INTER_LINEAR)

    warnings = []
    top, right, bottom, left = (
        np.linalg.norm(corners[(i + 1) % 4] - corners[i]) for i in range(4)
    )
    photo_ratio = ((top + bottom) / 2) / ((left + right) / 2)
    canvas_ratio = width_cm / height_cm
    if not 0.75 < photo_ratio / canvas_ratio < 1.33:
        warnings.append(
            f"Canvas in the photo is {photo_ratio:.2f} wide per unit of height but the "
            f"entered size is {canvas_ratio:.2f}: check the size or the corners."
        )

    return warped, Rectification(
        canvas_cm=canvas_cm,
        px_per_cm=px_per_cm,
        corners_px=[(float(x), float(y)) for x, y in corners],
        corner_source=corner_source,
        homography=homography.tolist(),
        warnings=warnings,
    )


def draw_corners(image: np.ndarray, corners: list[tuple[float, float]]) -> np.ndarray:
    drawn = image.copy()
    points = np.array(corners, dtype=np.int32)
    cv2.polylines(drawn, [points], isClosed=True, color=(0, 0, 255), thickness=4)
    for label, (x, y) in zip(("TL", "TR", "BR", "BL"), points):
        cv2.circle(drawn, (int(x), int(y)), 12, (0, 0, 255), -1)
        cv2.putText(
            drawn, label, (int(x) + 16, int(y) + 8), cv2.FONT_HERSHEY_SIMPLEX, 1.2,
            (0, 0, 255), 3,
        )
    return drawn


def parse_size(value: str) -> tuple[float, float]:
    width, _, height = value.lower().partition("x")
    return float(width), float(height)


def parse_point(value: str) -> tuple[float, float]:
    x, _, y = value.partition(",")
    return float(x), float(y)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photo", type=Path)
    parser.add_argument("--size", type=parse_size, required=True, help="canvas WIDTHxHEIGHT in cm")
    parser.add_argument(
        "--corners", type=parse_point, nargs=4, metavar="X,Y",
        help="corner points in photo pixels; skips automatic detection",
    )
    parser.add_argument("--px-per-cm", type=float, default=DEFAULT_PX_PER_CM)
    parser.add_argument("--out", type=Path, help="output folder")
    args = parser.parse_args()

    image = cv2.imread(str(args.photo))
    if image is None:
        raise FileNotFoundError(args.photo)
    height, width = image.shape[:2]
    if args.corners:
        corners, source = np.array(args.corners, dtype=np.float32), "manual"
    else:
        corners, source = await detect_corners(args.photo, (width, height)), "auto"

    warped, info = rectify(image, corners, args.size, args.px_per_cm, source)
    out = args.out or OUTPUT_ROOT / args.photo.stem
    out.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out / "rectified.png"), warped)
    cv2.imwrite(str(out / "corners.png"), draw_corners(image, info.corners_px))
    (out / "rectify.json").write_text(json.dumps(asdict(info), indent=2) + "\n", encoding="utf-8")

    print(f"Corners ({source}): " + "  ".join(f"{x:.0f},{y:.0f}" for x, y in info.corners_px))
    print(f"Rectified to {info.output_size[0]}x{info.output_size[1]} px at {info.px_per_cm:g} px/cm")
    for warning in info.warnings:
        print(f"Warning: {warning}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    asyncio.run(main())
