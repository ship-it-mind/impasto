"""How to paint one concept: the stages in order, in Spark's words.

The stages are computed, as the recipes' numbers are: what goes on when, and so
what the canvas looks like after each stage (`paste` and `paint` list the bands
that are on by then; the web app draws each picture from them). Spark only
writes what to do at each stage and the tips.

Paste underneath goes on thin to thick, and dries before any color. Color then
goes on darkest first, so a dark never gets dragged into a light already down.
Tinted paste also goes on thin to thick, since wet ridges don't survive working
next to them, and darkest first within the same thickness.
"""

from __future__ import annotations

import json

from impasto.color import hex_to_rgb, rgb_to_lab
from impasto.meta import client
from impasto.method import dry_time
from impasto.volume import LEVELS

MODEL = "muse-spark-1.3"
LEVEL_NAMES = {"thin": "thin", "medium": "medium", "heavy": "thick"}

PROMPT = """You are helping a palette-knife / impasto painter paint one piece, step by step. The stages and
their order are already decided and every amount is already computed: do not change, add or drop
any. Write for a capable painter who is standing at the easel: short, direct, concrete.

Write:
- overview: 1-2 sentences on what to start with and why, for this piece.
- tips: 3-5 tips for this piece as a whole: handling the knife, keeping colors clean, working with
  this paste method and these relief levels. No generic advice like "have fun" or "take your time".
- steps: one entry per stage, with its id, and for each:
  - do: 2-4 short instructions, in order. For a band, say where it sits and how to lay it at its
    relief level. Don't repeat the mixing parts, which the painter already has next to this step.
  - tips: 0-2 tips specific to this stage, such as how to handle the edge with a band already down.

The painting: "{title}". {idea}
Canvas: {width} × {height} cm. The bands run: {flow}.
Modeling paste: {method}

Stages:
{stages}
"""

GUIDE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "paint_guide",
        "schema": {
            "type": "object",
            "properties": {
                "overview": {"type": "string"},
                "tips": {"type": "array", "items": {"type": "string"}},
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "do": {"type": "array", "items": {"type": "string"}},
                            "tips": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["id", "do", "tips"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["overview", "tips", "steps"],
            "additionalProperties": False,
        },
    },
}


def lightness(band: dict) -> float:
    return rgb_to_lab(hex_to_rgb(band["mix_hex"]))[0]


def stages(bands: list[dict], paste_in_mix: bool) -> list[dict]:
    """Every stage from bare canvas to finished, with the bands on the canvas once it's done."""
    indices = range(len(bands))
    steps = [{"id": "prepare", "title": "Prepare the canvas and mark the bands", "band": None, "paste": [], "paint": [], "wait": None}]
    if paste_in_mix:
        order = sorted(indices, key=lambda i: (LEVELS.index(bands[i]["level"]), lightness(bands[i])))
        for done, i in enumerate(order, start=1):
            steps.append({"id": f"band-{i}", "title": f"Lay {bands[i]['name']}", "band": i, "paste": [], "paint": order[:done], "wait": None})
    else:
        pasted: list[int] = []
        levels = [level for level in LEVELS if any(b["level"] == level for b in bands)]
        for level in levels:
            pasted = pasted + [i for i in indices if bands[i]["level"] == level]
            wait = dry_time(levels) if level == levels[-1] else None
            steps.append({"id": f"paste-{level}", "title": f"Lay the {LEVEL_NAMES[level]} paste", "band": None, "paste": pasted, "paint": [], "wait": wait})
        order = sorted(indices, key=lambda i: lightness(bands[i]))
        for done, i in enumerate(order, start=1):
            steps.append({"id": f"band-{i}", "title": f"Paint {bands[i]['name']}", "band": i, "paste": pasted, "paint": order[:done], "wait": None})
    paste = list(indices) if not paste_in_mix else []
    steps.append({"id": "finish", "title": "Let it dry and finish", "band": None, "paste": paste, "paint": list(indices), "wait": None})
    return steps


def stage_brief(stage: dict, bands: list[dict]) -> dict:
    brief: dict = {"id": stage["id"], "title": stage["title"]}
    if stage["id"].startswith("paste-"):
        brief["paste_on_these_bands"] = [
            {"band": bands[i]["name"], "paste_g": round(bands[i]["paste_g"]), "area_cm2": round(bands[i]["area_cm2"])}
            for i in stage["paste"] if stage["id"] == f"paste-{bands[i]['level']}"
        ]
    if stage["band"] is not None:
        band = bands[stage["band"]]
        brief["band"] = {key: band[key] for key in ("name", "level", "mix_hex", "paint_g", "paste_g", "area_cm2")}
        brief["bands_already_on"] = [bands[i]["name"] for i in stage["paint"] if i != stage["band"]]
    if stage["wait"]:
        brief["dry_before_next_stage"] = stage["wait"]
    return brief


def write(concept: dict, recipe: dict, width_cm: float, height_cm: float) -> dict:
    """The guide for one recipe: Spark's words on the computed stages."""
    bands, paste_in_mix = recipe["bands"], recipe["mixing"]["paste_in_mix"]
    planned = stages(bands, paste_in_mix)
    method = (
        "tinted: mixed into each band's color, so color and relief go on together, wet."
        if paste_in_mix else
        "underneath: the relief is built in white paste first, left to dry, then painted over in color."
    )
    prompt = PROMPT.format(
        title=concept["title"], idea=concept["idea"], width=f"{width_cm:g}", height=f"{height_cm:g}", flow=concept["flow"], method=method,
        stages=json.dumps([stage_brief(stage, bands) for stage in planned], indent=2, ensure_ascii=False),
    )
    response = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format=GUIDE_SCHEMA,
    )
    written = json.loads(response.choices[0].message.content)
    by_id = {step["id"]: step for step in written["steps"]}
    missing = [stage["id"] for stage in planned if stage["id"] not in by_id]
    if missing:
        raise RuntimeError(f"Spark wrote nothing for: {', '.join(missing)}")
    return {
        "overview": written["overview"],
        "tips": written["tips"],
        "steps": [{**stage, "do": by_id[stage["id"]]["do"], "tips": by_id[stage["id"]]["tips"]} for stage in planned],
    }
