"""Spike: how should Muse Image get its style when the user picks a preset?

Muse Image gave generic texture from a one-line prompt on Day 1. Presets are
text only, so this compares ways of feeding them, N images per preset:

    # 1. detailed preset prompt, no references
    uv run spikes/preset_concepts.py --arm text
    # 2. the best text-only image per preset, fed back as that preset's reference
    uv run spikes/preset_concepts.py --arm self-ref \
        --pick flowing-bands=spikes/output/preset-concepts/text/flowing-bands-2.webp ...
    # 3. an artist's past works as references, combined with each preset
    uv run spikes/preset_concepts.py --arm artist-ref \
        --reference spikes/inputs/past/01.jpg --reference spikes/inputs/past/02.jpg

Writes spikes/output/preset-concepts/<arm>/<preset>-<n>.<ext>, results.json
(prompt, references, latency, tokens per image) and sheet.png: one row per
preset, for judging side by side.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw

from common import async_client, data_url, output_dir, require_file

# The presets live in the package; spikes run as plain scripts from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from impasto.presets import PRESETS, image_prompt  # noqa: E402

MODEL = "muse-image-1.0"
CONCURRENCY = 3

SELF_REF_PREFIX = (
    "This image shows the target style. Make a new, different composition in the same style, "
    "palette and knife texture, without copying it. "
)
ARTIST_REF_PREFIX = (
    "These photos are an artist's past works. Use their look, palette and knife texture, but "
    "follow the composition and relief described below, and make a new composition that "
    "copies none of them. "
)


def jobs(args: argparse.Namespace) -> list[dict]:
    if args.arm == "text":
        plan = {key: ("", image_prompt(key), []) for key in PRESETS}
    elif args.arm == "self-ref":
        picks = dict(args.pick)
        if unknown := set(picks) - set(PRESETS):
            raise SystemExit(f"Unknown preset(s): {', '.join(sorted(unknown))}")
        plan = {key: (SELF_REF_PREFIX, image_prompt(key), [require_file(path)]) for key, path in picks.items()}
    else:
        references = [require_file(path) for path in args.reference]
        # The references set the palette, so the preset's fallback palette is left out.
        plan = {key: (ARTIST_REF_PREFIX, image_prompt(key, palette=[]), references) for key in PRESETS}
    return [
        {"preset": key, "n": n, "prompt": prefix + prompt, "references": references}
        for key, (prefix, prompt, references) in plan.items()
        for n in range(1, args.images + 1)
    ]


async def generate(api, job: dict, out: Path, limit: asyncio.Semaphore) -> dict:
    content = [{"type": "input_text", "text": job["prompt"]}]
    content += [{"type": "input_image", "image_url": data_url(path)} for path in job["references"]]
    result = {**job, "references": [str(path) for path in job["references"]]}
    async with limit:
        started = time.perf_counter()
        try:
            response = await api.responses.create(model=MODEL, input=[{"role": "user", "content": content}])
        except Exception as error:  # one failed image shouldn't sink the run
            return {**result, "error": str(error)}
        result["latency_s"] = round(time.perf_counter() - started, 2)

    image_b64 = next((item.result for item in response.output if item.type == "image_generation_call"), None)
    result["response_id"] = response.id
    result["usage"] = response.usage.model_dump() if response.usage else None
    if image_b64 is None:
        return {**result, "error": f"no image ({response.status})"}
    image_bytes = base64.b64decode(image_b64)
    image_format = Image.open(io.BytesIO(image_bytes)).format.lower()
    path = out / f"{job['preset']}-{job['n']}.{image_format}"
    path.write_bytes(image_bytes)
    result["image"] = str(path)
    return result


def contact_sheet(results: list[dict], path: Path, cell: int = 360, label: int = 44) -> None:
    rows = list(dict.fromkeys(r["preset"] for r in results))
    columns = max(r["n"] for r in results)
    sheet = Image.new("RGB", (columns * cell, len(rows) * (cell + label)), "white")
    draw = ImageDraw.Draw(sheet)
    for r in results:
        x, y = (r["n"] - 1) * cell, rows.index(r["preset"]) * (cell + label)
        if "image" in r:
            thumb = Image.open(r["image"]).convert("RGB")
            thumb.thumbnail((cell, cell))
            sheet.paste(thumb, (x + (cell - thumb.width) // 2, y + label))
            tokens = r["usage"]["total_tokens"] if r["usage"] else "?"
            caption = f"{r['latency_s']:.0f}s · {tokens} tok"
        else:
            caption = f"failed: {r['error'][:40]}"
        draw.text((x + 6, y + 4), f"{PRESETS[r['preset']]['name']} #{r['n']}", fill="black")
        draw.text((x + 6, y + 22), caption, fill="dimgray")
    sheet.save(path)


def parse_pick(text: str) -> tuple[str, Path]:
    key, sep, path = text.partition("=")
    if not sep:
        raise argparse.ArgumentTypeError("Use PRESET=PATH.")
    return key, Path(path)


async def run(args: argparse.Namespace) -> None:
    out = output_dir(f"preset-concepts/{args.arm}")
    limit = asyncio.Semaphore(CONCURRENCY)
    async with async_client() as api:
        results = await asyncio.gather(*(generate(api, job, out, limit) for job in jobs(args)))

    (out / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    contact_sheet(results, out / "sheet.png")
    done = [r for r in results if "image" in r]
    print(f"{len(done)}/{len(results)} images")
    if done:
        print(f"Latency {min(r['latency_s'] for r in done):.0f}–{max(r['latency_s'] for r in done):.0f} s")
    for r in results:
        if "error" in r:
            print(f"  {r['preset']} #{r['n']}: {r['error']}")
    print(f"Wrote {out / 'sheet.png'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--arm", required=True, choices=["text", "self-ref", "artist-ref"])
    parser.add_argument("--images", type=int, default=3, help="images per preset")
    parser.add_argument("--pick", action="append", type=parse_pick, default=[], metavar="PRESET=PATH",
                        help="self-ref: the reference image for one preset; repeat per preset")
    parser.add_argument("--reference", action="append", type=Path, default=[],
                        help="artist-ref: a past work, used for every preset; repeat for several")
    args = parser.parse_args()
    if args.arm == "self-ref" and not args.pick:
        parser.error("--arm self-ref needs at least one --pick PRESET=PATH.")
    if args.arm == "artist-ref" and not args.reference:
        parser.error("--arm artist-ref needs at least one --reference.")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
