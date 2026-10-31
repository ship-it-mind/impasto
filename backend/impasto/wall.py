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


def from_fit(fit: dict, piece: dict, photo: tuple[int, int]) -> dict:
    """Where Spark recommends hanging the piece, at its size if the client gave one, else the size it recommends.

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
