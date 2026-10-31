"""Where a piece hangs on the wall photo: a scale and the painting's four corners, in photo pixels.

Corners go top-left, top-right, bottom-right, bottom-left. They needn't make a
rectangle, since a wall photographed at an angle doesn't show one.
"""

from __future__ import annotations

from math import hypot

Point = tuple[float, float]

# What a mockup saved before it had corners is taken to hang, when the brief has no size.
FALLBACK_CM = (120, 90)


def rectangle(center: Point, width_px: float, height_px: float) -> list[Point]:
    x, y = center
    return [(x - width_px / 2, y - height_px / 2), (x + width_px / 2, y - height_px / 2),
            (x + width_px / 2, y + height_px / 2), (x - width_px / 2, y + height_px / 2)]


def with_corners(mockup: dict | None, piece: dict) -> dict | None:
    """A mockup as the web app gets it. One saved with only a center gets corners at the piece's true size."""
    if mockup is None or "corners" in mockup:
        return mockup
    (x1, y1), (x2, y2) = mockup["line"]
    px_per_cm = hypot(x2 - x1, y2 - y1) / mockup["length_cm"]
    width, height = (piece["width_cm"], piece["height_cm"]) if piece["width_cm"] and piece["height_cm"] else FALLBACK_CM
    return {"line": mockup["line"], "length_cm": mockup["length_cm"],
            "corners": rectangle(mockup["center"], width * px_per_cm, height * px_per_cm)}
