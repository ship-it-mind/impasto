"""Spike: does SAM 3.1 give one mask per band when prompted with points?

    # points picked by hand, in image pixels
    uv run spikes/sam_points.py spikes/inputs/painting.jpg \
        --point cream=900,400 --point plum=860,1000
    # points picked by Muse Spark
    uv run spikes/sam_points.py spikes/inputs/painting.jpg --spark

All bands go in one SAM request, one object per band. Repeat a band name to
give it several points, e.g. one at each end of a long band. Writes
spikes/output/sam-points/<image>-<source>[-multi]/ with summary.json,
overlay.png and one overlay-NN-<band>.png per band.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from pathlib import Path

from meta_sam_parser import FramePrompt, PromptObject, PromptPoint, build_object_prompt
from PIL import Image, ImageChops, ImageOps

from common import client, data_url, output_dir, require_file
from sam_bands import TINTS, coverage_pct, mask_layer, segment

SPARK_MODEL = "muse-spark-1.3"

SPARK_PROMPT = """This is a photo of a palette-knife / impasto painting made of flowing color bands.
List every distinct color band in order. For each band give a short color name and one
point that lies well inside the band, away from its edges, as fractions of the image
width (x) and height (y) from the top-left corner."""

POINTS_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "band_points",
        "schema": {
            "type": "object",
            "properties": {
                "bands": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "color_name": {"type": "string"},
                            "x": {"type": "number"},
                            "y": {"type": "number"},
                        },
                        "required": ["color_name", "x", "y"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["bands"],
            "additionalProperties": False,
        },
    },
}


def parse_point(value: str) -> tuple[str, int, int]:
    name, _, coords = value.partition("=")
    x, _, y = coords.partition(",")
    return name, int(x), int(y)


def group_points(points: list[tuple[str, int, int]]) -> list[tuple[str, list[tuple[int, int]]]]:
    """Merge points that share a band name, keeping first-seen band order."""
    bands: dict[str, list[tuple[int, int]]] = {}
    for name, x, y in points:
        bands.setdefault(name, []).append((x, y))
    return list(bands.items())


def spark_points(image: Path, size: tuple[int, int]) -> list[tuple[str, int, int]]:
    response = client().chat.completions.create(
        model=SPARK_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SPARK_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url(image)}},
                ],
            }
        ],
        response_format=POINTS_SCHEMA,
    )
    bands = json.loads(response.choices[0].message.content)["bands"]
    width, height = size
    return [
        (
            band["color_name"],
            min(width - 1, max(0, round(band["x"] * width))),
            min(height - 1, max(0, round(band["y"] * height))),
        )
        for band in bands
    ]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--point",
        action="append",
        type=parse_point,
        metavar="NAME=X,Y",
        help="a point inside one band, in image pixels; repeat a name for more points",
    )
    source.add_argument("--spark", action="store_true", help="ask Muse Spark for the points")
    args = parser.parse_args()
    image = require_file(args.image)
    # SAM coordinates are in the image as displayed, after EXIF rotation.
    photo = ImageOps.exif_transpose(Image.open(image)).convert("RGB")

    started = time.perf_counter()
    bands_points = group_points(spark_points(image, photo.size) if args.spark else args.point)
    spark_latency = time.perf_counter() - started if args.spark else None
    source = "spark" if args.spark else "manual"
    multi = any(len(points) > 1 for _, points in bands_points)
    out = output_dir(f"sam-points/{image.stem}-{source}{'-multi' if multi else ''}")

    prompt = build_object_prompt(
        size=photo.size,
        objects=[
            PromptObject(
                id=index,
                prompts=[FramePrompt(points=[PromptPoint(x, y) for x, y in points])],
            )
            for index, (_, points) in enumerate(bands_points)
        ],
    )
    started = time.perf_counter()
    result = await segment(image, prompt)
    sam_latency = time.perf_counter() - started

    masks_by_object: dict[str, list] = {}
    for record in result.records:
        if record.kind == "mask":
            masks_by_object.setdefault(record.object_id, []).append(record)

    overlay = photo.copy()
    everything = Image.new("L", photo.size, 0)
    overlaps = Image.new("L", photo.size, 0)
    bands = []
    for index, (name, points) in enumerate(bands_points):
        tint = TINTS[index % len(TINTS)]
        union = Image.new("L", photo.size, 0)
        records = masks_by_object.get(str(index), [])
        for record in records:
            union.paste(255, mask=mask_layer(record, photo.size))
        overlaps.paste(255, mask=ImageChops.multiply(everything, union))
        everything.paste(255, mask=union)

        tinted = Image.new("RGB", photo.size, tint)
        overlay.paste(Image.blend(overlay, tinted, 0.55), mask=union)
        single = photo.copy()
        single.paste(Image.blend(single, tinted, 0.55), mask=union)
        for canvas in (overlay, single):
            for x, y in points:
                canvas.paste((255, 255, 255), (x - 9, y - 9, x + 9, y + 9))
                canvas.paste(tint, (x - 6, y - 6, x + 6, y + 6))
        single.save(out / f"overlay-{index:02d}-{slug(name)}.png")

        bands.append(
            {
                "object_id": str(index),
                "name": name,
                "points": [[x, y] for x, y in points],
                "tint": "#%02x%02x%02x" % tint,
                "mask_count": len(records),
                "confidence": [r.confidence for r in records],
                "coverage_pct": round(coverage_pct(union), 2),
            }
        )
        print(
            f"{index}. {name:<24} {len(points)} point(s)  {len(records)} mask(s)  "
            f"{coverage_pct(union):5.1f}%"
        )

    summary = {
        "image": str(image),
        "source": source,
        "outcome": result.outcome.status,
        "spark_latency_s": None if spark_latency is None else round(spark_latency, 2),
        "sam_latency_s": round(sam_latency, 2),
        "prompt": prompt,
        "total_coverage_pct": round(coverage_pct(everything), 2),
        "overlap_pct": round(coverage_pct(overlaps), 2),
        "bands": bands,
        "unexpected_object_ids": sorted(
            set(masks_by_object) - {str(i) for i in range(len(bands_points))}
        ),
        "diagnostics": [
            {"severity": d.severity, "code": d.code, "message": d.message}
            for d in result.diagnostics
        ],
    }
    overlay.save(out / "overlay.png")
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(
        f"\n{result.outcome.status} in {sam_latency:.1f}s; bands cover "
        f"{summary['total_coverage_pct']}% of the photo, {summary['overlap_pct']}% overlapping"
    )
    print(f"Wrote {out}")


if __name__ == "__main__":
    asyncio.run(main())
