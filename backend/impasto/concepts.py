"""Concepts: a brief + reference photos, if any → 3 concept specs.

    uv run python -m impasto.concepts --brief output/brief/brief/brief.json
    uv run python -m impasto.concepts --reference past1.jpg --reference past2.jpg --render
    uv run python -m impasto.concepts --brief output/brief/brief/brief.json --preset layered-horizon
    uv run python -m impasto.concepts --render --without "Sap Green" --paste-in-mix

Muse Spark drafts three distinct compositions as structured specs: the
composition in its own words, then the bands, each one mix of paint with a
color, where it sits, a relative share of the canvas and a relief level. The
composition is taken from the reference photos if there are any, otherwise it
is what Spark recommends for the brief; no list of layouts limits it. Code checks the specs
and adds Lab colors. Each spec is what the recipe step mixes, so nothing
downstream guesses from pixels.

Each spec also names the regular flow closest to it, which is all the drawn
geometry (web/relief/bands.ts) knows how to draw.

Path A (OUR-138): Muse Image then paints each spec (`paint`), with the
reference photos attached when there are any, and impasto.layout reads the
band layout and knife direction back off the painting. The relief preview,
the recipe's band areas and the check-ins all use that layout, so the concept
looks like Muse's composition but in the colors the user can mix. A concept
whose painting can't be read (a band missing or merged) falls back on that
drawn flow instead (Path B), with a note saying so.

Each band also gets its Mixbox mix from the tubes on hand (impasto.mixing), and
the renderer paints that mix rather than Spark's color, so the preview shows
what the user can actually mix. A band whose mix is more than MAX_MIX_DE off
gets a warning; the concept still renders.

A preset (command line only) limits the flows and sets the band count and
relief. The palette comes from the brief, else from the references, else Spark
picks what suits the brief; with no brief at all, it is the default preset's.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from math import gcd
from pathlib import Path

import cv2
import numpy as np

from impasto import layout as layouts
from impasto.color import hex_to_rgb, rgb_to_hex, rgb_to_lab
from impasto.meta import REPO_ROOT, client, data_url
from impasto.mixing import PLACEHOLDER_INVENTORY, Mixer, without
from impasto.presets import BASE_PROMPT, DEFAULT_PRESET, PRESETS
from impasto.volume import LEVELS, load_materials

MODEL = "muse-spark-1.3"
IMAGE_MODEL = "muse-image-1.0"
OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "concepts"
RENDERER = REPO_ROOT / "web" / "relief" / "render.ts"
ALL_FLOWS = sorted({flow for preset in PRESETS.values() for flow in preset["flows"]})
CONCEPTS = 3
LONG_SIDE_PX = 1000
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
# A band's mix this far (ΔE2000) from Spark's color is clearly off, so the concept is flagged.
MAX_MIX_DE = 3.0

PROMPT = """You are the studio assistant of a palette-knife / impasto painter. Design {n} concept
compositions for one piece.

{source}

Write each one as a spec:
- title: a short, evocative title. idea: one sentence on what makes this composition different.
- composition: one or two sentences saying what shapes are on the canvas and how they are arranged,
  plainly enough that someone could paint it without seeing anything else.
- bands: {band_rule}. A band here is one mix of paint, whatever its shape: a stripe, a disc, a field
  behind other shapes, or several separate shapes in the same color. Each has a short color name, a hex
  color as the painter would mix it, where (the shape it takes and where it sits on the canvas, in a few
  words), a width (how much of the canvas it covers, relative to the others: 1 = average, 0.5 = little,
  2 = a lot), and a relief level ({levels}).
- relief: {relief_rule}
- in_sequence: true if the bands follow one another across the canvas, each touching only the ones listed
  next to it, with the bands listed in that order. Otherwise false, with the biggest band first.
- straight_edges: true if the main edges between the bands are straight lines, so tape would keep them clean.
- flow: the one regular layout that comes closest to this composition, only for a rough sketch of it:
{flows}

Make the {n} compositions clearly different from each other: different shapes and arrangements, not
one arrangement recolored.
Every composition should be paintable by hand with a palette knife on a large canvas: broad areas of flat
color with clear edges, no gradients and no tiny shapes, and at most a handful of separate shapes per color.
Every color must be visibly different from the others in hue or lightness, and cover at least a twentieth
of the canvas. The colors should sit well together rather than clash.

