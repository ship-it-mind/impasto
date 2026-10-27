"""SAM 3.1 segmentation over the Responses API, decoded into numpy masks."""

from __future__ import annotations

from collections.abc import AsyncIterable, AsyncIterator
from contextlib import aclosing
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from meta_sam_parser import (
    ImageSegmentationResult,
    ResponsesEventLike,
    SegmentationMaskRecord,
    decode_mask_to_raster,
    image_segmentation_format,
    parse_responses_stream,
)

from impasto.meta import async_client, data_url

MODEL = "sam-3.1"


async def _stream_events(stream: AsyncIterable[Any]) -> AsyncIterator[ResponsesEventLike]:
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


async def segment(image: Path, prompt: str) -> ImageSegmentationResult:
    """Run SAM on an image with a noun phrase or an object-prompt string."""
    async with async_client() as api:
        stream = await api.responses.create(
            model=MODEL,
            stream=True,
            input=[
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": data_url(image)},
                    ],
                }
            ],
        )
        # Close the event generator before the response; see the cookbook.
        async with stream, aclosing(_stream_events(stream)) as events:
            result = await parse_responses_stream(
                events, image_segmentation_format()
            ).final_result()
    if result.outcome.status != "completed":
        raise RuntimeError(f"SAM segmentation was incomplete: {result.outcome}")
    return result


def mask_array(record: SegmentationMaskRecord, size: tuple[int, int]) -> np.ndarray:
    """Place a mask's own raster into a full-image boolean array at its bounds."""
    width, height = size
    mask = record.mask
    raster = np.frombuffer(decode_mask_to_raster(mask), dtype=np.uint8)
    raster = raster.reshape(mask.height, mask.width)
    bounds = record.bounds
    left, top = max(0, round(bounds.left)), max(0, round(bounds.top))
    right = min(width, max(left + 1, round(bounds.right)))
    bottom = min(height, max(top + 1, round(bounds.bottom)))
    placed = cv2.resize(raster, (right - left, bottom - top), interpolation=cv2.INTER_NEAREST)
    full = np.zeros((height, width), dtype=bool)
    full[top:bottom, left:right] = placed.astype(bool)
    return full


def masks_by_object(
    result: ImageSegmentationResult, size: tuple[int, int]
) -> dict[str, np.ndarray]:
    """Union of every mask record per object id, as full-image boolean arrays."""
    masks: dict[str, np.ndarray] = {}
    for record in result.records:
        if record.kind != "mask":
            continue
        layer = mask_array(record, size)
        if record.object_id in masks:
            masks[record.object_id] |= layer
        else:
            masks[record.object_id] = layer
    return masks
