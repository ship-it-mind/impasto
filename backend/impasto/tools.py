"""The tools one painting needs, from its size, its bands and how the paste is used. No model call.

A tool with sizes asks which size the painter has: a knife much narrower than
the bands still works, but takes far more passes and leaves more joins.
"""

from __future__ import annotations

# Tape keeps a straight edge clean. These flows have them.
STRAIGHT_FLOWS = {"horizontal", "diagonal", "grid", "diagonal split"}


def has_straight_edges(concept: dict) -> bool:
    """What the concept says about its edges; concepts drafted before it said have only their flow."""
    return concept.get("straight_edges", concept["flow"] in STRAIGHT_FLOWS)


def tool(id_: str, name: str, why: str, need: int = 1, sizes: list[float] | None = None, min_size: float | None = None) -> dict:
    return {"id": id_, "name": name, "why": why, "need": need, "sizes": sizes, "min_size": min_size}


def tools_for(width_cm: float, height_cm: float, straight_edges: bool, levels: list[str], paste_in_mix: bool) -> list[dict]:
    long_side = max(width_cm, height_cm)
    blade = 10 if long_side >= 100 else 8 if long_side >= 60 else 6
    tools = [
        tool("canvas", f"Primed canvas, {width_cm:g} × {height_cm:g} cm", "What it's all painted on"),
        tool("large-knife", "Large painting knife", "Lays the broad bands in long passes", sizes=[4, 6, 8, 10, 12, 15], min_size=blade),
        tool("small-knife", "Small painting knife", "Edges, corners and where bands meet", sizes=[2, 3, 4, 5, 6], min_size=3),
    ]
    if "heavy" in levels or long_side >= 100:
        tools.append(tool("spatula", "Wide spatula or trowel", "Spreads the thick paste in one pass", sizes=[8, 10, 12, 15, 20], min_size=10))
    if not paste_in_mix:
        tools.append(tool("brush", "Flat brush", "Works color into the dried ridges", sizes=[2.5, 5, 7.5, 10], min_size=5))
    tools += [
        tool("palette", "Palette or glass slab", "For mixing"),
        tool("tubs", "Lidded tubs", "One per band, so a mix stays wet between sessions", need=len(levels)),
        tool("charcoal", "Charcoal or soft pencil", "Marks where the bands go"),
    ]
    if straight_edges:
        tools.append(tool("tape", "Masking tape", "Keeps the straight edges clean"))
    tools += [
        tool("spray", "Spray bottle", "Keeps paint workable on the palette"),
        tool("rags", "Rags", "Wipe the knife between colors"),
        tool("varnish", "Acrylic varnish", "Protects the finished piece"),
    ]
    return tools
