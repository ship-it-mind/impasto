"""Relief scan: recover a painting's surface from photos lit by a torch moved around it.

    uv run python -m impasto.relief_scan photo1.jpg ... photo5.jpg --out scan/
    uv run python -m impasto.relief_scan photos/*.jpg --corners 20,60 1170,45 1185,1480 95,1495

The phone stays still and only the light moves. Nobody measures where the torch
was, so it's read from the photos:

1. The paint's own color cancels out by dividing a pixel across the photos. What's
   left is lighting: a slow slope of brightness across the canvas, falling away from
   the torch, and fine shading from the relief.
2. The slow slope's direction says where the torch was in each photo.
3. With the lights known, each pixel's normal is solved on its own, setting aside
   highlights and shadows, and the normals are integrated into a height map.
4. To say whether it worked with no true surface to compare against, each photo is
   predicted from the others. A surface that's real predicts a photo it hasn't seen.

Height comes out in canvas pixels, and its overall scale is an estimate: the shape
of the relief is measured, its absolute depth isn't. Slow changes across the canvas
are removed, because a canvas is flat at that scale and torch falloff is not.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from impasto.rectify import linear_to_srgb, order_corners, parse_point, srgb_to_linear

MIN_PHOTOS = 4
MAX_SIDE = 1600
# Shading that changes more slowly than this share of the long side counts as torch falloff.
FALLOFF_SCALE = 0.06
CLIPPED = 250
DARK = 6
# The torch's height above the canvas plane. The photos can't say, and it sets only the
# relief's overall scale. The capture steps ask for about this.
ASSUMED_ELEVATION = 35.0
# Brightness slope across the canvas, in log units per canvas side, below which the torch's side can't be told.
FAINTEST_FALLOFF = 0.03
# How well a surface must predict a photo it hasn't seen before it's called a relief.
TRUSTED_PREDICTION = 0.5
LUMA = np.array([0.0722, 0.7152, 0.2126])  # BGR


register_heif_opener()  # iPhones save HEIC


class ReliefScanError(ValueError):
    """The photos can't give a relief; the message says what to do about it."""


@dataclass
class Quality:
    photos: int
    prediction: float  # correlation between each photo's shading and its prediction from the others
    moved_px: list[float]  # how far each photo was shifted to line it up with the first
    integrability: float  # share of the solved slopes that don't fit any surface: 0 is a true surface
    slope_median: float
    warnings: list[str] = field(default_factory=list)


@dataclass
class ReliefScan:
    height: np.ndarray  # H x W floats, in canvas pixels
    normals: np.ndarray  # H x W x 3, x right, y down, z toward the viewer
    albedo: np.ndarray  # H x W x 3 uint8 BGR: the paint with the torch's shading taken out
    light_azimuths: list[float]  # where the torch was: 0 = right, clockwise on screen, as in the renderer
    quality: Quality


def read_photo(path: Path) -> np.ndarray:
    """A phone photo as BGR, the right way up."""
    with Image.open(path) as image:
        return np.asarray(ImageOps.exif_transpose(image).convert("RGB"))[..., ::-1].copy()


def fit_size(image: np.ndarray, max_side: int) -> np.ndarray:
    scale = max_side / max(image.shape[:2])
    if scale >= 1:
        return image
    return cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def _edges(image: np.ndarray) -> np.ndarray:
    """Where the paint's edges are: a ridge's bright side flips with the light, its edge doesn't."""
    gray = np.log(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32) + 8.0)
    smooth = cv2.GaussianBlur(gray, (0, 0), 1.0)
    return cv2.GaussianBlur(cv2.magnitude(cv2.Sobel(smooth, cv2.CV_32F, 1, 0), cv2.Sobel(smooth, cv2.CV_32F, 0, 1)), (0, 0), 2.0)


