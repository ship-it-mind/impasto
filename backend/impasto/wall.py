"""Where a piece hangs on the wall photo: a scale and the painting's four corners, in photo pixels.

Corners go top-left, top-right, bottom-right, bottom-left. They needn't make a
rectangle, since a wall photographed at an angle doesn't show one.
"""

from __future__ import annotations

from math import hypot
from pathlib import Path

import cv2
import numpy as np

Point = tuple[float, float]

# Muse Image is asked to make the flat mockup look like a photo of the painting really hung there.
HANG_PROMPT = """The first image is a photo of a wall with a painting digitally pasted onto it. It looks fake: flat, with no
depth, and the room's light doesn't touch it. The second image is that painting on its own.

Return the same photo with the painting looking really hung on that wall, as if photographed there:
- It's a palette-knife / impasto painting on a stretched canvas a few centimeters deep, with no frame. Show the canvas's
  thin side edge where the camera angle would show it, and its thick paste catching the light.
- Light it as the room lights the wall around it: the same brightness, warmth and falloff across it. Any shadow falling
  on the wall where it hangs (such as a plant's) falls across the painting too.
- It casts a soft, natural shadow on the wall, matching the direction and softness of the room's light.
- Keep the painting itself exactly: its composition, colors and strokes, its position, size and corners in the photo.
- Change nothing else in the photo: same framing, same wall, same objects, same everything outside the painting and its
  shadow."""

# What a mockup saved before it had corners is taken to hang, when the brief has no size.
FALLBACK_CM = (120, 90)


def rectangle(center: Point, width_px: float, height_px: float) -> list[Point]:
    x, y = center
    return [(x - width_px / 2, y - height_px / 2), (x + width_px / 2, y - height_px / 2),
            (x + width_px / 2, y + height_px / 2), (x - width_px / 2, y + height_px / 2)]


def from_fit(fit: dict, piece: dict, photo: tuple[int, int]) -> dict:
    """Where Spark recommends hanging the piece, at its size if the painter gave one, else the size it recommends.

    The photo's width at Spark's estimate of it is the scale. The painting stays inside the photo if it fits."""
    photo_w, photo_h = photo
    px_per_cm = photo_w / fit["visible_width_cm"]
    width = (piece["width_cm"] or fit["width_cm"]) * px_per_cm
    height = (piece["height_cm"] or fit["height_cm"]) * px_per_cm
    x = fit["center_x"] * photo_w
    y = fit["center_y"] * photo_h
    if width < photo_w:
        x = min(max(x, width / 2), photo_w - width / 2)
    if height < photo_h:
        y = min(max(y, height / 2), photo_h - height / 2)
    return {
        "line": [(0.0, y), (float(photo_w), y)], "length_cm": fit["visible_width_cm"],
        "corners": rectangle((x, y), width, height), "estimated": True,
    }


def with_corners(mockup: dict | None, piece: dict) -> dict | None:
    """A mockup as the web app gets it. One saved with only a center gets corners at the piece's true size."""
    if mockup is None or "corners" in mockup:
        return mockup
    (x1, y1), (x2, y2) = mockup["line"]
    px_per_cm = hypot(x2 - x1, y2 - y1) / mockup["length_cm"]
    width, height = (piece["width_cm"], piece["height_cm"]) if piece["width_cm"] and piece["height_cm"] else FALLBACK_CM
    return {"line": mockup["line"], "length_cm": mockup["length_cm"],
            "corners": rectangle(mockup["center"], width * px_per_cm, height * px_per_cm)}


def hang(flat: Path, painting: Path) -> np.ndarray:
    """Muse Image's photo of the painting really hung, from the flat mockup and the painting on its own.

    Muse answers at a size of its own, so it's brought back to the mockup's, which keeps the painting where it was placed."""
    from impasto.concepts import paint_one
    from impasto.layout import crop_to

    height, width = cv2.imread(str(flat)).shape[:2]
    return crop_to(paint_one(HANG_PROMPT, [flat, painting]), (width, height))
