"""Band layout from a Muse Image painting: which band each part of the canvas is, and which way the knife runs.

    uv run python -m impasto.layout painting.webp --colors "#E8DCC8,#C9A27E,#8C6F5A" --size 1000x750 --out bands.png

Muse paints the concept from its spec, but its colors drift from the hex it
was asked for and it doesn't take a size. So the painting is center-cropped to
the canvas's proportions, its knife texture smoothed away, and its colors
clustered: one group per band, started from the band's asked-for color, plus
a few spare groups for the shadows and highlights of thick paste, which then
join the band nearest in color. That keeps the band count and order the recipe
relies on.
Specks and slivers smaller than MIN_ISLAND are merged into the band around
them. The knife runs along the bands: the direction is read from the band
edges (and, more weakly, the painting's own stroke texture) as a structure
tensor, smoothed far enough to reach into the middle of each band.

The result is one PNG at the canvas size: red = band index, green = stroke
angle (0–255 for 0–180°, x right, y down). The relief preview paints from it,
the recipe measures band areas on it, and check-ins measure against it.
A layout is refused (and the concept keeps its drawn geometry) when a band
ends up with less than MIN_SHARE of the canvas (Muse left it out or merged it),
or when the bands come out blotchy: a band in more than MAX_PIECES pieces, or
band edges more than MAX_RAGGED times as long as clean edges across the canvas
would be. Ridge shadows on tonal, near-white paste do that.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from impasto.color import hex_to_rgb, rgb_to_lab

# Knife texture and highlights to smooth over before reading colors, as a share of the long side.
SMOOTH = 0.012
# Each band's mask is blurred this much before the per-pixel vote, so edges come out clean.
VOTE_BLUR = 0.008
# Specks smaller than this share of the canvas join the band around them.
MIN_ISLAND = 0.004
# A band with less than this share of the canvas means the layout failed, as do blotchy bands.
MIN_SHARE = 0.02
MAX_PIECES = 6
MAX_RAGGED = 2.5
# Stroke direction is averaged over this share of the long side; texture counts for TEXTURE_WEIGHT of it.
ANGLE_BLUR = 0.08
TEXTURE_WEIGHT = 0.25
KMEANS_SAMPLE = 40_000
# Spare color groups for ridge shadows and highlights; lightness counts for this much when joining them to bands.
SPARE_GROUPS = 3
SPARE_L_WEIGHT = 0.4


@dataclass
class Layout:
    bands: np.ndarray  # uint8 band index per pixel
    angle: np.ndarray  # float32 stroke direction per pixel, radians in [0, π)
    shares: list[float]
    # How far (ΔE76) each matched color group sits from its band's asked-for color.
    color_de: list[float]
    pieces: list[int]
    # Band edge length per band boundary, in canvas diagonals: about 1 for clean bands.
    ragged: float


def crop_to(image: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    """Center-crop to the canvas's proportions, then scale to its pixel size."""
    width, height = size
    h, w = image.shape[:2]
    if w / h > width / height:
        crop = round(h * width / height)
        image = image[:, (w - crop) // 2 : (w - crop) // 2 + crop]
    else:
        crop = round(w * height / width)
        image = image[(h - crop) // 2 : (h - crop) // 2 + crop]
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA)


def lab_image(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def nearest(points: np.ndarray, centers: np.ndarray, weights: np.ndarray | None = None) -> np.ndarray:
    diff = points[:, None, :] - centers[None, :, :]
    if weights is not None:
        diff = diff * weights
    return np.einsum("ijk,ijk->ij", diff, diff).argmin(axis=1)


def cluster(sample: np.ndarray, targets: np.ndarray, spares: int, rounds: int = 30) -> np.ndarray:
    """k-means in Lab: the first groups start at the bands' colors, the spares at the farthest-off samples."""
    centers = list(targets)
    for _ in range(spares):
        distance = np.min(np.linalg.norm(sample[:, None, :] - np.array(centers)[None, :, :], axis=2), axis=1)
        centers.append(sample[distance.argmax()])
    centers = np.array(centers, dtype=np.float32)
    for _ in range(rounds):
        labels = nearest(sample, centers)
        for k in range(len(centers)):
            if (labels == k).any():
                centers[k] = sample[labels == k].mean(axis=0)
    return centers


def group_bands(centers: np.ndarray, targets: np.ndarray) -> np.ndarray:
    """Band for each color group: band groups keep their band, spares join the band nearest in color,
    with lightness weighted down (a ridge's shadow is a darker version of its band)."""
    n = len(targets)
    weights = np.array([SPARE_L_WEIGHT, 1, 1], dtype=np.float32)
    spares = nearest(centers[n:], centers[:n], weights) if len(centers) > n else np.array([], int)
    return np.concatenate([np.arange(n), spares]).astype(np.uint8)


def vote(labels: np.ndarray, n: int, sigma: float) -> np.ndarray:
    """Each pixel takes the band that is most present around it: clean edges, no salt and pepper."""
    scores = np.stack([cv2.GaussianBlur((labels == b).astype(np.float32), (0, 0), sigma) for b in range(n)])
    return scores.argmax(axis=0).astype(np.uint8)


def merge_islands(labels: np.ndarray, n: int, min_px: int) -> np.ndarray:
    """Small patches take the band they are surrounded by."""
    labels = labels.copy()
    kernel = np.ones((3, 3), np.uint8)
    for _ in range(3):  # merging can leave a patch that is itself small; a few passes settle it
        changed = False
        for band in range(n):
            count, components, stats, _ = cv2.connectedComponentsWithStats((labels == band).astype(np.uint8), connectivity=8)
            for c in range(1, count):
                if stats[c, cv2.CC_STAT_AREA] >= min_px:
                    continue
                patch = components == c
                ring = cv2.dilate(patch.astype(np.uint8), kernel) > 0
                around = labels[ring & ~patch]
                around = around[around != band]
                if around.size:
                    labels[patch] = np.bincount(around, minlength=n).argmax()
                    changed = True
        if not changed:
            break
    return labels


def tensor(fields: list[np.ndarray]) -> np.ndarray:
    """Summed structure tensor (Jxx, Jyy, Jxy) of the fields, normalized to unit mean strength."""
    total = np.zeros((3, *fields[0].shape), np.float32)
    for field in fields:
        gx = cv2.Sobel(field, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(field, cv2.CV_32F, 0, 1, ksize=3)
        total += np.stack([gx * gx, gy * gy, gx * gy])
    return total / max(float((total[0] + total[1]).mean()), 1e-9)


def stroke_angle(image: np.ndarray, labels: np.ndarray, n: int, sigma: float) -> np.ndarray:
    """Local stroke direction: along the band edges nearby, and along the painting's own ridges."""
    edges = tensor([cv2.GaussianBlur((labels == b).astype(np.float32), (0, 0), 2) for b in range(n)])
    texture = tensor([cv2.GaussianBlur(lab_image(image)[..., 0], (0, 0), 1.5)])
    jxx, jyy, jxy = (cv2.GaussianBlur(c, (0, 0), sigma) for c in edges + TEXTURE_WEIGHT * texture)
    across = 0.5 * np.arctan2(2 * jxy, jxx - jyy)
    return np.mod(across + np.pi / 2, np.pi).astype(np.float32)


def read_layout(painting: np.ndarray, colors: list[str], size: tuple[int, int]) -> Layout:
    """The band layout of a painting of `colors` (the spec's bands, in order), at the canvas size."""
    image = crop_to(painting, size)
    long_side = max(size)
    n = len(colors)
    smooth = cv2.bilateralFilter(cv2.medianBlur(image, (round(SMOOTH * long_side) | 1)), 9, 40, 9)
    lab = lab_image(smooth).reshape(-1, 3)

    rng = np.random.default_rng(0)
    sample = lab[rng.choice(len(lab), min(KMEANS_SAMPLE, len(lab)), replace=False)]
    targets = np.array([rgb_to_lab(hex_to_rgb(c)) for c in colors], dtype=np.float32)
    centers = cluster(sample, targets, SPARE_GROUPS)

    # Every pixel to its nearest color group, then group → band.
    labels = group_bands(centers, targets)[nearest(lab, centers)].reshape(size[1], size[0])
    labels = vote(labels, n, VOTE_BLUR * long_side)
    labels = merge_islands(labels, n, round(MIN_ISLAND * size[0] * size[1]))

    counts = np.bincount(labels.ravel(), minlength=n)
    edges = cv2.morphologyEx(labels, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    # Each edge is two pixels wide in the gradient.
    ragged = float(edges.sum()) / 2 / np.hypot(*size) / max(n - 1, 1)
    return Layout(
        bands=labels,
        angle=stroke_angle(image, labels, n, ANGLE_BLUR * long_side),
        shares=[round(float(c) / labels.size, 4) for c in counts],
        color_de=[round(float(np.linalg.norm(centers[b] - targets[b])), 1) for b in range(n)],
        pieces=[cv2.connectedComponents((labels == b).astype(np.uint8))[0] - 1 for b in range(n)],
        ragged=round(ragged, 2),
    )


def problems(layout: Layout, names: list[str]) -> list[str]:
    found = [f"band {name!r} covers only {share:.1%} of the painting" for name, share in zip(names, layout.shares) if share < MIN_SHARE]
    found += [f"band {name!r} is in {pieces} pieces" for name, pieces in zip(names, layout.pieces) if pieces > MAX_PIECES]
    if layout.ragged > MAX_RAGGED:
        found.append(f"the band edges are {layout.ragged:.1f}× as long as clean bands' would be")
    return found


def write_layout(layout: Layout, path: Path) -> None:
    """Red = band index, green = stroke angle (0–255 for 0–180°), blue unused."""
    angle = np.round(layout.angle / np.pi * 255).astype(np.uint8)
    rgb = np.dstack([layout.bands, angle, np.zeros_like(angle)])
    cv2.imwrite(str(path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))


def draw_layout(layout: Layout, colors: list[str], spacing: int = 28) -> np.ndarray:
    """The layout in the bands' colors, with short ticks along the stroke direction: for checking by eye."""
    palette = np.array([hex_to_rgb(c)[::-1] for c in colors], dtype=np.uint8)
    drawn = palette[layout.bands].copy()
    edges = cv2.morphologyEx(layout.bands, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    drawn[edges] = (40, 40, 40)
    height, width = layout.bands.shape
    for y in range(spacing // 2, height, spacing):
        for x in range(spacing // 2, width, spacing):
            a = float(layout.angle[y, x])
            dx, dy = np.cos(a) * spacing * 0.4, np.sin(a) * spacing * 0.4
            cv2.line(drawn, (round(x - dx), round(y - dy)), (round(x + dx), round(y + dy)), (60, 60, 60), 1, cv2.LINE_AA)
    return drawn


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("painting", type=Path)
    parser.add_argument("--colors", required=True, help="the bands' hex colors in spec order, comma-separated")
    parser.add_argument("--size", required=True, help="canvas WIDTHxHEIGHT in pixels")
    parser.add_argument("--out", type=Path, required=True, help="layout PNG; a -check.png for the eye is written beside it")
    args = parser.parse_args()

    painting = cv2.imread(str(args.painting))
    if painting is None:
        parser.error(f"Can't read {args.painting}")
    colors = args.colors.split(",")
    width, height = (int(v) for v in args.size.lower().split("x"))
    layout = read_layout(painting, colors, (width, height))
    write_layout(layout, args.out)
    cv2.imwrite(str(args.out.with_name(args.out.stem + "-check.png")), draw_layout(layout, colors))
    for color, share, de in zip(colors, layout.shares, layout.color_de):
        print(f"{color}  {share:6.1%} of the canvas  matched at ΔE {de:.0f}")
    for problem in problems(layout, colors):
        print(f"⚠️  {problem}")


if __name__ == "__main__":
    main()
