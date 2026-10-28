"""Recipe cards: Muse Spark turns computed mixing ratios into recipes she can follow.

    uv run python -m impasto.recipe_cards output/rectify/painting

Reads recipes.json. The numbers (parts, grams, ΔE) and the tube to add when a
mix is too dark or too light are computed in impasto.mixing; Spark only writes
the wording: the recipe line in parts, mixing steps, the too-dark / too-light
tips, warnings, and a re-match card for when a band's mix runs out
mid-painting. Writes cards.json and cards.md.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from impasto.meta import client

MODEL = "muse-spark-1.3"

PROMPT = """You are helping a palette-knife / impasto painter mix acrylic colors for a commission.
For each band below, the recipe and expected color error (ΔE2000; under 2 is barely
visible) are already computed. Do not change any number. She mixes by parts, not by weight:
the parts are the recipe. paste_parts is the modeling paste mixed into the color, or null
when the paste goes on separately under the paint. grams is only how much each band needs in all.
Write, for each band:
- recipe_line: one line in painter's language using the parts, e.g.
  "4 parts Titanium White : 1 part Yellow Ochre : 1 part Raw Umber" (add the paste parts if given)
- steps: 2-4 short mixing steps. She starts with the light colors and adds the darker ones
  slowly, a little at a time, so order the tubes from lightest to darkest.
- too_dark: one short line, e.g. "Too dark? Work in a little more Titanium White.", using
  if_too_dark_add. Empty string if it is null.
- too_light: the same for if_too_light_add. Empty string if it is null.
- warnings: real risks only, e.g. delta_e_by_parts above 2 (then say the parts land a little off
  and to finish by eye with the too-dark / too-light tips); a large share of a transparent pigment
  (Quinacridone, Ultramarine, Phthalo, Sap Green) that may not cover; or a very dark mix with a lot of
  black (it looks darker when dry). Empty list if none.
- rematch: 2-4 steps to re-mix this color to match paint already on the canvas if she runs out mid-band
  (e.g. mix a small test batch from the same parts, compare a dab next to the dry paint, adjust in small steps
  with the too-dark / too-light tubes;
  acrylics dry slightly darker).

Bands:
{bands}
"""

CARDS_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "recipe_cards",
        "schema": {
            "type": "object",
            "properties": {
                "cards": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "band": {"type": "string"},
                            "recipe_line": {"type": "string"},
                            "steps": {"type": "array", "items": {"type": "string"}},
                            "too_dark": {"type": "string"},
                            "too_light": {"type": "string"},
                            "warnings": {"type": "array", "items": {"type": "string"}},
                            "rematch": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["band", "recipe_line", "steps", "too_dark", "too_light", "warnings", "rematch"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["cards"],
            "additionalProperties": False,
        },
    },
}


def band_brief(recipe: dict) -> dict:
    return {
        "band": recipe["band"],
        "target_hex": recipe["target_hex"],
        "delta_e_exact": recipe["delta_e"],
        "delta_e_by_parts": recipe["parts_delta_e"],
        "tubes": [
            {"name": tube["name"], "parts": tube["parts"], "grams": tube["grams"]}
            for tube in recipe["tubes"]
        ],
        "paste_parts": recipe["paste_parts"],
        "paste_grams": recipe["paste_grams"],
        "if_too_dark_add": recipe["if_too_dark"],
        "if_too_light_add": recipe["if_too_light"],
    }


def write_cards(briefs: list[dict]) -> list[dict]:
    response = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": PROMPT.format(bands=json.dumps(briefs, indent=2))}],
        response_format=CARDS_SCHEMA,
    )
    cards = json.loads(response.choices[0].message.content)["cards"]
    by_band = {card["band"]: card for card in cards}
    missing = [brief["band"] for brief in briefs if brief["band"] not in by_band]
    if missing:
        raise RuntimeError(f"Spark returned no card for: {', '.join(missing)}")
    # Keep the computed numbers next to Spark's wording.
    return [{**brief, **by_band[brief["band"]]} for brief in briefs]


def to_markdown(cards: list[dict], placeholder: bool) -> str:
    lines = ["# Recipe cards", ""]
    if placeholder:
        lines += ["> Placeholder tubes, not her inventory.", ""]
    for card in cards:
        grams = ", ".join(
            f"{t['name']} {t['grams']} g" for t in card["tubes"] if t["grams"] is not None
        )
        lines += [
            f"## {card['band']} ({card['target_hex']}, ΔE {card['delta_e_by_parts']} by parts)",
            "",
            card["recipe_line"],
            "",
        ]
        if grams:
            paste = f", paste {card['paste_grams']} g" if card["paste_grams"] is not None else ""
            lines += [f"How much in all: {grams}{paste}", ""]
        lines += [f"{i}. {step}" for i, step in enumerate(card["steps"], 1)] + [""]
        tips = [tip for tip in (card["too_dark"], card["too_light"]) if tip]
        if tips:
            lines += [f"- {tip}" for tip in tips] + [""]
        if card["warnings"]:
            lines += [f"- ⚠️ {w}" for w in card["warnings"]] + [""]
        lines += ["**If you run out mid-band:**", ""]
        lines += [f"{i}. {step}" for i, step in enumerate(card["rematch"], 1)] + [""]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="folder with recipes.json")
    args = parser.parse_args()

    data = json.loads((args.folder / "recipes.json").read_text(encoding="utf-8"))
    cards = write_cards([band_brief(r) for r in data["recipes"]])
    (args.folder / "cards.json").write_text(json.dumps(cards, indent=2) + "\n", encoding="utf-8")
    markdown = to_markdown(cards, data["placeholder_inventory"])
    (args.folder / "cards.md").write_text(markdown, encoding="utf-8")
    print(markdown)
    print(f"Wrote {args.folder / 'cards.json'} and {args.folder / 'cards.md'}")


if __name__ == "__main__":
    main()
