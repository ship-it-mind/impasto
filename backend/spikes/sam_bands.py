"""Spike: does SAM 3.1 give one clean mask per color band, or split on texture?

    uv run spikes/sam_bands.py spikes/inputs/painting.jpg \
        --concept "teal paint band" --concept "white paint band"

SAM takes one short noun phrase per request, so each --concept is a separate
call. Writes spikes/output/sam/<image>/ with summary.json, overlay.png
(every mask tinted on the photo, one color per concept) and one
overlay-NN-<concept>.png per concept.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from collections.abc import AsyncIterable, AsyncIterator
from contextlib import aclosing
from pathlib import Path
from typing import Any

from meta_sam_parser import (
    ImageSegmentationResult,
    ResponsesEventLike,
    SegmentationMaskRecord,
    decode_mask_to_raster,
    image_segmentation_format,
    parse_responses_stream,
)
from PIL import Image

from common import async_client, data_url, output_dir, require_file

MODEL = "sam-3.1"

TINTS = [
    (230, 25, 75),
    (60, 180, 75),
    (255, 225, 25),
    (0, 130, 200),
    (245, 130, 48),
    (145, 30, 180),
    (70, 240, 240),
    (240, 50, 230),
]


async def stream_events(stream: AsyncIterable[Any]) -> AsyncIterator[ResponsesEventLike]:
    """Adapted from the meta-model-cookbook SAM example (MIT).

    The API streams `response.content_part.done` but not
    `response.output_text.done`, which the parser needs to close a lane, so
    synthesize it from the content part.
    """
    completed_lanes: set[tuple[object, object, object]] = set()
    async for event in stream:
        data = event.model_dump() if hasattr(event, "model_dump") else dict(event)
        lane = (data.get("item_id"), data.get("output_index"), data.get("content_index"))
        if data.get("type") == "response.output_text.done":
            if lane not in completed_lanes:
                completed_lanes.add(lane)
                yield data
            continue
        yield data
        part = data.get("part")
        if (
            data.get("type") == "response.content_part.done"
            and lane not in completed_lanes
            and isinstance(part, dict)
            and part.get("type") == "output_text"
            and isinstance(part.get("text"), str)
        ):
            completed_lanes.add(lane)
            yield {
                "type": "response.output_text.done",
                "item_id": data.get("item_id"),
                "output_index": data.get("output_index"),
                "content_index": data.get("content_index"),
                "text": part["text"],
            }


async def segment(image: Path, concept: str) -> ImageSegmentationResult:
    async with async_client() as api:
        stream = await api.responses.create(
            model=MODEL,
            stream=True,
            input=[
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": concept},
                        {"type": "input_image", "image_url": data_url(image)},
                    ],
                }
            ],
        )
        # Close the event generator before the response; see the cookbook.
        async with stream, aclosing(stream_events(stream)) as events:
            parsed = parse_responses_stream(events, image_segmentation_format())
            return await parsed.final_result()


def mask_layer(record: SegmentationMaskRecord, size: tuple[int, int]) -> Image.Image:
    """Place a mask's own raster into a full-image layer at its bounds."""
    mask = record.mask
    raster = decode_mask_to_raster(mask)
    small = Image.frombytes("L", (mask.width, mask.height), bytes(v * 255 for v in raster))
    bounds = record.bounds
    left, top = round(bounds.left), round(bounds.top)
    width = max(1, round(bounds.right) - left)
    height = max(1, round(bounds.bottom) - top)
    layer = Image.new("L", size, 0)
    layer.paste(small.resize((width, height), Image.Resampling.NEAREST), (left, top))
    return layer


def coverage_pct(layer: Image.Image) -> float:
    histogram = layer.histogram()
    return 100 * sum(histogram[128:]) / (layer.width * layer.height)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument(
        "--concept",
        action="append",
        required=True,
        help="short noun phrase; repeat for a separate request per band",
    )
    args = parser.parse_args()
    image = require_file(args.image)
    photo = Image.open(image).convert("RGB")
    out = output_dir(f"sam/{image.stem}")

    overlay = photo.copy()
    summaries = []
    for index, concept in enumerate(args.concept):
        print(f"Segmenting {concept!r}...", flush=True)
        started = time.perf_counter()
        result = await segment(image, concept)
        latency = time.perf_counter() - started

        masks = [r for r in result.records if r.kind == "mask"]
        tint = TINTS[index % len(TINTS)]
        union = Image.new("L", photo.size, 0)
        mask_summaries = []
        for record in masks:
            layer = mask_layer(record, photo.size)
            union.paste(255, mask=layer)
            mask_summaries.append(
                {
                    "object_id": record.object_id,
                    "confidence": record.confidence,
                    "coverage_pct": round(coverage_pct(layer), 2),
                }
            )
        overlay.paste(
            Image.blend(overlay, Image.new("RGB", photo.size, tint), 0.55), mask=union
        )
        # Tints overlap in the combined overlay, so keep one per concept too.
        single = photo.copy()
        single.paste(Image.blend(single, Image.new("RGB", photo.size, tint), 0.55), mask=union)
        single.save(out / f"overlay-{index:02d}-{re.sub(r'[^a-z0-9]+', '-', concept.lower())}.png")

        summaries.append(
            {
                "concept": concept,
                "tint": "#%02x%02x%02x" % tint,
                "outcome": result.outcome.status,
                "latency_s": round(latency, 2),
                "mask_count": len(masks),
                "union_coverage_pct": round(coverage_pct(union), 2),
                "masks": mask_summaries,
                "diagnostics": [
                    {"severity": d.severity, "code": d.code, "message": d.message}
                    for d in result.diagnostics
                ],
            }
        )
        print(
            f"  {result.outcome.status}: {len(masks)} mask(s), "
            f"{coverage_pct(union):.1f}% of the photo, {latency:.1f}s"
        )

    overlay.save(out / "overlay.png")
    (out / "summary.json").write_text(json.dumps(summaries, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out / 'summary.json'} and {out / 'overlay.png'}")


if __name__ == "__main__":
    asyncio.run(main())
