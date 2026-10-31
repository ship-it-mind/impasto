"""Change a concept's painting from what the painter asks for in the chat, over the whole picture or selected segments of it.

Muse Image repaints it from the current painting and the request. With segments
selected (connected shapes of one color in the band map), it also gets a copy with
them outlined, and only they are kept from its answer, faded into the painting, so
the rest can't change. Its colors and
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

# How far a segment's edge fades into the painting, and how far past the segment its answer is kept, as shares of the long
# side. Both are small because a segment ends at a real edge in the painting, which a wide fade would blur into its neighbor.
FADE = 0.003
MARGIN = 0.006
OUTLINE_BGR = (255, 0, 255)

WHOLE_PROMPT = """Change this painting as the painter asks, and keep everything they don't mention exactly as it is:
the composition, the framing, the colors, the knife strokes and the paste. It stays a palette-knife / impasto painting, seen straight on and filling the frame edge to edge.

The painter asks: {message}"""

AREA_PROMPT = """Change one area of this painting as the painter asks, and keep everything else exactly as it is:
the composition, the framing, the colors, the knife strokes and the paste. It stays a palette-knife / impasto painting, seen straight on and filling the frame edge to edge.
The first image is the painting. The second is the same painting with the area to change outlined in magenta. Return the painting without the outline.

The painter asks, about the outlined area: {message}"""


Segment = tuple[float, float]


def segment_mask(bands: np.ndarray, segments: list[Segment]) -> np.ndarray:
    """Where the selected segments are: for each point, the connected shape of one color it's on in the band map.

    Neighbors count across edges only, as in web/src/lib/segments.ts, so these are the shapes the painter saw."""
    height, width = bands.shape
    mask = np.zeros(bands.shape, bool)
    for x, y in segments:
        row, col = min(height - 1, int(y * height)), min(width - 1, int(x * width))
        _, pieces = cv2.connectedComponents((bands == bands[row, col]).astype(np.uint8), connectivity=4)
        mask |= pieces == pieces[row, col]
    return mask


def outlined(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    marked = image.copy()
    cv2.drawContours(marked, contours, -1, OUTLINE_BGR, max(3, round(max(image.shape[:2]) * 0.006)))
    return marked


def blend_area(before: np.ndarray, after: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """The painting as it was, with the selected part taken from the new one and faded in."""
    long_side = max(before.shape[:2])
    reach = 2 * round(MARGIN * long_side) + 1
    kept = cv2.dilate(mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (reach, reach))).astype(np.float32)
    kept = cv2.GaussianBlur(kept, (0, 0), FADE * long_side)[..., None]
    return np.round(after * kept + before * (1 - kept)).astype(np.uint8)


def repaint(image: np.ndarray, message: str, mask: np.ndarray | None, folder: Path) -> np.ndarray:
    """Muse Image's answer, cut to the canvas. image is already cut to it."""
    current = folder / "edit-current.png"
    cv2.imwrite(str(current), image)
    pictures = [current]
    if mask is not None:
        marked = folder / "edit-area.png"
        cv2.imwrite(str(marked), outlined(image, mask))
        pictures.append(marked)
    prompt = (WHOLE_PROMPT if mask is None else AREA_PROMPT).format(message=message)
    painted = layouts.crop_to(concepts.paint_one(prompt, pictures), (image.shape[1], image.shape[0]))
    current.unlink()
    if mask is not None:
        marked.unlink()
        return blend_area(image, painted, mask)
    return painted


def edit(concept: dict, index: int, painting: np.ndarray, size: tuple[int, int], message: str, segments: list[Segment], bands: np.ndarray | None, number: int, folder: Path) -> dict:
    """The new concept: the painting changed as asked, planned again. bands: the painting's band map, when segments are selected.
    number: its place in the run, from 1, which names its images."""
    mask = segment_mask(bands, segments) if segments else None
    image = repaint(layouts.crop_to(painting, size), message, mask, folder)
    planned = exact.plan_picture(image, size, folder, f"concept-{number}-edit.png", f"concept-{number}-layout.png", [])
    return {
        **planned,
        "title": concept["title"],
        "edit": {"from": index, "message": message, "segments": [list(s) for s in segments] or None},
    }
