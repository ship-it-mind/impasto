"""Spike: does a non-Meta image model hold the preset styles better than Muse Image? (OUR-149)

Same prompts and references as the preset experiment (preset_concepts.py): the text arm is
round 1, the artist-ref arm is round 3. N images per preset, landscape 4:3 wherever the
model takes a size (Muse Image doesn't). Muse runs on the Meta key; the rest run through
fal.ai, top tier of each, and need FAL_KEY in .env.

    # one model, one arm
    uv run spikes/image_models.py --model nano-banana-pro --arm text
    # every model, both arms
    uv run spikes/image_models.py --arm both \
        --reference spikes/inputs/past/01.jpg --reference spikes/inputs/past/02.jpg
    # only rebuild the comparison sheets from what's on disk
    uv run spikes/image_models.py --sheets

How each model sees the references: Nano Banana, GPT Image and FLUX 3 take them in context
with the round 3 prompt ("These photos are an artist's past works..."). Ideogram takes them as
style references and Recraft as a style made from them, so both get the prompt without
that opening.

Writes spikes/output/image-models/<model>/<arm>/<preset>-<n>.<ext> plus results.json, and
spikes/output/image-models/sheets/<arm>-<preset>.png: one row per model, #1–#3 across.
sheets/blind/ has the same sheets for the artist: rows lettered A–F, key in key.json.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import os
import tempfile
import time
import zipfile
from pathlib import Path

import fal_client
import httpx
from PIL import Image, ImageDraw

from common import REPO_ROOT, async_client, output_dir, require_file
from preset_concepts import ARTIST_REF_PREFIX, generate as generate_muse, jobs
from impasto.presets import PRESETS  # importable once preset_concepts has put backend/ on the path

ARMS = ["text", "artist-ref"]
CONCURRENCY = 3

# "refs": how references reach the model. "prompt" = in context, with the round 3 prompt;
# "style" = Ideogram style references; "style_id" = a Recraft style made from them.
MODELS = {
    "muse": {"name": "Muse Image (Meta)"},
    "nano-banana-pro": {
        "name": "Nano Banana Pro (Google)",
        "text": "fal-ai/nano-banana-pro",
        "ref": "fal-ai/nano-banana-pro/edit",
        "refs": "prompt",
        "args": {"aspect_ratio": "4:3", "resolution": "1K", "output_format": "png"},
    },
    "gpt-image-2": {
        "name": "GPT Image 2 (OpenAI)",
        "text": "openai/gpt-image-2",
        "ref": "openai/gpt-image-2/edit",
        "refs": "prompt",
        "args": {"image_size": "landscape_4_3", "quality": "high", "output_format": "png"},
    },
    "flux-3": {
        "name": "FLUX 3 Image (BFL)",
        "text": "blackforestlabs/flux-3/text-to-image",
        "ref": "blackforestlabs/flux-3/edit-image",
        "refs": "prompt",
        # Prompt expansion would rewrite the preset prompt, so every model reads the same words.
        "args": {"aspect_ratio": "4:3", "resolution": "1k", "output_format": "png",
                 "enable_prompt_expansion": False},
    },
    "ideogram-v3": {
        "name": "Ideogram 3 Quality",
        "text": "fal-ai/ideogram/v3",
        "ref": "fal-ai/ideogram/v3",
        "refs": "style",
        # MagicPrompt would rewrite the preset prompt, so every model reads the same words.
        "args": {"image_size": "landscape_4_3", "rendering_speed": "QUALITY", "expand_prompt": False},
    },
    "recraft-v3": {
        "name": "Recraft V3",
        "text": "fal-ai/recraft/v3/text-to-image",
        "ref": "fal-ai/recraft/v3/text-to-image",
        "refs": "style_id",
        "args": {"image_size": "landscape_4_3", "style": "realistic_image"},
    },
}
RECRAFT_CREATE_STYLE = "fal-ai/recraft/v3/create-style"
# Row order on the blind sheets, A first; shuffled so Muse isn't always the top row.
BLIND_ORDER = ["flux-3", "muse", "gpt-image-2", "recraft-v3", "nano-banana-pro", "ideogram-v3"]
ROOT = "image-models"


def require_fal_key() -> None:
    if not os.environ.get("FAL_KEY"):
        raise SystemExit(f"Set FAL_KEY in {REPO_ROOT / '.env'} to run the fal.ai models.")


async def recraft_style(references: list[Path]) -> str:
    """Recraft only takes references as a style: a zip of up to 5 PNGs, made once per run."""
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "references.zip"
        with zipfile.ZipFile(archive, "w") as zipped:
            for i, path in enumerate(references[:5], 1):
                png = io.BytesIO()
                Image.open(path).convert("RGB").save(png, "PNG")
                zipped.writestr(f"{i}.png", png.getvalue())
        url = await fal_client.upload_file_async(archive)
    response = await fal_client.subscribe_async(
        RECRAFT_CREATE_STYLE, arguments={"images_data_url": url, "base_style": "realistic_image"}
    )
    return response["style_id"]


async def generate_fal(model: str, job: dict, refs: dict, out: Path, limit: asyncio.Semaphore,
                       http: httpx.AsyncClient) -> dict:
    spec = MODELS[model]
    result = {**job, "references": [str(path) for path in job["references"]]}
    arguments = {**spec["args"], "prompt": job["prompt"]}
    endpoint = spec["text"]
    if job["references"]:
        endpoint = spec["ref"]
        if spec["refs"] == "prompt":
            arguments["image_urls"] = refs["urls"]
        else:
            # Style references aren't "photos" the model can see, so the round 3 opening is dropped.
            arguments["prompt"] = job["prompt"].removeprefix(ARTIST_REF_PREFIX)
            if spec["refs"] == "style":
                arguments["image_urls"] = refs["urls"]
            else:
                arguments.pop("style")
                arguments["style_id"] = refs["style_id"]
    result |= {"endpoint": endpoint, "prompt": arguments["prompt"]}

    async with limit:
        started = time.perf_counter()
        try:
            response = await fal_client.subscribe_async(endpoint, arguments=arguments, client_timeout=600)
            result["latency_s"] = round(time.perf_counter() - started, 2)
            image_bytes = (await http.get(response["images"][0]["url"])).raise_for_status().content
        except Exception as error:  # one failed image shouldn't sink the run
            return {**result, "error": str(error)}

    image_format = Image.open(io.BytesIO(image_bytes)).format.lower()
    path = out / f"{job['preset']}-{job['n']}.{image_format}"
    path.write_bytes(image_bytes)
    result["image"] = str(path)
    return result


async def run_model(model: str, arm: str, args: argparse.Namespace) -> list[dict]:
    plan = jobs(argparse.Namespace(arm=arm, images=args.images, reference=args.reference, pick=[]))
    out = output_dir(f"{ROOT}/{model}/{arm}")
    limit = asyncio.Semaphore(CONCURRENCY)
    if model == "muse":
        async with async_client() as api:
            results = await asyncio.gather(*(generate_muse(api, job, out, limit) for job in plan))
    else:
        refs = {}
        if arm == "artist-ref":
            if MODELS[model]["refs"] == "style_id":
                refs["style_id"] = await recraft_style(args.reference)
            else:
                refs["urls"] = [await fal_client.upload_file_async(path) for path in args.reference]
        async with httpx.AsyncClient(timeout=120) as http:
            results = await asyncio.gather(*(generate_fal(model, job, refs, out, limit, http) for job in plan))
        results = [{**r, **({"style_id": refs["style_id"]} if "style_id" in refs else {})} for r in results]

    (out / "results.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    done = [r for r in results if "image" in r]
    latency = f", {min(r['latency_s'] for r in done):.0f}–{max(r['latency_s'] for r in done):.0f} s" if done else ""
    print(f"{MODELS[model]['name']}, {arm}: {len(done)}/{len(results)} images{latency}")
    for r in results:
        if "error" in r:
            print(f"  {r['preset']} #{r['n']}: {r['error'][:200]}")
    return results


def sheets(blind: bool = False, cell: int = 360, label: int = 44) -> list[Path]:
    """One sheet per arm and preset: a row per model that has results on disk, #1–#3 across.

    blind: rows lettered A, B, C… in BLIND_ORDER, the same letter on every sheet, with no model
    names or timings, so the artist judges the paintings and not the brand. The key goes in key.json.
    """
    root = output_dir(ROOT)
    out = output_dir(f"{ROOT}/sheets/blind" if blind else f"{ROOT}/sheets")
    order = BLIND_ORDER if blind else list(MODELS)
    if blind:
        key = {chr(ord("A") + i): MODELS[model]["name"] for i, model in enumerate(order)}
        (out / "key.json").write_text(json.dumps(key, indent=2) + "\n", encoding="utf-8")
    written = []
    for arm in ARMS:
        results = {}
        for model in order:
            path = root / model / arm / "results.json"
            if path.is_file():
                results[model] = json.loads(path.read_text(encoding="utf-8"))
        if not results:
            continue
        columns = max(r["n"] for rows in results.values() for r in rows)
        for preset in PRESETS:
            sheet = Image.new("RGB", (columns * cell, len(results) * (cell + label)), "white")
            draw = ImageDraw.Draw(sheet)
            for row, (model, rows) in enumerate(results.items()):
                for r in (r for r in rows if r["preset"] == preset):
                    x, y = (r["n"] - 1) * cell, row * (cell + label)
                    if "image" in r:
                        thumb = Image.open(r["image"]).convert("RGB")
                        thumb.thumbnail((cell - 8, cell - 8))
                        sheet.paste(thumb, (x + (cell - thumb.width) // 2, y + label))
                        caption = "" if blind else f"{r['latency_s']:.0f}s"
                    else:
                        caption = f"failed: {r['error'][:40]}"
                    name = chr(ord("A") + order.index(model)) if blind else MODELS[model]["name"]
                    draw.text((x + 6, y + 4), f"{name} #{r['n']}", fill="black", font_size=18 if blind else None)
                    draw.text((x + 6, y + 22), caption, fill="dimgray")
            # Blind sheets go to the artist, so JPEG keeps the upload small.
            path = out / f"{arm}-{preset}.{'jpg' if blind else 'png'}"
            sheet.save(path, **({"quality": 88} if blind else {}))
            written.append(path)
    return written


async def run(args: argparse.Namespace) -> None:
    arms = ARMS if args.arm == "both" else [args.arm]
    # Models run side by side; each keeps its own concurrency limit.
    await asyncio.gather(*(run_model(model, arm, args) for model in args.model for arm in arms))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", action="append", choices=list(MODELS),
                        help="model to run; repeat for several (default: all)")
    parser.add_argument("--arm", choices=[*ARMS, "both"], default="both")
    parser.add_argument("--images", type=int, default=3, help="images per preset")
    parser.add_argument("--reference", action="append", type=Path, default=[],
                        help="artist-ref: a past work, used for every preset; repeat for several")
    parser.add_argument("--sheets", action="store_true", help="only rebuild the comparison sheets")
    args = parser.parse_args()
    if not args.sheets:
        args.model = args.model or list(MODELS)
        args.reference = [require_file(path) for path in args.reference]
        if args.arm != "text" and not args.reference:
            parser.error("--arm artist-ref and --arm both need at least one --reference.")
        if any(model != "muse" for model in args.model):
            require_fal_key()
        asyncio.run(run(args))
    for path in sheets() + sheets(blind=True):
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
