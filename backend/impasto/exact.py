"""Paint a picture as it is: one plan read straight off the picture, with nothing invented.

    uv run python -m impasto.exact picture.jpg --size 1000x750 --out folder

A style picture only steers new concepts. An exact picture is the concept: its
colors and shapes are measured here, and no image is generated. It is first cut
to the canvas: straightened from the painting's four corners when the painter
marks them (a photo of a painting shows the floor around it too), otherwise
center-cropped to the canvas's shape. Its colors are then clustered, with shades
close enough to be one paint (knife ridges and their shadows, above all) merged
into one, up to MAX_COLORS. impasto.layout maps them, as it does Muse's
paintings. Muse Spark only puts words on what was measured: each color's name,
where it sits and how thick the paste looks.

The colors don't follow each other in any order, so a band may border any other
and sit in many pieces. A busy picture is still painted from MAX_COLORS mixes,
so it comes with a note saying so.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from impasto import layout as layouts
from impasto.color import hex_to_rgb, rgb_to_hex, rgb_to_lab
from impasto.concepts import ALL_FLOWS, MODEL, canvas_px, strict_object
from impasto.meta import client, data_url
from impasto.rectify import rectify
from impasto.volume import LEVELS

MAX_COLORS = 8
# Color groups to start from, before merging down.
START_GROUPS = 16
# Shades closer than this (ΔE76) count as one paint. Kept low: an extra mix costs little, but two
# neighboring colors lumped together paint the wrong color.
SAME_PAINT_DE = 6.0
# A color on less of the canvas than this isn't worth a mix of its own.
MIN_SHARE = 0.005
# Cropping less than this share of the picture to fit the canvas isn't worth mentioning.
NOTABLE_CROP = 0.02
# Not a regular flow: the colors sit wherever the picture has them.
FREEFORM = "freeform"
IMAGE = "concept-1-exact.png"
MAP = "concept-1-layout.png"

PROMPT = """You are the studio assistant of a palette-knife / impasto painter, who is going to paint the attached
picture as it is. Its colors have already been measured, listed below with the share of the canvas each covers and
its average position (x and y from 0 at the top left to 1 at the bottom right).

Write:
- title: the picture's subject in a few plain words. idea: one sentence describing the picture.
- flow: how the shapes run, if they follow one of these regular layouts:
{flows}
  Otherwise {freeform}.
- colors: one entry per measured color, in the same order:
  - name: a short color name a painter would use. Every name different.
  - where: where this color sits in the picture and what shape it takes, in a few words.
  - relief: how thick the paste looks there ({levels}). With no visible paste, as in a photo or a
    flat print, use thin for backgrounds and fine areas and medium for the main shapes.

Measured colors:
{colors}
"""


def picture_schema() -> dict:
    color = strict_object({
        "name": {"type": "string"},
        "where": {"type": "string"},
        "relief": {"type": "string", "enum": list(LEVELS)},
    })
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "picture",
            "schema": strict_object({
                "title": {"type": "string"},
                "idea": {"type": "string"},
                "flow": {"type": "string", "enum": [*ALL_FLOWS, FREEFORM]},
                "colors": {"type": "array", "items": color},
            }),
        },
    }


def merge_shades(centers: np.ndarray, sizes: np.ndarray) -> np.ndarray:
    """Join the closest color groups until the rest are different paints and at most MAX_COLORS are left."""
    centers, sizes = list(centers), [float(size) for size in sizes]
    while len(centers) > 1:
        points = np.array(centers)
        gaps = np.linalg.norm(points[:, None] - points[None, :], axis=2)
        np.fill_diagonal(gaps, np.inf)
        a, b = sorted(np.unravel_index(gaps.argmin(), gaps.shape))
        if gaps[a, b] > SAME_PAINT_DE and len(centers) <= MAX_COLORS:
            break
        total = sizes[a] + sizes[b]
        centers[a] = (centers[a] * sizes[a] + centers[b] * sizes[b]) / max(total, 1)
        sizes[a] = total
        del centers[b], sizes[b]
    return np.array(centers, dtype=np.float32)


def lab_to_hex(lab: np.ndarray) -> str:
    bgr = cv2.cvtColor(lab.reshape(1, 1, 3).astype(np.float32), cv2.COLOR_LAB2BGR)[0, 0]
    return rgb_to_hex(tuple(int(round(min(max(float(v), 0.0), 1.0) * 255)) for v in bgr[::-1]))


def picture_colors(image: np.ndarray) -> list[str]:
    """The picture's distinct paints as hex colors, read with its knife texture smoothed away."""
    lab = layouts.lab_image(layouts.smoothed(image)).reshape(-1, 3)
    rng = np.random.default_rng(0)
    sample = lab[rng.choice(len(lab), min(layouts.KMEANS_SAMPLE, len(lab)), replace=False)].astype(np.float32)
    cv2.setRNGSeed(0)  # the same picture gives the same plan
    stop = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.2)
    _, labels, centers = cv2.kmeans(sample, START_GROUPS, None, stop, 3, cv2.KMEANS_PP_CENTERS)
    sizes = np.bincount(labels.ravel(), minlength=START_GROUPS)
    return [lab_to_hex(center) for center in merge_shades(centers[sizes > 0], sizes[sizes > 0])]


