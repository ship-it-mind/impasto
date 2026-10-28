"""Concepts: a brief + a style (preset and/or reference photos) → 3 band specs.

    uv run python -m impasto.concepts --brief output/brief/brief/brief.json --preset layered-horizon
    uv run python -m impasto.concepts --reference past1.jpg --reference past2.jpg --render
    uv run python -m impasto.concepts --render          # no brief, default preset
    uv run python -m impasto.concepts --render --without "Sap Green" --paste-in-mix

Muse Spark drafts three distinct compositions as structured specs: the flow,
then the bands in order across the canvas, each with a color, a relative width
and a relief level. Code checks them against the preset and adds Lab colors.
Each spec is what the relief renderer (web/relief/render.ts) paints, and what
the recipe step mixes, so nothing downstream guesses from pixels.

Each band also gets its Mixbox mix from the tubes on hand (impasto.mixing), and
the renderer paints that mix rather than Spark's color, so the preview shows
what the user can actually mix. A band whose mix is more than MAX_MIX_DE off
gets a warning; the concept still renders.

Style: a preset sets the flows, band count and relief; reference photos steer
the look and palette. Both can be given. References alone leave the layout to
Spark; with neither, the default preset is used. The palette comes from the
brief, else from the references, else from the preset's fallback.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

from impasto.color import hex_to_rgb, rgb_to_hex, rgb_to_lab
from impasto.meta import REPO_ROOT, client, data_url
from impasto.mixing import PLACEHOLDER_INVENTORY, Mixer, without
from impasto.presets import DEFAULT_PRESET, PRESETS
from impasto.volume import LEVELS, load_materials

MODEL = "muse-spark-1.3"
OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "concepts"
RENDERER = REPO_ROOT / "web" / "relief" / "render.ts"
ALL_FLOWS = sorted({flow for preset in PRESETS.values() for flow in preset["flows"]})
CONCEPTS = 3
LONG_SIDE_PX = 1000
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
# A band's mix this far (ΔE2000) from Spark's color is clearly off, so the concept is flagged.
MAX_MIX_DE = 3.0

PROMPT = """You are the studio assistant of a palette-knife / impasto painter. Design {n} concept
compositions for one piece. Each composition is a set of color bands laid across the canvas.

Write each one as a spec:
- flow: how the bands run. One of: {flows}.
- bands: {band_rule}, listed in order across the canvas (top to bottom for horizontal flows,
  from the inside out for arcs, from one side to the other for diagonals and waves; for grids
  and diagonal splits, the order only sets which colors sit next to each other).
  Each band has a short color name, a hex color as the painter would mix it, a width relative
  to the others (1 = average, 0.5 = narrow, 2 = wide), and a relief level ({levels}).
- relief: {relief_rule}
- title: a short, evocative title. idea: one sentence on what makes this composition different.

Make the {n} compositions clearly different from each other: different flows where more than
one is allowed, and otherwise a different band order, widths and placement of the thick band.
Every composition should be paintable by hand with a palette knife on a large canvas: broad bands,
no tiny shapes, and colors that sit well together rather than clashing accents.

{style}

Palette: {palette}
"""

PRESET_STYLE = "Style: {name}. {prompt}"
REFERENCE_STYLE = (
    "The attached photos show the style to follow: take the look, the palette and how the "
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
        "width": {"type": "number"},
        "relief": {"type": "string", "enum": list(LEVELS)},
    })
    concept = strict_object({
        "title": {"type": "string"},
        "idea": {"type": "string"},
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
    if preset_key is None and not references:
        preset_key = DEFAULT_PRESET
    preset = PRESETS[preset_key] if preset_key else None
    flows = preset["flows"] if preset else ALL_FLOWS
    band_range = preset["bands"] if preset else None

    style = [PRESET_STYLE.format(**preset)] if preset else []
    if references:
        style.append(REFERENCE_STYLE)
    prompt = PROMPT.format(
        n=CONCEPTS,
        flows=", ".join(flows),
        band_rule=f"{band_range[0]} to {band_range[1]} bands" if band_range else "2 to 6 bands",
        levels=" / ".join(LEVELS),
        relief_rule=relief_rule(preset["relief"]) if preset else "follow the reference photos: thick where they are thick.",
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
    print(f"Style: {style['preset'] or 'from references'}"
          + (f" + {len(style['references'])} reference(s)" if style["references"] and style["preset"] else ""))
    for i, concept in enumerate(record["concepts"], start=1):
        print(f"\n{i}. {concept['title']} ({concept['flow']})")
        print(f"   {concept['idea']}")
        for band in concept["bands"]:
            mixed = f"  → mix {band['mix']['hex']} ΔE {band['mix']['delta_e']:.1f}" if "mix" in band else ""
            print(f"   {band['hex']}  {band['name']:<18} width {band['width']:<4g} {band['relief']:<6}{mixed}")
        for warning in concept["warnings"] + concept.get("mix_warnings", []):
            print(f"   ⚠️  {warning}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--brief", type=Path, help="brief.json from impasto.brief")
    parser.add_argument("--preset", choices=sorted(PRESETS), help=f"style preset (default {DEFAULT_PRESET} if no references)")
    parser.add_argument("--reference", action="append", type=Path, default=[],
                        help="style reference photo; repeat for several")
    parser.add_argument("--render", action="store_true", help="paint each concept with the relief renderer")
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

    folder = args.out or OUTPUT_ROOT / (args.preset or ("references" if args.reference else DEFAULT_PRESET))
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "concepts.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print_concepts(record)
    print(f"\nWrote {folder / 'concepts.json'}")
    if args.render:
        for image in render(record, folder):
            print(f"Rendered {image}")


if __name__ == "__main__":
    main()