{style}

Palette: {palette}
"""

PRESET_STYLE = "Style: {name}. {prompt}"
SOURCE_REFERENCES = (
    "Take the compositions from the attached photos: look at what shapes they use, how those are arranged and how "
    "much of the canvas they fill, and make new compositions of that kind for this brief. If the photos don't use "
    "stripes or bands, neither should you. If the brief asks for a particular arrangement, that comes first."
)
SOURCE_BRIEF = (
    "Recommend the compositions that best fit what the client asks for: what they said about shapes, then the mood "
    "and the room. Choose freely among any arrangement that can be laid with a knife; stripes and waves are only a few of them."
)
SOURCE_NONE = "Choose any arrangements that can be laid with a knife, and make them varied."
SOURCE_PRESET = "Compose within the style below: the arrangement should read as one of the regular layouts it allows."
# Spark's words for the bands when a run sets no relief rule of its own.
RELIEF_FROM_REFERENCES = "follow the reference photos: thick where they are thick."
RELIEF_FROM_BRIEF = "choose what suits the piece: thick paste where it should catch the light, thin where it should stay calm."

# What each flow draws, for Spark: only the fallback sketch uses it.
FLOW_MEANING = {
    "arc": "concentric arcs around a center off one corner of the canvas",
    "diagonal": "straight bands running diagonally across the canvas",
    "wave": "bands running diagonally across the canvas in long, gentle waves; never horizontal",
    "horizontal": "horizontal bands stacked from top to bottom",
    "gentle wave": "near-horizontal bands with a gentle wave, stacked from top to bottom",
    "grid": "a loose grid of rectangular panels",
    "diagonal split": "panels split by one or two straight diagonals",
}

# Flows made of panels, where a band can sit next to any other.
PANEL_FLOWS = {"grid", "diagonal split"}
RELIEF_TEXT = {"thin": "thin, smooth paste", "medium": "medium paste", "heavy": "thick, built-up paste with deep knife ridges"}
REFERENCE_PREFIX = (
    "These photos show the style to follow. Use their look, knife texture and kind of composition, but "
    "paint the new composition described below in exactly its colors and relief, and copy none of them. "
)
REFERENCE_STYLE = (
    "The attached photos show the style to follow: take the composition, the look, the palette and how the "
    "paste is laid from them, without copying any one of them."
)


def strict_object(properties: dict) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def concepts_schema(flows: list[str]) -> dict:
    band = strict_object({
        "name": {"type": "string"},
        "hex": {"type": "string"},
        "where": {"type": "string"},
        "width": {"type": "number"},
        "relief": {"type": "string", "enum": list(LEVELS)},
    })
    concept = strict_object({
        "title": {"type": "string"},
        "idea": {"type": "string"},
        "composition": {"type": "string"},
        "in_sequence": {"type": "boolean"},
        "straight_edges": {"type": "boolean"},
        "flow": {"type": "string", "enum": flows},
        "bands": {"type": "array", "items": band},
    })
    return {
        "type": "json_schema",
        "json_schema": {"name": "concepts", "schema": strict_object({"concepts": {"type": "array", "items": concept}})},
    }


def relief_rule(relief: dict[str, str]) -> str:
    if "top" in relief:
        return f"relief grows band by band, from {relief['top']} in the first band to {relief['bottom']} in the last."
    if "accent" in relief:
        return f"most bands {relief['default']}; exactly one band {relief['accent']}, as an accent."
    return f"every band {relief['default']}."


def palette_text(brief: dict | None, has_references: bool, preset: dict | None) -> str:
    palette = brief["palette"] if brief else None
    if palette and palette["colors"]:
        colors = ", ".join(f"{c['name']} ({c['approx_hex']})" for c in palette["colors"])
        text = (f"build every band from the client's colors: {colors}. Add lighter, darker or more "
                f"neutral versions of them to reach the band count, keeping the palette "
                f"{palette['temperature']} and {palette['intensity']}.")
        if palette["avoid"]:
            text += f" Never use: {', '.join(palette['avoid'])}."
        return text
    if has_references:
        return "take the colors from the reference photos."
    if brief and not preset:
        return "the client named no colors; choose the ones that best suit the brief."
    preset = preset or PRESETS[DEFAULT_PRESET]
    colors = ", ".join(f"{name} ({hex_})" for name, hex_ in preset["fallback_palette"])
    return f"no colors were given; use these: {colors}."


def brief_text(brief: dict | None) -> str:
    if not brief:
        return ""
    lines = [f"Client brief: {brief['summary']}"]
    if brief["mood"]:
        lines.append(f"Mood: {', '.join(brief['mood'])}.")
    if brief["style"]:
        lines.append(f"What they said about style: {', '.join(brief['style'])}.")
    return "\n".join(lines)


def canvas_px(brief: dict | None) -> tuple[int, int]:
    """Render size with the piece's aspect ratio, long side LONG_SIDE_PX; 4:3 landscape if unknown."""
    piece = brief["piece"] if brief else None
    width, height = (piece["width_cm"], piece["height_cm"]) if piece and piece["width_cm"] and piece["height_cm"] else (4, 3)
    scale = LONG_SIDE_PX / max(width, height)
    return round(width * scale), round(height * scale)


