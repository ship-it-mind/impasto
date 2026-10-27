"""Spike: can Muse Image make a concept in her vocabulary, and does the style hold?

    # text only
    uv run spikes/image_concept.py --name text-only
    # steered by her past works
    uv run spikes/image_concept.py --name with-refs \
        --reference spikes/inputs/past/01.jpg --reference spikes/inputs/past/02.jpg

Writes spikes/output/image/<name>.<ext> plus <name>.json with the prompt,
references, model message, latency and token usage. Run once with and once
without references to compare.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import time
from pathlib import Path

from PIL import Image

from common import client, data_url, output_dir, require_file

MODEL = "muse-image-1.0"

DEFAULT_PROMPT = (
    "A palette-knife impasto painting, shot straight-on as a flat canvas with no frame "
    "or room: broad flowing bands of color sweeping diagonally across the canvas, "
    "a muted palette, thick knife-applied paste with visible ridges and texture."
)

REFERENCE_PREFIX = (
    "These photos are the artist's past works. Make a new composition in the same "
    "style, palette and knife texture, without copying any one of them. "
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="output file stem")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument(
        "--reference",
        action="append",
        type=Path,
        default=[],
        help="style reference image; repeat for several",
    )
    args = parser.parse_args()
    references = [require_file(path) for path in args.reference]

    prompt = (REFERENCE_PREFIX + args.prompt) if references else args.prompt
    content = [{"type": "input_text", "text": prompt}]
    content += [{"type": "input_image", "image_url": data_url(path)} for path in references]

    started = time.perf_counter()
    response = client().responses.create(
        model=MODEL,
        input=[{"role": "user", "content": content}],
    )
    latency = time.perf_counter() - started

    image_b64 = next(
        (item.result for item in response.output if item.type == "image_generation_call"),
        None,
    )
    message = " ".join(
        part.text
        for item in response.output
        if item.type == "message"
        for part in item.content
        if getattr(part, "text", None)
    )
    if image_b64 is None:
        raise RuntimeError(f"No image in response {response.id} ({response.status}): {message}")

    image_bytes = base64.b64decode(image_b64)
    image_format = Image.open(io.BytesIO(image_bytes)).format.lower()
    out = output_dir("image")
    image_path = out / f"{args.name}.{image_format}"
    image_path.write_bytes(image_bytes)

    meta = {
        "model": MODEL,
        "response_id": response.id,
        "status": response.status,
        "prompt": prompt,
        "references": [str(path) for path in references],
        "message": message,
        "latency_s": round(latency, 2),
        "usage": response.usage.model_dump() if response.usage else None,
    }
    (out / f"{args.name}.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"{response.status} in {latency:.1f}s, {len(references)} reference(s)")
    print(f"Wrote {image_path}")


if __name__ == "__main__":
    main()
