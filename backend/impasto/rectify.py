"""Canvas rectification: find the canvas in a photo and warp it to a flat, scaled rectangle.

    uv run python -m impasto.rectify photo.jpg --size 110x140
    uv run python -m impasto.rectify photo.jpg --size 110x140 \
        --corners 20,60 1170,45 1185,1480 95,1495

Corners are found automatically from SAM's "painting" mask unless --corners
gives them (in photo pixels, any order). Scale comes from the canvas size the
artist enters, so every pixel of the rectified image is 1/px_per_cm cm on the
canvas. --white X,Y points at something white (paper next to the canvas, the
unpainted canvas side) to correct white balance and exposure. Writes
rectified.png, corners.png (corners and white patch drawn on the photo) and
rectify.json.
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
WHITE_PATCH_RADIUS = 8
# The white reference is mapped to this sRGB level in every channel, so photos
# from different days share both white balance and exposure.
TARGET_WHITE = 235


@dataclass
class WhiteBalance:
    point_px: tuple[float, float]
    measured_rgb: tuple[int, int, int]
    gains: tuple[float, float, float]


# No white to correct against: gains that leave a photo's colors as the camera saw them, once
# the readings scale TARGET_WHITE back up to 255.
_target = float((((TARGET_WHITE / 255.0) + 0.055) / 1.055) ** 2.4)
AS_SEEN = WhiteBalance(point_px=(0.0, 0.0), measured_rgb=(255, 255, 255), gains=(_target, _target, _target))


@dataclass
class Rectification:
    canvas_cm: tuple[float, float]
    px_per_cm: float
    corners_px: list[tuple[float, float]]
    corner_source: str
    homography: list[list[float]]
    white_balance: WhiteBalance | None
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
        raise ValueError("Couldn't find the canvas in the photo. Tap its 4 corners.")
    return quad_from_mask(np.logical_or.reduce(list(masks.values())))


def srgb_to_linear(values: np.ndarray) -> np.ndarray:
    values = values / 255.0
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    encoded = np.where(values <= 0.0031308, values * 12.92, 1.055 * values ** (1 / 2.4) - 0.055)
    return np.round(encoded * 255.0).astype(np.uint8)


def measure_white(
    image: np.ndarray, point: tuple[float, float], warnings: list[str]
) -> WhiteBalance:
    """Per-channel linear gains that map the patch around `point` to neutral TARGET_WHITE."""
    height, width = image.shape[:2]
    x, y = round(point[0]), round(point[1])
    if not (0 <= x < width and 0 <= y < height):
        raise ValueError(f"White point {point} is outside the {width}x{height} photo.")
    r = WHITE_PATCH_RADIUS
    patch = image[max(0, y - r) : y + r + 1, max(0, x - r) : x + r + 1].reshape(-1, 3)
    # Median ignores specks of dust or texture inside the patch.
    blue, green, red = np.median(patch, axis=0)
    measured = np.array([red, green, blue])
    if measured.max() >= 250:
        warnings.append("White reference is clipped (overexposed); the correction may be off.")
    if measured.min() < 80:
        warnings.append("White reference is dark; check that the point is on something white.")
    if measured.max() - measured.min() > 0.35 * measured.max():
        warnings.append("White reference looks strongly colored; check that the point is on something white.")
    gains = srgb_to_linear(np.full(3, TARGET_WHITE)) / np.maximum(srgb_to_linear(measured), 1e-6)
    return WhiteBalance(
        point_px=(float(point[0]), float(point[1])),
        measured_rgb=tuple(int(round(v)) for v in measured),
        gains=tuple(round(float(g), 4) for g in gains),
    )


def apply_white_balance(image: np.ndarray, white: WhiteBalance) -> np.ndarray:
    red, green, blue = white.gains
    linear = srgb_to_linear(image.astype(np.float64)) * np.array([blue, green, red])
    return linear_to_srgb(linear)


def rectify(
    image: np.ndarray,
    corners: np.ndarray,
    canvas_cm: tuple[float, float],
    px_per_cm: float = DEFAULT_PX_PER_CM,
    corner_source: str = "manual",
    white_point: tuple[float, float] | None = None,
) -> tuple[np.ndarray, Rectification]:
    """Warp the canvas to a flat rectangle and, given a white point, color-correct it.

    The white point is in photo pixels and can lie outside the canvas, e.g. on
    a sheet of paper next to it.
    """
    corners = order_corners(corners)
    width_cm, height_cm = canvas_cm
    out_w, out_h = round(width_cm * px_per_cm), round(height_cm * px_per_cm)
    target = np.array([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], dtype=np.float32)
    homography = cv2.getPerspectiveTransform(corners, target)
    warped = cv2.warpPerspective(image, homography, (out_w, out_h), flags=cv2.INTER_LINEAR)

    warnings: list[str] = []
    white = None
    if white_point is not None:
        white = measure_white(image, white_point, warnings)
        warped = apply_white_balance(warped, white)
        clipped = float((warped.max(axis=2) >= 254).mean())
        if clipped > 0.02:
            warnings.append(
                f"Color correction blows out {clipped:.0%} of the canvas: the white reference "
                "is darker than the paint, likely in shadow. Use something white in the same "
                "light as the canvas, e.g. paper held flat against its edge."
            )

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
        white_balance=white,
        warnings=warnings,
    )


def photo_to_canvas(
    points: list[tuple[float, float]], homography: list[list[float]]
) -> list[tuple[float, float]]:
    """Map photo pixels to rectified-canvas pixels."""
    mapped = cv2.perspectiveTransform(
        np.array(points, dtype=np.float64).reshape(-1, 1, 2), np.array(homography)
    )
    return [(float(x), float(y)) for x, y in mapped.reshape(-1, 2)]


def draw_corners(image: np.ndarray, info: Rectification) -> np.ndarray:
    drawn = image.copy()
    points = np.array(info.corners_px, dtype=np.int32)
    cv2.polylines(drawn, [points], isClosed=True, color=(0, 0, 255), thickness=4)
    for label, (x, y) in zip(("TL", "TR", "BR", "BL"), points):
        cv2.circle(drawn, (int(x), int(y)), 12, (0, 0, 255), -1)
        cv2.putText(
            drawn, label, (int(x) + 16, int(y) + 8), cv2.FONT_HERSHEY_SIMPLEX, 1.2,
            (0, 0, 255), 3,
        )
    if info.white_balance:
        x, y = (round(v) for v in info.white_balance.point_px)
        r = WHITE_PATCH_RADIUS
        cv2.rectangle(drawn, (x - r - 3, y - r - 3), (x + r + 3, y + r + 3), (255, 0, 0), 3)
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
    parser.add_argument(
        "--white", type=parse_point, metavar="X,Y",
        help="a point on something white (paper, unpainted canvas side) for color correction",
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

    warped, info = rectify(image, corners, args.size, args.px_per_cm, source, args.white)
    out = args.out or OUTPUT_ROOT / args.photo.stem
    out.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out / "rectified.png"), warped)
    cv2.imwrite(str(out / "corners.png"), draw_corners(image, info))
    (out / "rectify.json").write_text(json.dumps(asdict(info), indent=2) + "\n", encoding="utf-8")

    print(f"Corners ({source}): " + "  ".join(f"{x:.0f},{y:.0f}" for x, y in info.corners_px))
    print(f"Rectified to {info.output_size[0]}x{info.output_size[1]} px at {info.px_per_cm:g} px/cm")
    if info.white_balance:
        wb = info.white_balance
        print(f"White reference RGB {wb.measured_rgb} -> gains R/G/B {wb.gains}")
    else:
        print("No white reference: colors are as the phone captured them")
    for warning in info.warnings:
        print(f"Warning: {warning}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    asyncio.run(main())