def check(concept: dict, flows: list[str], band_range: tuple[int, int] | None) -> list[str]:
    problems = []
    if not concept["composition"].strip():
        problems.append("no composition")
    if concept["flow"] not in flows:
        problems.append(f"flow {concept['flow']!r} is not allowed")
    count = len(concept["bands"])
    if band_range and not band_range[0] <= count <= band_range[1]:
        problems.append(f"{count} bands, expected {band_range[0]}–{band_range[1]}")
    for band in concept["bands"]:
        if not HEX.match(band["hex"]):
            problems.append(f"band {band['name']!r} has no valid hex color ({band['hex']!r})")
        if band["width"] <= 0:
            problems.append(f"band {band['name']!r} has width {band['width']}")
    return problems


def draft(brief: dict | None, preset_key: str | None, references: list[Path]) -> dict:
    preset = PRESETS[preset_key] if preset_key else None
    flows = preset["flows"] if preset else ALL_FLOWS
    band_range = preset["bands"] if preset else None

    style = [PRESET_STYLE.format(**preset)] if preset else []
    if references:
        style.append(REFERENCE_STYLE)
    if preset:
        source = SOURCE_PRESET
    elif references:
        source = SOURCE_REFERENCES
    else:
        source = SOURCE_BRIEF if brief else SOURCE_NONE
    prompt = PROMPT.format(
        n=CONCEPTS,
        source=source,
        flows="\n".join(f"  - {flow}: {FLOW_MEANING[flow]}" for flow in flows),
        band_rule=f"{band_range[0]} to {band_range[1]} bands" if band_range else "2 to 6 bands",
        levels=" / ".join(LEVELS),
        relief_rule=relief_rule(preset["relief"]) if preset else RELIEF_FROM_REFERENCES if references else RELIEF_FROM_BRIEF,
        style="\n".join(style),
        palette=palette_text(brief, bool(references), preset),
    )
    if brief:
        prompt += "\n" + brief_text(brief) + "\n"

    content: list[dict] = [{"type": "text", "text": prompt}]
    content += [{"type": "image_url", "image_url": {"url": data_url(path)}} for path in references]
    response = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": content}],
        response_format=concepts_schema(flows),
    )
    concepts = json.loads(response.choices[0].message.content)["concepts"]
    if len(concepts) < CONCEPTS:
        raise RuntimeError(f"Spark returned {len(concepts)} concepts, expected {CONCEPTS} (response {response.id}).")

    width, height = canvas_px(brief)
    for concept in concepts[:CONCEPTS]:
        concept["warnings"] = check(concept, flows, band_range)
        for band in concept["bands"]:
            if HEX.match(band["hex"]):
                band["lab"] = [round(v, 2) for v in rgb_to_lab(hex_to_rgb(band["hex"]))]
    return {
        "style": {"preset": preset_key, "references": [str(path) for path in references]},
        "canvas_px": [width, height],
        "prompt": prompt,
        "concepts": concepts[:CONCEPTS],
    }


