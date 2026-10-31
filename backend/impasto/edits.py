"""Change a concept's painting from what the painter asks for in the chat, over the whole picture or one area of it.

Muse Image repaints it from the current painting and the request. With an area
selected, it also gets a copy with that area outlined, and only that area of its
answer is kept, faded into the painting, so the rest can't change. Its colors and
shapes may be new, so the result is planned as an exact picture is: measured,
mapped and named by impasto.exact, and mixed. Each edit is a new concept in the
run, pointing back at the one it came from, so going back to an earlier version
is free and everything after the concept step works on an edit as on any concept.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from impasto import concepts
from impasto import exact
from impasto import layout as layouts

# How far an area's edge fades into the painting, and how far past the area its answer is kept, as shares of the long side.
FADE = 0.02
MARGIN = 0.01
OUTLINE_BGR = (255, 0, 255)

WHOLE_PROMPT = """Change this painting as the painter asks, and keep everything they don't mention exactly as it is:
the composition, the framing, the colors, the knife strokes and the paste. It stays a palette-knife / impasto painting, seen straight on and filling the frame edge to edge.

The painter asks: {message}"""

AREA_PROMPT = """Change one area of this painting as the painter asks, and keep everything else exactly as it is:
the composition, the framing, the colors, the knife strokes and the paste. It stays a palette-knife / impasto painting, seen straight on and filling the frame edge to edge.
The first image is the painting. The second is the same painting with the area to change outlined in magenta. Return the painting without the outline.

The painter asks, about the outlined area: {message}"""


Area = tuple[float, float, float, float]


def to_pixels(area: Area, shape: tuple[int, ...]) -> tuple[int, int, int, int]:
    """An area given as shares of the canvas (left, top, right, bottom), in pixels."""
    height, width = shape[:2]
    left, top, right, bottom = area
    return round(left * width), round(top * height), round(right * width), round(bottom * height)


def outlined(image: np.ndarray, area: Area) -> np.ndarray:
    left, top, right, bottom = to_pixels(area, image.shape)
    marked = image.copy()
    cv2.rectangle(marked, (left, top), (right, bottom), OUTLINE_BGR, max(3, round(max(image.shape[:2]) * 0.006)))
    return marked


def blend_area(before: np.ndarray, after: np.ndarray, area: Area) -> np.ndarray:
    """The painting as it was, with the area taken from the new one and faded in."""
    long_side = max(before.shape[:2])
    left, top, right, bottom = to_pixels(area, before.shape)
    margin = round(MARGIN * long_side)
    mask = np.zeros(before.shape[:2], np.float32)
    mask[max(0, top - margin):bottom + margin, max(0, left - margin):right + margin] = 1
    mask = cv2.GaussianBlur(mask, (0, 0), FADE * long_side)[..., None]
    return np.round(after * mask + before * (1 - mask)).astype(np.uint8)


def repaint(image: np.ndarray, message: str, area: Area | None, folder: Path) -> np.ndarray:
    """Muse Image's answer, cut to the canvas. image is already cut to it."""
    current = folder / "edit-current.png"
    cv2.imwrite(str(current), image)
    pictures = [current]
    if area:
        marked = folder / "edit-area.png"
        cv2.imwrite(str(marked), outlined(image, area))
        pictures.append(marked)
    prompt = (AREA_PROMPT if area else WHOLE_PROMPT).format(message=message)
    painted = layouts.crop_to(concepts.paint_one(prompt, pictures), (image.shape[1], image.shape[0]))
    current.unlink()
    if area:
        marked.unlink()
        return blend_area(image, painted, area)
    return painted


def edit(concept: dict, index: int, painting: np.ndarray, size: tuple[int, int], message: str, area: Area | None, number: int, folder: Path) -> dict:
    """The new concept: the painting changed as asked, planned again. number: its place in the run, from 1, which names its images."""
    image = repaint(layouts.crop_to(painting, size), message, area, folder)
    planned = exact.plan_picture(image, size, folder, f"concept-{number}-edit.png", f"concept-{number}-layout.png", [])
    return {
        **planned,
        "title": concept["title"],
        "edit": {"from": index, "message": message, "area": list(area) if area else None},
    }