def read_picture(image: np.ndarray, size: tuple[int, int]) -> tuple[list[str], layouts.Layout]:
    """The colors of a picture already cut to the canvas, biggest first, and where each one is."""
    colors = picture_colors(image)
    while True:
        layout = layouts.read_layout(image, colors, size, ordered=False)
        # A color that lost out to its neighbors, or barely shows: map again without it.
        if len(colors) == 1 or min(layout.shares) >= MIN_SHARE:
            break
        del colors[int(np.argmin(layout.shares))]

    # Each band's color as it came out on the canvas, in the order of how much of it there is.
    smooth = layouts.smoothed(image)
    order = sorted(range(len(colors)), key=lambda b: -layout.shares[b])
    colors = [rgb_to_hex(tuple(int(v) for v in np.median(smooth[layout.bands == b], axis=0)[::-1])) for b in order]
    rank = np.zeros(len(order), np.uint8)
    rank[order] = np.arange(len(order), dtype=np.uint8)
    layout.bands = rank[layout.bands]
    layout.shares = [layout.shares[b] for b in order]
    layout.color_de = [layout.color_de[b] for b in order]
    layout.pieces = [layout.pieces[b] for b in order]
    return colors, layout


def positions(layout: layouts.Layout) -> list[tuple[float, float]]:
    """Each band's average position on the canvas, from 0 at the top left to 1 at the bottom right."""
    height, width = layout.bands.shape
    found = []
    for b in range(len(layout.shares)):
        ys, xs = np.nonzero(layout.bands == b)
        found.append((float(xs.mean()) / width, float(ys.mean()) / height))
    return found


def describe(path: Path, colors: list[str], layout: layouts.Layout) -> dict:
    """Spark's words on what was measured: the title, the flow, and each color's name, place and relief."""
    listed = "\n".join(
        f"{i}. {color}, {share:.0%} of the canvas, around x {x:.2f}, y {y:.2f}"
        for i, (color, share, (x, y)) in enumerate(zip(colors, layout.shares, positions(layout)), start=1)
    )
    prompt = PROMPT.format(
        flows="\n".join(f"  - {flow}" for flow in ALL_FLOWS), freeform=FREEFORM, levels=" / ".join(LEVELS), colors=listed,
    )
    response = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": data_url(path)}},
        ]}],
        response_format=picture_schema(),
    )
    described = json.loads(response.choices[0].message.content)
    if len(described["colors"]) != len(colors):
        raise RuntimeError(f"Spark described {len(described['colors'])} colors of {len(colors)} (response {response.id}).")
    return {**described, "prompt": prompt}


def crop_note(picture: np.ndarray, size: tuple[int, int]) -> str | None:
    h, w = picture.shape[:2]
    ratio = (w / h) / (size[0] / size[1])
    cropped = 1 - min(ratio, 1 / ratio)
    if cropped < NOTABLE_CROP:
        return None
    sides = "left and right" if ratio > 1 else "top and bottom"
    return f"The picture isn't the canvas's shape, so {cropped:.0%} of it is cropped off its {sides}."


def busy_note(layout: layouts.Layout) -> str | None:
    if max(layout.pieces) <= layouts.MAX_PIECES and layout.ragged <= layouts.MAX_RAGGED:
        return None
    return f"This picture has a lot of small shapes. The plan paints it from {len(layout.shares)} mixes, so its fine detail is yours to add by eye."


def draft(brief: dict | None, path: Path, folder: Path, corners: list[tuple[float, float]] | None = None) -> dict:
    """The one concept for this picture, in the shape concepts.draft and concepts.paint leave theirs."""
    picture = cv2.imread(str(path))
    if picture is None:
        raise RuntimeError("Couldn't read this picture.")
    size = canvas_px(brief)
    notes: list[str] = []
    if corners:
        image, straightened = rectify(picture, np.array(corners, dtype=np.float32), size, px_per_cm=1.0)
        notes += straightened.warnings
    else:
        image = layouts.crop_to(picture, size)
        notes.append(crop_note(picture, size))
    cv2.imwrite(str(folder / IMAGE), image)

    colors, layout = read_picture(image, size)
    described = describe(folder / IMAGE, colors, layout)
    notes.append(busy_note(layout))

    average = 1 / len(colors)
    concept = {
        "title": described["title"], "idea": described["idea"], "flow": described["flow"], "exact": True,
        "bands": [
            {"name": words["name"], "where": words["where"], "hex": color, "width": round(share / average, 2),
             "relief": words["relief"], "lab": [round(v, 2) for v in rgb_to_lab(hex_to_rgb(color))]}
            for color, share, words in zip(colors, layout.shares, described["colors"])
        ],
        "warnings": [],
        "layout": {"image": IMAGE, "map": MAP, "shares": layout.shares, "color_de": layout.color_de, "prompt": described["prompt"]},
    }
    layouts.write_layout(layout, folder / MAP)
    if note := " ".join(filter(None, notes)):
        concept["layout_note"] = note
    return {
        "style": {"preset": None, "references": [], "exact": path.name},
        "canvas_px": list(size), "prompt": described["prompt"], "concepts": [concept],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("picture", type=Path)
    parser.add_argument("--size", required=True, help="canvas WIDTHxHEIGHT in pixels")
    parser.add_argument("--out", type=Path, required=True, help="folder for the band map, and a -check.png to look at")
    args = parser.parse_args()

    picture = cv2.imread(str(args.picture))
    if picture is None:
        parser.error(f"Can't read {args.picture}")
    width, height = (int(v) for v in args.size.lower().split("x"))
    colors, layout = read_picture(layouts.crop_to(picture, (width, height)), (width, height))
    args.out.mkdir(parents=True, exist_ok=True)
    layouts.write_layout(layout, args.out / "bands.png")
    cv2.imwrite(str(args.out / "bands-check.png"), layouts.draw_layout(layout, colors))
    for color, share, pieces in zip(colors, layout.shares, layout.pieces):
        print(f"{color}  {share:6.1%} of the canvas, {pieces} piece(s)")
    for note in (crop_note(picture, (width, height)), busy_note(layout)):
        if note:
            print(f"Note: {note}")


if __name__ == "__main__":
    main()
