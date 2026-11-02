"""Spike: does Muse Image make the wall mockup look real, where the flat paste-on doesn't?

The app draws the painting onto the wall photo in perspective, flat: no shadow, and the
room's light and shade don't fall on it. Here Muse Image gets that flat mockup and is
asked to make the painting look hung, then its answer is kept only in and around the
painting, so the rest of the photo stays exactly as it was taken.

    uv run spikes/wall_inpaint.py --wall W.jpg --painting P.png --center 1150 720 \
        --size-cm 150 180 --px-per-cm 4.27 [--dry-run]

Writes spikes/output/wall-inpaint/: flat.png (today's mockup), muse-raw.png (Muse's
whole answer), muse-kept.png (Muse's answer around the painting only), compare.jpg,
and run.json with the prompt and latency.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import output_dir, require_file  # noqa: E402
from impasto.concepts import paint_one  # noqa: E402
from impasto.layout import crop_to  # noqa: E402

PROMPT = """The first image is a photo of a wall with a painting digitally pasted onto it. It looks fake: flat, with no
depth, and the room's light doesn't touch it. The second image is that painting on its own.

Return the same photo with the painting looking really hung on that wall, as if photographed there:
- It's a palette-knife / impasto painting on a stretched canvas a few centimeters deep, with no frame. Show the canvas's
  thin side edge where the camera angle would show it, and its thick paste catching the light.
- Light it as the room lights the wall around it: the same brightness, warmth and falloff across it. Any shadow falling
  on the wall where it hangs (such as a plant's) falls across the painting too.
- It casts a soft, natural shadow on the wall, matching the direction and softness of the room's light.
- Keep the painting itself exactly: its composition, colors and strokes, its position, size and corners in the photo.
- Change nothing else in the photo: same framing, same wall, same objects, same everything outside the painting and its
  shadow."""

# Muse's answer is kept out to this share of the painting's longer side beyond its edges, and faded in over it.
KEEP_MARGIN = 0.12
FADE = 0.05


def quad(center: tuple[float, float], width: float, height: float) -> np.ndarray:
    x, y = center
    return np.float32([[x - width / 2, y - height / 2], [x + width / 2, y - height / 2], [x + width / 2, y + height / 2], [x - width / 2, y + height / 2]])


def flat_mockup(wall: np.ndarray, painting: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """The painting cropped to the corners' shape and drawn onto them, as the app's Save image does (less its drop shadow)."""
    across = (np.linalg.norm(corners[1] - corners[0]) + np.linalg.norm(corners[2] - corners[3])) / 2
    down = (np.linalg.norm(corners[3] - corners[0]) + np.linalg.norm(corners[2] - corners[1])) / 2
    art = crop_to(painting, (round(across), round(down)))
    h, w = art.shape[:2]
    warp = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), corners)
    size = (wall.shape[1], wall.shape[0])
    drawn = cv2.warpPerspective(art, warp, size, flags=cv2.INTER_AREA)
    inside = cv2.warpPerspective(np.full((h, w), 255, np.uint8), warp, size)
    out = wall.copy()
    out[inside > 0] = drawn[inside > 0]
    return out


def keep_around(wall: np.ndarray, answer: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """The wall photo as taken, with Muse's answer in and around the painting, faded in."""
    mask = np.zeros(wall.shape[:2], np.float32)
    cv2.fillConvexPoly(mask, corners.astype(np.int32), 1.0)
    long_side = max(np.ptp(corners[:, 0]), np.ptp(corners[:, 1]))
    reach = 2 * round(KEEP_MARGIN * long_side) + 1
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (reach, reach)))
    mask = cv2.GaussianBlur(mask, (0, 0), FADE * long_side)[..., None]
    return np.round(answer * mask + wall * (1 - mask)).astype(np.uint8)


def side_by_side(images: list[np.ndarray], labels: list[str], height: int = 900) -> np.ndarray:
    panels = []
    for image, label in zip(images, labels):
        scaled = cv2.resize(image, (round(image.shape[1] * height / image.shape[0]), height), interpolation=cv2.INTER_AREA)
        cv2.putText(scaled, label, (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 6, cv2.LINE_AA)
        cv2.putText(scaled, label, (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 2, cv2.LINE_AA)
        panels.append(scaled)
    return np.hstack(panels)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wall", type=Path, required=True)
    parser.add_argument("--painting", type=Path, required=True)
    parser.add_argument("--center", type=float, nargs=2, required=True, help="the painting's center, in wall photo pixels")
    parser.add_argument("--size-cm", type=float, nargs=2, required=True)
    parser.add_argument("--px-per-cm", type=float, required=True)
    parser.add_argument("--dry-run", action="store_true", help="only write the flat mockup")
    args = parser.parse_args()

    out = output_dir("wall-inpaint")
    wall = cv2.imread(str(require_file(args.wall)))
    painting = cv2.imread(str(require_file(args.painting)))
    corners = quad(tuple(args.center), args.size_cm[0] * args.px_per_cm, args.size_cm[1] * args.px_per_cm)
    flat = flat_mockup(wall, painting, corners)
    cv2.imwrite(str(out / "flat.png"), flat)
    if args.dry_run:
        print(out / "flat.png")
        return

    cut = out / "painting-cut.png"
    across, down = args.size_cm
    cv2.imwrite(str(cut), crop_to(painting, (round(1000 * across / max(across, down)), round(1000 * down / max(across, down)))))
    started = time.monotonic()
    answer = paint_one(PROMPT, [out / "flat.png", cut])
    seconds = round(time.monotonic() - started, 1)
    cv2.imwrite(str(out / "muse-raw.png"), answer)
    print(f"Muse answered {answer.shape[1]}x{answer.shape[0]} in {seconds}s for a {wall.shape[1]}x{wall.shape[0]} photo")

    # Muse may answer at another size: back to the photo's, cropped to its shape if the shape changed.
    fitted = crop_to(answer, (wall.shape[1], wall.shape[0]))
    kept = keep_around(wall, fitted, corners)
    cv2.imwrite(str(out / "muse-kept.png"), kept)
    cv2.imwrite(str(out / "compare.jpg"), side_by_side([flat, fitted, kept], ["today (flat)", "Muse, whole answer", "Muse, kept around the painting"]))
    (out / "run.json").write_text(json.dumps({
        "prompt": PROMPT, "wall": str(args.wall), "painting": str(args.painting), "corners": corners.tolist(),
        "answer_px": [answer.shape[1], answer.shape[0]], "seconds": seconds,
    }, indent=2))


if __name__ == "__main__":
    main()
