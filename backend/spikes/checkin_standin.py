"""Stand-in check-in photos with known answers, until the artist's half-finished canvas arrives (OUR-158).

Takes a rendered concept (concept-N.png from `impasto.concepts --render`), paints
each band only part-way over primed canvas, optionally shifts one band's color,
and places the canvas in a phone-style photo: tilted, warm light, a sheet of
white paper beside it, sensor noise, JPEG. truth.json has the true coverage per
band and the corners and white point to pass to impasto.checkin.

    uv run spikes/checkin_standin.py output/concepts/flowing-bands/concept-1.json \
        --coverage 1,0.6,0,0,0 --name early
    uv run spikes/checkin_standin.py output/concepts/flowing-bands/concept-1.json \
        --coverage 1,1,1,0.4,0 --drift 2=-6,4,10 --name drift

--coverage gives each band's painted share, in band order; she paints each band
from the left, with a ragged front. --drift BAND=dL,da,db shifts that band's
painted color in CIELAB. Writes spikes/output/checkin-standin/<name>/photo.jpg
and truth.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from common import output_dir, require_file

# The check-in code lives in the package; spikes run as plain scripts from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from impasto.checkin import plan_band_map, seed_from_name, to_lab  # noqa: E402
from impasto.rectify import linear_to_srgb, srgb_to_linear  # noqa: E402

PHOTO_SIZE = (1600, 1200)
# Canvas corners in the photo (TL, TR, BR, BL): shot a little from the left and below.
CORNERS = [(250, 190), (1290, 240), (1270, 1000), (280, 1040)]
PAPER = [(1360, 520), (1560, 510), (1570, 760), (1365, 770)]
PRIMED = (236, 239, 242)  # BGR, off-white gesso
CAST = np.array([0.80, 0.97, 1.10])  # BGR gains in linear light: warm indoor light
EXPOSURE = 0.82


def partial(band_map: np.ndarray, coverage: list[float], rng: np.random.Generator) -> np.ndarray:
    """Painted pixels: each band from the left up to its coverage, with a ragged front."""
    height, width = band_map.shape
    noise = cv2.GaussianBlur(rng.normal(0, 1, (height, width)).astype(np.float32), (0, 0), 12)
    front = np.arange(width, dtype=np.float32)[None, :] + 0.04 * width * noise / noise.std()
    painted = np.zeros_like(band_map, dtype=bool)
    for index, share in enumerate(coverage):
        band = band_map == index
        if share <= 0 or not band.any():
            continue
        cut = np.quantile(front[band], min(share, 1.0)) if share < 1 else np.inf
        painted |= band & (front <= cut)
    return painted


def shift_lab(image: np.ndarray, mask: np.ndarray, delta: tuple[float, float, float]) -> np.ndarray:
    lab = to_lab(image)
    lab[mask] += np.array(delta, dtype=np.float32)
    bgr = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return np.clip(bgr * 255 + 0.5, 0, 255).astype(np.uint8)


def photograph(canvas: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    width, height = PHOTO_SIZE
    # A plain studio wall, a little lighter toward the window side.
    wall = np.linspace(150, 120, width, dtype=np.float32)[None, :, None] * np.array([0.95, 1.0, 1.05])
    photo = np.broadcast_to(wall, (height, width, 3)).copy()
    cv2.fillPoly(photo, [np.array(PAPER, dtype=np.int32)], (244, 246, 247))
    h, w = canvas.shape[:2]
    homography = cv2.getPerspectiveTransform(
        np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32), np.array(CORNERS, dtype=np.float32)
    )
    warped = cv2.warpPerspective(canvas, homography, PHOTO_SIZE, flags=cv2.INTER_AREA)
    inside = cv2.warpPerspective(np.ones((h, w), np.uint8), homography, PHOTO_SIZE) > 0
    photo[inside] = warped[inside]
    # The light: a color cast, underexposure and a gentle falloff away from the window.
    falloff = np.linspace(1.0, 0.94, width, dtype=np.float32)[None, :, None]
    linear = srgb_to_linear(photo) * CAST * EXPOSURE * falloff
    photo = linear_to_srgb(linear).astype(np.float32)
    photo = cv2.GaussianBlur(photo, (0, 0), 0.8) + rng.normal(0, 2.0, photo.shape)
    return np.clip(photo, 0, 255).astype(np.uint8)


def parse_drift(value: str) -> tuple[int, tuple[float, float, float]]:
    band, _, delta = value.partition("=")
    d_l, d_a, d_b = (float(v) for v in delta.split(","))
    return int(band), (d_l, d_a, d_b)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("concept", type=Path, help="concept-N.json, rendered next to it as concept-N.png")
    parser.add_argument("--coverage", required=True, help="painted share per band, comma-separated, in band order")
    parser.add_argument("--drift", type=parse_drift, metavar="BAND=dL,da,db", help="shift one band's color")
    parser.add_argument("--seed", type=int, help="the concept's seed (default: N in concept-N.json)")
    parser.add_argument("--name", required=True, help="output folder name")
    args = parser.parse_args()

    concept = json.loads(require_file(args.concept).read_text(encoding="utf-8"))
    render = cv2.imread(str(require_file(args.concept.with_suffix(".png"))))
    coverage = [float(v) for v in args.coverage.split(",")]
    if len(coverage) != len(concept["bands"]):
        parser.error(f"--coverage needs {len(concept['bands'])} values, one per band.")
    out = output_dir(f"checkin-standin/{args.name}")
    seed = args.seed if args.seed is not None else seed_from_name(args.concept)
    height, width = render.shape[:2]
    band_map = plan_band_map(args.concept, seed, (width, height), out / "plan.png")
    rng = np.random.default_rng(7)

    painted = partial(band_map, coverage, rng)
    if args.drift:
        render = shift_lab(render, band_map == args.drift[0], args.drift[1])
    weave = rng.normal(0, 1.5, render.shape).astype(np.float32)
    canvas = np.where(painted[..., None], render, np.clip(np.array(PRIMED) + weave, 0, 255)).astype(np.uint8)
    cv2.imwrite(str(out / "canvas.png"), canvas)
    cv2.imwrite(str(out / "photo.jpg"), photograph(canvas, rng), [cv2.IMWRITE_JPEG_QUALITY, 90])

    truth = {
        "concept": str(args.concept),
        "seed": seed,
        "coverage": [
            round(float((painted & (band_map == i)).sum() / max((band_map == i).sum(), 1)), 3)
            for i in range(len(concept["bands"]))
        ],
        "drift": {"band": args.drift[0], "lab": args.drift[1]} if args.drift else None,
        "corners": CORNERS,
        "white": np.mean(PAPER, axis=0).round().tolist(),
    }
    (out / "truth.json").write_text(json.dumps(truth, indent=2) + "\n", encoding="utf-8")
    corners = " ".join(f"{x},{y}" for x, y in CORNERS)
    white = ",".join(str(round(v)) for v in truth["white"])
    print(f"True coverage: {truth['coverage']}")
    print(f"Wrote {out}\nCheck in with: --corners {corners} --white {white}")


if __name__ == "__main__":
    main()
