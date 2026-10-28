"""Built-in style presets for concept generation.

A preset is text only: no bundled images. It sets the composition (which
flows Spark may pick, how many bands), the default relief per band, and a
prompt fragment for Muse Image. The palette comes from the client's brief;
a preset's palette is only a fallback for briefs that name no colors.

When the user uploads references as well, both are used: the references
steer the look and palette, the preset sets flow, band count and relief.
With neither, concepts use DEFAULT_PRESET.
"""

from __future__ import annotations

from impasto.volume import LEVELS

DEFAULT_PRESET = "flowing-bands"

BASE_PROMPT = (
    "A palette-knife impasto painting, shot straight-on as a flat canvas filling the whole "
    "image, with no frame, wall or room. Abstract and non-figurative. The canvas is made of "
    "clearly separate color bands with distinct edges between them. Within each band the knife "
    "strokes run in one consistent direction that follows the band across the whole canvas. No band "
    "is suddenly much thicker than its neighbours unless the style below makes it the accent. Broad, calm "
    "areas only: no tiny scattered shapes or specks. The colors sit well together; no clashing accents."
)

PRESETS = {
    "flowing-bands": {
        "name": "Flowing Bands",
        "flows": ["arc", "diagonal", "wave"],
        "bands": (4, 6),
        "relief": {"default": "medium", "accent": "heavy"},
        "prompt": (
            "Broad bands sweep across the canvas in long arcs and diagonals, each laid in with "
            "smooth, unbroken knife pulls that follow the band. Clean edges where bands meet. "
            "Medium paste overall, with one band built up noticeably thicker as an accent."
        ),
        "fallback_palette": [
            ("cream", "#EDE3D1"), ("sand", "#D8C3A0"), ("terracotta", "#B8735A"),
            ("dusty rose", "#C9A097"), ("warm taupe", "#8C7B6B"), ("deep umber", "#4E3B30"),
        ],
    },
    "layered-horizon": {
        "name": "Layered Horizon",
        "flows": ["horizontal", "gentle wave"],
        "bands": (4, 6),
        "relief": {"top": "thin", "bottom": "heavy"},
        "prompt": (
            "Horizontal bands stacked from top to bottom like an abstract landscape or seascape, "
            "with a soft horizon line. Long sideways knife strokes. The top bands are thin and "
            "smooth; the paste gets thicker band by band towards the bottom, which is heavily built up. "
            "Every band, including the bottom one, is laid edge to edge with horizontal strokes, never vertical."
        ),
        "fallback_palette": [
            ("pale blue-grey", "#B9C4C9"), ("sand", "#D9C7A3"), ("sage", "#9AA58A"),
            ("soft blue-grey", "#7F8F99"), ("olive brown", "#6B6248"), ("deep slate", "#3F4A50"),
        ],
    },
    "sculpted-relief": {
        "name": "Sculpted Relief",
        "flows": ["arc", "diagonal"],
        "bands": (2, 4),
        "relief": {"default": "heavy"},
        "prompt": (
            "A few wide bands of very thick modeling paste, built up with long, controlled knife "
            "pulls into deep ridges that follow each band and cast shadows, not loose swirls, so it "
            "can be painted by hand on a large canvas. Tonal, close in color: the relief carries "
            "the piece, not color contrast. Like textured plaster art."
        ),
        "fallback_palette": [
            ("off-white", "#F2EEE6"), ("warm white", "#E8E1D4"), ("greige", "#CFC5B5"), ("stone", "#B3A898"),
        ],
    },
    "color-block": {
        "name": "Color Block",
        "flows": ["grid", "diagonal split"],
        "bands": (4, 6),
        "relief": {"default": "thin", "accent": "medium"},
        "prompt": (
            "Geometric panels of color with straight, crisp edges, like a diagonal split or a "
            "loose grid. Each panel is laid in with flat knife slabs, thin to medium paste, "
            "flat and even rather than sculpted. Bold colors, but chosen to work together."
        ),
        "fallback_palette": [
            ("ochre", "#D9A21B"), ("deep teal", "#1F5C63"), ("coral", "#E0644A"),
            ("ink navy", "#1E2A44"), ("off-white", "#F1EDE4"), ("black", "#1A1A1A"),
        ],
    },
}

assert all(level in LEVELS for preset in PRESETS.values() for level in preset["relief"].values())


def palette_line(colors: list[tuple[str, str]]) -> str:
    return "Palette: " + ", ".join(f"{name} ({hex_})" for name, hex_ in colors) + "."


def image_prompt(key: str, palette: list[tuple[str, str]] | None = None) -> str:
    """Muse Image prompt for a preset. palette=None uses the preset's fallback palette;
    an empty list leaves the palette out (e.g. when references set it)."""
    preset = PRESETS[key]
    colors = preset["fallback_palette"] if palette is None else palette
    parts = [BASE_PROMPT, preset["prompt"]]
    if colors:
        parts.append(palette_line(colors))
    return " ".join(parts)