def line_up(photos: list[np.ndarray]) -> tuple[list[np.ndarray], list[float]]:
    """Shift each photo onto the first. Shifts only: with light this different, anything freer drifts."""
    reference = _edges(photos[0])
    height, width = photos[0].shape[:2]
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5)
    lined_up, moved = [photos[0]], [0.0]
    for photo in photos[1:]:
        warp = np.eye(2, 3, dtype=np.float32)
        try:
            _, warp = cv2.findTransformECC(reference, _edges(photo), warp, cv2.MOTION_TRANSLATION, criteria, None, 5)
        except cv2.error:
            warp = np.eye(2, 3, dtype=np.float32)
        moved.append(round(float(np.hypot(warp[0, 2], warp[1, 2])), 1))
        lined_up.append(cv2.warpAffine(photo, warp, (width, height), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE))
    return lined_up, moved


def crop_to_canvas(photos: list[np.ndarray], corners: np.ndarray) -> list[np.ndarray]:
    """Warp the photos to a flat canvas; corners are in the first photo's pixels."""
    corners = order_corners(corners)
    top, right, bottom, left = (np.linalg.norm(corners[(i + 1) % 4] - corners[i]) for i in range(4))
    width, height = round((top + bottom) / 2), round((left + right) / 2)
    target = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
    homography = cv2.getPerspectiveTransform(corners, target)
    return [cv2.warpPerspective(photo, homography, (width, height), flags=cv2.INTER_LINEAR) for photo in photos]


def _plane_gradient(image: np.ndarray, step: int) -> np.ndarray:
    """Least-squares slope of a blurred image, per canvas width, as (x, y)."""
    sample = image[::step, ::step]
    rows, cols = sample.shape
    long_side = max(rows, cols)
    ys, xs = np.mgrid[0:rows, 0:cols]
    design = np.stack([xs.ravel() / long_side, ys.ravel() / long_side, np.ones(rows * cols)], axis=1)
    coefficients, *_ = np.linalg.lstsq(design, sample.ravel(), rcond=None)
    return coefficients[:2]


