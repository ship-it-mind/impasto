"""Spike: can Muse Spark read a painting photo into usable band structure?

    uv run spikes/spark_bands.py spikes/inputs/painting.jpg

Writes spikes/output/spark/<image>.json with the parsed bands, latency and
token usage.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from common import client, data_url, output_dir, require_file

MODEL = "muse-spark-1.3"

PROMPT = """This is a photo of a palette-knife / impasto painting made of flowing color bands.
List every distinct color band from one edge of the canvas to the other, in order.
For each band give its approximate color as a hex value, a short color name,
its rough share of the canvas area, and the direction the band flows."""

BANDS_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "painting_bands",
        "schema": {
            "type": "object",
            "properties": {
                "orientation": {
                    "type": "string",
                    "description": "how the bands are stacked, e.g. top-to-bottom",
                },
                "bands": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "order": {"type": "integer"},
                            "color_name": {"type": "string"},
                            "approx_hex": {"type": "string"},
                            "area_share_pct": {"type": "number"},
                            "flow_direction": {"type": "string"},
                        },
                        "required": [
                            "order",
                            "color_name",
                            "approx_hex",
                            "area_share_pct",
                            "flow_direction",
                        ],
                        "additionalProperties": False,
                    },
                },
                "notes": {"type": "string"},
            },
            "required": ["orientation", "bands", "notes"],
            "additionalProperties": False,
        },
    },
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--model", default=MODEL)
    args = parser.parse_args()
    image = require_file(args.image)

    started = time.perf_counter()
    response = client().chat.completions.create(
        model=args.model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url(image)}},
                ],
            }
        ],
        response_format=BANDS_SCHEMA,
    )
    latency = time.perf_counter() - started

    bands = json.loads(response.choices[0].message.content)
    result = {
        "model": args.model,
        "image": str(image),
        "latency_s": round(latency, 2),
        "usage": response.usage.model_dump() if response.usage else None,
        "result": bands,
    }
    out = output_dir("spark") / f"{image.stem}.json"
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

    for band in bands["bands"]:
        print(
            f"{band['order']:>2}. {band['approx_hex']}  {band['color_name']:<20} "
            f"{band['area_share_pct']:>5.1f}%  {band['flow_direction']}"
        )
    total = sum(band["area_share_pct"] for band in bands["bands"])
    print(f"\n{len(bands['bands'])} bands, shares sum to {total:.1f}%, {latency:.1f}s")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