def mix(record: dict, unticked: list[str], paste_in_mix: bool) -> None:
    """Add each band's Mixbox mix from the tubes on hand, and flag bands it can't match."""
    inventory = without(PLACEHOLDER_INVENTORY, unticked)
    paste_share = 1 - load_materials(None).paint_fraction if paste_in_mix else 0.0
    mixer = Mixer(inventory, paste_share)
    record["mixing"] = {
        "tubes": mixer.names,
        "without": unticked,
        "paste_in_mix": paste_in_mix,
    }
    for concept in record["concepts"]:
        concept["mix_warnings"] = []
        for band in concept["bands"]:
            if not HEX.match(band["hex"]):
                continue
            de, combo, shares = mixer.recipe(band["hex"])
            band["mix"] = {
                "hex": rgb_to_hex(mixer.mix_rgb(combo, shares)),
                "delta_e": round(de, 2),
                "tubes": [
                    {"name": mixer.names[i], "share": round(float(s), 2)}
                    for i, s in sorted(zip(combo, shares), key=lambda item: -item[1])
                ],
            }
            if de > MAX_MIX_DE:
                concept["mix_warnings"].append(
                    f"band {band['name']!r} can only be mixed to ΔE {de:.1f} from these tubes"
                )


def image_prompt(concept: dict, size: tuple[int, int], preset_key: str | None, references: bool) -> str:
    """Muse Image prompt for one spec: its composition, each band's color, place, share and relief, and the canvas shape."""
    width, height = size
    shape = "a square" if abs(width / height - 1) < 0.05 else ("a landscape" if width > height else "a portrait")
    total = sum(band["width"] for band in concept["bands"]) or 1
    bands = " ".join(
        f"{i}. {band['name']} ({band['hex']}): {band['where'].rstrip('.')}, about {band['width'] / total:.0%} of the canvas, {RELIEF_TEXT[band['relief']]}."
        for i, band in enumerate(concept["bands"], start=1)
    )
    parts = [REFERENCE_PREFIX if references else "", BASE_PROMPT]
    if preset_key:
        parts.append(PRESETS[preset_key]["prompt"])
    parts += [
        f"The canvas is {shape} format, {width // gcd(width, height)}:{height // gcd(width, height)}.",
        concept["composition"],
        f"{len(concept['bands'])} colors, each painted in exactly its color: {bands}",
    ]
    return " ".join(part for part in parts if part)