def _falloff_gradients(falloff: np.ndarray) -> np.ndarray:
    """The slope of each photo's brightness across the canvas: it points at the torch."""
    step = max(1, max(falloff.shape[1:]) // 200)
    return np.stack([_plane_gradient(photo, step) for photo in falloff])


def _shading(log_luma: np.ndarray, usable: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-photo shading detail and slow falloff, with the paint's color divided out."""
    weights = usable.astype(np.float32)
    mean = (log_luma * weights).sum(0) / np.maximum(weights.sum(0), 1.0)
    shading = np.where(usable, log_luma - mean, 0.0)
    sigma = max(log_luma.shape[1:]) * FALLOFF_SCALE
    falloff = np.stack([cv2.GaussianBlur(s, (0, 0), sigma) for s in shading])
    return shading - falloff, falloff


def lights_from_falloff(falloff: np.ndarray) -> np.ndarray:
    """Each photo's light as (lx/lz, ly/lz). Its direction is measured, its slant assumed."""
    gradients = _falloff_gradients(falloff)
    gradients = gradients - gradients.mean(0)
    sizes = np.linalg.norm(gradients, axis=1, keepdims=True)
    if float(np.median(sizes)) < FAINTEST_FALLOFF:
        raise ReliefScanError(
            "Can't tell where the torch was: the photos are lit about the same. "
            "Darken the room and bring the torch closer, moving it around the canvas between photos."
        )
    return gradients / np.maximum(sizes, 1e-9) / np.tan(np.radians(ASSUMED_ELEVATION))


def lights_from_azimuths(azimuths: list[float]) -> np.ndarray:
    radians = np.radians(azimuths)
    return np.stack([np.cos(radians), np.sin(radians)], axis=1) / np.tan(np.radians(ASSUMED_ELEVATION))


def prediction_score(detail: np.ndarray, lights: np.ndarray) -> float:
    """How well the other photos predict each photo's shading, as a median correlation.

    A check the scan can run on real photos, with no true surface to compare against. It
    catches wrong lights, a moved phone and photos that aren't lit as they should be. It
    can't catch a relief that's inside out throughout, since that predicts just as well.
    """
    count = detail.shape[0]
    step = max(1, max(detail.shape[1:]) // 500)
    # Blur first: a pixel's noise shouldn't count as failing to predict it.
    small = np.stack([cv2.GaussianBlur(d, (0, 0), max(1.0, step / 2))[::step, ::step] for d in detail])
    flat = np.clip(small.reshape(count, -1), -0.7, 0.7)
    scores = []
    for k in range(count):
        others = np.delete(np.arange(count), k)
        slopes, *_ = np.linalg.lstsq(-lights[others], flat[others], rcond=None)
        predicted = -lights[k] @ slopes
        scores.append(float(np.corrcoef(predicted, flat[k])[0, 1]))
    return float(np.median(np.nan_to_num(scores)))


def _solve_normals(
    log_luma: np.ndarray, falloff: np.ndarray, lights: np.ndarray, usable: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per pixel: shading = w (1 - ax p - ay q), reweighted so highlights and shadows drop out.

    Returns slopes p, q and the shading each photo should show there.
    """
    count, height, width = log_luma.shape
    shade = np.exp(log_luma - falloff)
    design = np.stack([np.ones(count), -lights[:, 0], -lights[:, 1]], axis=1).astype(np.float32)
    weights = usable.astype(np.float32).reshape(count, -1)
    measured = shade.reshape(count, -1).astype(np.float32)
    solution = np.zeros((3, height * width), dtype=np.float32)
    for _ in range(4):
        # Normal equations, one small system per pixel.
        ata = np.einsum("kp,ki,kj->pij", weights, design, design, optimize=True) + 1e-4 * np.eye(3, dtype=np.float32)
        atb = np.einsum("kp,ki,kp->pi", weights, design, measured, optimize=True)
        solution = np.linalg.solve(ata, atb[..., None])[..., 0].T
        predicted = design @ solution
        residual = (measured - predicted) / np.maximum(np.abs(solution[0]), 1e-4)
        # A tenth brighter or a quarter darker than a matte surface should be is a highlight or
        # a cast shadow. Weights stay soft, so a pixel never loses every photo at once.
        trust = np.where(residual > 0, np.exp(-((residual / 0.12) ** 2)), np.exp(-((residual / 0.3) ** 2)))
        weights = usable.astype(np.float32).reshape(count, -1) * np.maximum(trust, 0.02)
    w = np.where(np.abs(solution[0]) < 1e-4, 1e-4, solution[0])
    p = (solution[1] / w).reshape(height, width)
    q = (solution[2] / w).reshape(height, width)
    # Slopes this steep are noise on a painted surface, not paint.
    p, q = np.clip(p, -3.0, 3.0), np.clip(q, -3.0, 3.0)
    shading = (design @ np.vstack([np.ones_like(w), p.ravel(), q.ravel()])).reshape(count, height, width)
    return p, q, shading


def integrate(p: np.ndarray, q: np.ndarray, flat_scale: float = 0.25) -> np.ndarray:
    """Least-squares height from slopes (Frankot-Chellappa on a mirrored canvas).

    Detail wider than `flat_scale` of the long side fades out: that far, the slopes
    are mostly leftover falloff rather than paint.
    """
    height, width = p.shape
    p_mirror = np.block([[p, -p[:, ::-1]], [p[::-1], -p[::-1, ::-1]]])
    q_mirror = np.block([[q, q[:, ::-1]], [-q[::-1], -q[::-1, ::-1]]])
    p_hat, q_hat = np.fft.rfft2(p_mirror), np.fft.rfft2(q_mirror)
    wx = 2 * np.pi * np.fft.rfftfreq(2 * width)[None, :]
    wy = 2 * np.pi * np.fft.fftfreq(2 * height)[:, None]
    power = wx**2 + wy**2
    power[0, 0] = 1.0
    z_hat = (-1j * wx * p_hat - 1j * wy * q_hat) / power
    z_hat[0, 0] = 0.0
    cutoff = 2 * np.pi / (flat_scale * max(height, width))
    z_hat *= power / (power + cutoff**2)
    return np.fft.irfft2(z_hat, s=(2 * height, 2 * width))[:height, :width].astype(np.float32)


def _measure(stack: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    linear = srgb_to_linear(stack).astype(np.float32)
    luma = (linear * LUMA.astype(np.float32)).sum(axis=3)
    usable = (stack.max(axis=3) < CLIPPED) & (stack.max(axis=3) > DARK)
    return linear, np.log(np.maximum(luma, 1e-4)), usable


def _solve(photos: list[np.ndarray], azimuths: list[float] | None) -> dict:
    stack = np.stack(photos).astype(np.float32)
    linear, log_luma, usable = _measure(stack)
    detail, falloff = _shading(log_luma, usable)
    lights = lights_from_azimuths(azimuths) if azimuths is not None else lights_from_falloff(falloff)
    return {
        "stack": stack, "linear": linear, "log_luma": log_luma, "usable": usable, "falloff": falloff,
        "lights": lights, "prediction": prediction_score(detail, lights),
    }


def scan(
    photos: list[np.ndarray],
    corners: np.ndarray | None = None,
    max_side: int = MAX_SIDE,
    azimuths: list[float] | None = None,
) -> ReliefScan:
    """Photos are BGR uint8, one light each, from one camera position.

    `azimuths` says where the torch was in each photo (degrees, 0 = right, clockwise on
    screen), when known; otherwise it's read off the brightness. Corners are in the
    first photo's pixels.
    """
    if len(photos) < MIN_PHOTOS:
        raise ReliefScanError(f"Need at least {MIN_PHOTOS} photos with the torch in different places; got {len(photos)}.")
    if any(photo.shape != photos[0].shape for photo in photos):
        raise ReliefScanError("The photos are different sizes. Take them all with the same camera settings.")
    if azimuths is not None and len(azimuths) != len(photos):
        raise ReliefScanError(f"Got {len(azimuths)} torch positions for {len(photos)} photos.")
    if corners is not None:
        photos = crop_to_canvas(photos, corners)
    photos = [fit_size(photo, max_side) for photo in photos]
    warnings: list[str] = []

    # Lining up only stays if it helps: a shift found from edges can also make things worse.
    solved = _solve(photos, azimuths)
    moved = [0.0] * len(photos)
    shifted, shifts = line_up(photos)
    if max(shifts) > 0.5:
        attempt = _solve(shifted, azimuths)
        if attempt["prediction"] > solved["prediction"]:
            solved, moved = attempt, shifts

    stack, linear, log_luma, usable, falloff, lights = (solved[key] for key in ("stack", "linear", "log_luma", "usable", "falloff", "lights"))
    p, q, shading = _solve_normals(log_luma, falloff, lights, usable)

    if max(moved) > 0.03 * max(photos[0].shape[:2]):
        warnings.append("The phone moved between photos. Rest it on something and move only the torch.")
    clipped_share = float((stack.max(axis=3) >= CLIPPED).mean())
    if clipped_share > 0.05:
        warnings.append(f"{clipped_share:.0%} of the pixels are overexposed. Move the torch further off, or lower the exposure.")
    if float((usable.sum(0) < 3).mean()) > 0.1:
        warnings.append("Over a tenth of the canvas is too dark or too bright in most photos, and comes out flat there.")
    if solved["prediction"] < TRUSTED_PREDICTION:
        warnings.append(
            "Don't trust this relief: the photos don't agree with one surface. The phone may have moved, "
            "the room light may have changed, or the torch may not have gone around the canvas."
        )

    z = integrate(p, q)
    zx, zy = np.gradient(z, axis=1), np.gradient(z, axis=0)
    norm = np.sqrt(zx**2 + zy**2 + 1)
    normals = np.stack([-zx / norm, -zy / norm, 1 / norm], axis=2)
    # Whatever of the solved slopes doesn't integrate wasn't a surface.
    integrability = float(np.sqrt(np.mean((p - zx) ** 2 + (q - zy) ** 2) / max(np.mean(p**2 + q**2), 1e-9)))

    # Paint color: each photo with its torch falloff and shading divided out, then the median,
    # so a highlight in one photo leaves no mark.
    albedo_linear = linear / np.maximum(np.exp(falloff) * np.maximum(shading, 0.2), 1e-3)[..., None]
    albedo_linear = np.where(usable[..., None], albedo_linear, np.nan)
    paint = np.nan_to_num(np.nanmedian(albedo_linear, axis=0), nan=0.0)
    paint = paint / max(float(np.percentile(paint, 99.5)), 1e-6) * 0.9

    found = np.degrees(np.arctan2(lights[:, 1], lights[:, 0])) % 360
    return ReliefScan(
        height=z,
        normals=normals.astype(np.float32),
        albedo=linear_to_srgb(paint),
        light_azimuths=[round(float(a), 1) for a in found],
        quality=Quality(
            photos=len(photos),
            prediction=round(solved["prediction"], 3),
            moved_px=moved,
            integrability=round(integrability, 3),
            slope_median=round(float(np.median(np.hypot(zx, zy))), 3),
            warnings=warnings,
        ),
    )


def height_png(height: np.ndarray) -> tuple[np.ndarray, tuple[float, float]]:
    """16-bit grayscale height map and the range it spans, for a textured print or a viewer."""
    low, high = (float(v) for v in np.percentile(height, (0.2, 99.8)))
    scaled = np.clip((height - low) / max(high - low, 1e-6), 0.0, 1.0)
    return np.round(scaled * 65535).astype(np.uint16), (low, high)


def relit(scan_result: ReliefScan, azimuth_deg: float, elevation_deg: float = 38.0, gloss: float = 0.0) -> np.ndarray:
    """The painting under one distant light, as BGR uint8."""
    az, el = np.radians(azimuth_deg), np.radians(elevation_deg)
    light = np.array([np.cos(az) * np.cos(el), np.sin(az) * np.cos(el), np.sin(el)], dtype=np.float32)
    diffuse = np.maximum(scan_result.normals @ light, 0.0) / light[2]
    half = light + np.array([0, 0, 1], dtype=np.float32)
    half /= np.linalg.norm(half)
    shine = np.maximum(scan_result.normals @ half, 0.0) ** 32 * gloss
    paint = srgb_to_linear(scan_result.albedo.astype(np.float32))
    return linear_to_srgb(paint * (0.28 + 0.72 * diffuse)[..., None] + shine[..., None])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photos", type=Path, nargs="+")
    parser.add_argument("--corners", type=parse_point, nargs=4, metavar="X,Y", help="canvas corners in the first photo's pixels")
    parser.add_argument("--azimuths", type=float, nargs="+", help="where the torch was in each photo, degrees: 0 = right, 90 = below, clockwise")
    parser.add_argument("--out", type=Path, default=Path("output/relief_scan"))
    args = parser.parse_args()

    photos = [read_photo(path) for path in args.photos]
    corners = np.array(args.corners, dtype=np.float32) if args.corners else None
    try:
        result = scan(photos, corners, azimuths=args.azimuths)
    except ReliefScanError as error:
        raise SystemExit(str(error)) from error

    args.out.mkdir(parents=True, exist_ok=True)
    height16, span = height_png(result.height)
    cv2.imwrite(str(args.out / "height.png"), height16)
    cv2.imwrite(str(args.out / "albedo.png"), result.albedo)
    normals_bgr = ((result.normals[..., ::-1] * np.array([1, -1, 1], dtype=np.float32) + 1) * 127.5).astype(np.uint8)
    cv2.imwrite(str(args.out / "normals.png"), normals_bgr)
    for azimuth in (225, 45):
        cv2.imwrite(str(args.out / f"relit-{azimuth}.png"), relit(result, azimuth))
    summary = {"height_px": span, "light_azimuths": result.light_azimuths, "quality": asdict(result.quality)}
    (args.out / "scan.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