def paint_one(prompt: str, references: list[Path]) -> np.ndarray:
    content = [{"type": "input_text", "text": prompt}]
    content += [{"type": "input_image", "image_url": data_url(path)} for path in references]
    response = client().responses.create(model=IMAGE_MODEL, input=[{"role": "user", "content": content}])
    image_b64 = next((item.result for item in response.output if item.type == "image_generation_call"), None)
    if image_b64 is None:
        raise RuntimeError(f"Muse Image returned no image ({response.status}, response {response.id}).")
    image = cv2.imdecode(np.frombuffer(base64.b64decode(image_b64), np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Muse Image returned an image that can't be read (response {response.id}).")
    return image


def paint(record: dict, folder: Path, references: list[Path]) -> None:
    """Path A: Muse Image paints each usable concept, and its band layout is read back off the painting.

    Writes concept-N-muse.png and concept-N-layout.png to folder and records them
    under the concept's "layout". A concept Muse couldn't paint, or whose layout
    can't be read, gets a "layout_note" and falls back on the spec's drawn flow.
    """
    size = tuple(record["canvas_px"])
    jobs = [(i, c) for i, c in enumerate(record["concepts"], start=1) if not c["warnings"]]

    def one(job: tuple[int, dict]) -> None:
        i, concept = job
        prompt = image_prompt(concept, size, record["style"]["preset"], bool(references))
        try:
            painting = paint_one(prompt, references)
        except Exception as error:  # noqa: BLE001 - one failed painting keeps its drawn layout
            concept["layout_note"] = f"Muse Image couldn't paint it ({str(error)[:120]}); showing a simple drawn layout, not this composition."
            return
        cv2.imwrite(str(folder / f"concept-{i}-muse.png"), painting)
        ordered = concept["in_sequence"] and concept["flow"] not in PANEL_FLOWS
        layout = layouts.read_layout(painting, [band["hex"] for band in concept["bands"]], size, ordered)
        if problems := layouts.problems(layout, [band["name"] for band in concept["bands"]]):
            concept["layout_note"] = f"Muse's painting couldn't be read band by band ({'; '.join(problems)}); showing a simple drawn layout, not this composition."
            return
        layouts.write_layout(layout, folder / f"concept-{i}-layout.png")
        concept["layout"] = {
            "image": f"concept-{i}-muse.png", "map": f"concept-{i}-layout.png",
            "shares": layout.shares, "color_de": layout.color_de, "prompt": prompt,
        }

    with ThreadPoolExecutor(max_workers=len(jobs) or 1) as pool:
        list(pool.map(one, jobs))


def render(record: dict, folder: Path) -> list[Path]:
    """Paint each concept with the relief renderer (needs Node 22+)."""
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Rendering needs Node 22+ on PATH.")
    width, height = record["canvas_px"]
    images = []
    for i, concept in enumerate(record["concepts"], start=1):
        if concept["warnings"]:
            print(f"Skipping concept {i} ({concept['title']}): {'; '.join(concept['warnings'])}")
            continue
        spec, image = folder / f"concept-{i}.json", folder / f"concept-{i}.png"
        spec.write_text(json.dumps(concept, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        subprocess.run(
            [node, str(RENDERER), str(spec), str(image), "--seed", str(i), "--width", str(width), "--height", str(height)],
            check=True, capture_output=True,
        )
        images.append(image)
    return images


def print_concepts(record: dict) -> None:
    style = record["style"]
    print(f"Style: {style['preset'] or ('from references' if style['references'] else 'from the brief')}"
          + (f" + {len(style['references'])} reference(s)" if style["references"] and style["preset"] else ""))
    for i, concept in enumerate(record["concepts"], start=1):
        print(f"\n{i}. {concept['title']} (nearest flow: {concept['flow']})")
        print(f"   {concept['idea']}")
        print(f"   {concept['composition']}")
        for band in concept["bands"]:
            mixed = f"  → mix {band['mix']['hex']} ΔE {band['mix']['delta_e']:.1f}" if "mix" in band else ""
            print(f"   {band['hex']}  {band['name']:<18} width {band['width']:<4g} {band['relief']:<6}{mixed}")
        if "layout" in concept:
            print(f"   Muse layout: {concept['layout']['map']}, band shares {concept['layout']['shares']}")
        for warning in concept["warnings"] + concept.get("mix_warnings", []) + [concept.get("layout_note")] * ("layout_note" in concept):
            print(f"   ⚠️  {warning}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--brief", type=Path, help="brief.json from impasto.brief")
    parser.add_argument("--preset", choices=sorted(PRESETS), help="style preset, which limits the flows")
    parser.add_argument("--reference", action="append", type=Path, default=[],
                        help="style reference photo; repeat for several")
    parser.add_argument("--muse", action="store_true", help="Path A: Muse Image paints each concept and its band layout is read back")
    parser.add_argument("--render", action="store_true", help="paint each concept with the relief renderer (drawn layout)")
    parser.add_argument("--without", action="append", default=[], metavar="TUBE",
                        help="leave out a tube for this piece; repeat for several")
    parser.add_argument("--paste-in-mix", action="store_true", help="paste is mixed into the color")
    parser.add_argument("--out", type=Path, help="output folder")
    args = parser.parse_args()

    brief = json.loads(args.brief.read_text(encoding="utf-8"))["brief"] if args.brief else None
    for path in args.reference:
        if not path.is_file():
            parser.error(f"No such reference: {path}")
    try:
        without(PLACEHOLDER_INVENTORY, args.without)  # fail before spending a Spark call
    except ValueError as error:
        parser.error(str(error))
    record = draft(brief, args.preset, args.reference)
    record["brief"] = str(args.brief) if args.brief else None
    mix(record, args.without, args.paste_in_mix)

    folder = args.out or OUTPUT_ROOT / (args.preset or ("references" if args.reference else "from-brief"))
    folder.mkdir(parents=True, exist_ok=True)
    if args.muse:
        paint(record, folder, args.reference)
    (folder / "concepts.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print_concepts(record)
    print(f"\nWrote {folder / 'concepts.json'}")
    if args.render:
        for image in render(record, folder):
            print(f"Rendered {image}")


if __name__ == "__main__":
    main()
