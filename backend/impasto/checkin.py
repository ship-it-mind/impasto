"""Progress check-ins: a mid-way photo of the canvas against the plan → coverage and color drift per band.

    uv run python -m impasto.checkin photo.jpg --concept output/concepts/x/concept-1.json \
        --size 100x75 --white 1300,700 --corners 20,60 1170,45 1185,1480 95,1495

The plan is the concept spec the artist chose: its band map (which band each
part of the canvas belongs to) comes from the same geometry the relief preview
paints (web/relief/bandmap.ts, needs Node 22+), at the same seed and size, so
it matches what she saw. --seed defaults to N in concept-N.json, as the app and
`impasto.concepts --render` number them. --plan-map gives a band map directly
instead, e.g. one taken from a photo of a piece that had no concept.

The photo is rectified and white-balanced as in impasto.rectify (corners are
found by SAM unless --corners gives them). The white reference is required:
without it, bare canvas under warm light reads as paint and every band seems
to drift. A pixel counts as painted when it
is clearly off the bare ground's color, or a bit off it and textured; the
ground is primed white unless --ground X,Y points at bare canvas in the photo.
Per band: coverage = painted / planned area, and color drift = CIEDE2000
between the band's median painted color and its planned mix, with the tube
that best pulls it back. In progress.png, what is still bare is hatched in its band's
planned color. Paste use is not measured: a photo shows area, not
thickness. Canvas that a cut-off corner of the photo leaves out is not counted.

The summary is at most 3 lines; the artist is holding a knife, not reading a
report. Each check-in is stored with its time under checkins/<concept>/ next
to the concept spec (checkin.json, rectified.png, progress.png), so a
time-lapse and a drift chart can be built from the folder.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import cv2
import mixbox
import numpy as np

from impasto.bands import COLOR_EDGE_MARGIN_CM, fill_small_holes
from impasto.color import delta_e2000, hex_to_rgb, rgb_to_hex, rgb_to_lab
from impasto.concepts import canvas_px
from impasto.meta import REPO_ROOT
from impasto.mixing import MIN_GAIN_DE, PLACEHOLDER_INVENTORY, without
from impasto.rectify import (
    DEFAULT_PX_PER_CM, TARGET_WHITE, detect_corners, linear_to_srgb, parse_point, parse_size,
    photo_to_canvas, rectify, srgb_to_linear,
)

BANDMAP = REPO_ROOT / "web" / "relief" / "bandmap.ts"
# Painted: this far (ΔE76) from the ground, or half as far and textured (paste ridges),
# or more colorful than bare canvas ever reads (cream and other near-white paints sit
# under GROUND_DE but are clearly tinted; bare canvas in warm shadow stays under ~4.5).
GROUND_DE = 10.0
GROUND_CHROMA = 5.5
TEXTURE_L = 3.0  # local standard deviation of L*, over TEXTURE_WINDOW_CM
TEXTURE_WINDOW_CM = 0.9
# Bare patches and stray painted specks smaller than this are noise, not progress.
MIN_PATCH_CM2 = 4.0
# Marks thinner than this are her pencil sketch, not paint.
PENCIL_CM = 0.5
# A band counts as done from this coverage, and as started from MIN_STARTED.
DONE = 0.95
MIN_STARTED = 0.05
# Too little painted area, or too little of the band, to judge its color: a barely
# started band's "paint" is often stray marks or shadow on bare canvas.
MIN_COLOR_CM2 = 20.0
MIN_COLOR_COVERAGE = 0.25
# Drift worth a line: a clear difference on a textured, photographed surface.
DRIFT_DE = 6.0
# Tube shares tried when pulling a drifted mix back, and the gain one must give to be suggested.
FIX_SHARES = (0.03, 0.05, 0.08, 0.12, 0.2, 0.3)
MIN_FIX_GAIN_DE = 2.0
MAX_LINES = 3
# Band map value for canvas outside every band, and the share of the canvas that may
# be out of the photo before the check-in says so.
NO_BAND = 255
MAX_OUTSIDE = 0.01
# Primed canvas, as it reads after white balance against paper.
WHITE_GROUND_LAB = rgb_to_lab((TARGET_WHITE,) * 3)


@dataclass
class BandProgress:
    id: int
    name: str
    planned_hex: str
    planned_cm2: float
    painted_cm2: float
    coverage: float
    measured_hex: str | None = None
    delta_e: float | None = None
    drift: str | None = None  # e.g. "warmer and darker"
    fix: str | None = None  # e.g. "mix in about 1 part Ultramarine Blue to 20 parts of it"


@dataclass
class CheckIn:
    taken_at: str
    photo: str
    concept: str
    seed: int
    canvas_cm: tuple[float, float]
    coverage: float
    bands: list[BandProgress]
    summary: list[str]
    warnings: list[str]


def plan_band_map(concept_path: Path, seed: int, size_px: tuple[int, int], out: Path) -> np.ndarray:
    """The concept's band index per pixel, drawn by the relief geometry at the preview's size."""
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("The band map needs Node 22+ on PATH.")
    width, height = size_px
    subprocess.run(
        [node, str(BANDMAP), str(concept_path), str(out), "--seed", str(seed), "--width", str(width), "--height", str(height)],
        check=True, capture_output=True,
    )
    return cv2.imread(str(out), cv2.IMREAD_GRAYSCALE)


def to_lab(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)


def local_std(values: np.ndarray, window: int) -> np.ndarray:
    mean = cv2.blur(values, (window, window))
    return np.sqrt(np.maximum(cv2.blur(values * values, (window, window)) - mean * mean, 0))


def drop_specks(mask: np.ndarray, min_px: int) -> np.ndarray:
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = stats[:, cv2.CC_STAT_AREA] >= min_px
    keep[0] = False  # label 0 is the background
    return keep[labels]


def painted_mask(image: np.ndarray, ground_lab: tuple[float, float, float], px_per_cm: float) -> np.ndarray:
    lab = to_lab(image)
    off_ground = np.linalg.norm(lab - np.array(ground_lab, dtype=np.float32), axis=2)
    texture = local_std(lab[..., 0], max(3, round(TEXTURE_WINDOW_CM * px_per_cm)) | 1)
    chroma = np.hypot(lab[..., 1] - ground_lab[1], lab[..., 2] - ground_lab[2])
    painted = (off_ground > GROUND_DE) | ((off_ground > GROUND_DE / 2) & (texture > TEXTURE_L)) | (chroma > GROUND_CHROMA)
    pencil = round(PENCIL_CM * px_per_cm) | 1
    painted = cv2.morphologyEx(painted.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pencil, pencil))) > 0
    min_px = round(MIN_PATCH_CM2 * px_per_cm**2)
    # Fill small bare gaps inside the paint, then drop specks out on the bare ground.
    return drop_specks(fill_small_holes(painted, min_px), min_px)


def sample_ground(image: np.ndarray, point: tuple[float, float], radius: int = 8) -> tuple[float, float, float]:
    x, y = round(point[0]), round(point[1])
    height, width = image.shape[:2]
    if not (0 <= x < width and 0 <= y < height):
        raise ValueError(f"Ground point {point} is off the canvas.")
    patch = to_lab(image[max(0, y - radius) : y + radius + 1, max(0, x - radius) : x + radius + 1])
    return tuple(float(v) for v in np.median(patch.reshape(-1, 3), axis=0))


def median_hex(image: np.ndarray, mask: np.ndarray) -> str:
    """Median color of the masked pixels, as hex.

    After white balance, paper reads as TARGET_WHITE; scaling that back up to 255
    puts the photo on the same footing as the plan's hex colors, where white is #ffffff.
    """
    blue, green, red = np.median(image[mask], axis=0)
    rgb = linear_to_srgb(srgb_to_linear(np.array([red, green, blue])) / srgb_to_linear(np.array(float(TARGET_WHITE))))
    return rgb_to_hex(tuple(int(round(v)) for v in np.clip(rgb, 0, 255)))


def describe_drift(planned: tuple[float, float, float], measured: tuple[float, float, float]) -> str:
    """Name the main way a color has moved: lighter/darker, more vivid/duller, warmer/cooler."""
    (l1, a1, b1), (l2, a2, b2) = planned, measured
    c1, c2 = np.hypot(a1, b1), np.hypot(a2, b2)
    d_l, d_c = l2 - l1, c2 - c1
    d_h = np.sqrt(max((a2 - a1) ** 2 + (b2 - b1) ** 2 - d_c**2, 0.0))
    # Warm is toward orange-yellow (hue ~60°), cool toward blue.
    warmer = (a2 - a1) * np.cos(np.radians(60)) + (b2 - b1) * np.sin(np.radians(60)) > 0
    parts = sorted(
        [
            (abs(d_l), "lighter" if d_l > 0 else "darker"),
            (abs(d_c), "more vivid" if d_c > 0 else "duller"),
            (d_h, "warmer" if warmer else "cooler"),
        ],
        reverse=True,
    )
    words = [parts[0][1]] + [word for size, word in parts[1:2] if size > parts[0][0] / 2]
    return " and ".join(words)


def best_fix(measured_hex: str, planned_hex: str, inventory: dict) -> tuple[str, float] | None:
    """One or two tubes, and how much of each, that bring the measured mix closest back to the plan, and the ΔE it lands at.

    A second tube is only named when it helps by more than MIN_GAIN_DE, as in the recipes.
    """
    target = rgb_to_lab(hex_to_rgb(planned_hex))
    current = np.array(mixbox.rgb_to_latent(hex_to_rgb(measured_hex)))
    tubes = [(t["name"], np.array(mixbox.rgb_to_latent(hex_to_rgb(t["hex"])))) for t in inventory["tubes"]]

    def score(adds: tuple[tuple[int, float], ...]) -> float:
        total = sum(share for _, share in adds)
        latent = (1 - total) * current + sum(share * tubes[i][1] for i, share in adds)
        return delta_e2000(target, rgb_to_lab(tuple(mixbox.latent_to_rgb(latent.tolist()))))

    before = delta_e2000(target, rgb_to_lab(hex_to_rgb(measured_hex)))
    singles = [((i, s),) for i in range(len(tubes)) for s in FIX_SHARES]
    pairs = [
        ((i, s), (j, t))
        for i, j in itertools.combinations(range(len(tubes)), 2)
        for s in FIX_SHARES for t in FIX_SHARES if s + t <= max(FIX_SHARES)
    ]
    best_single = min(((score(a), a) for a in singles), key=lambda item: item[0])
    best_pair = min(((score(a), a) for a in pairs), key=lambda item: item[0])
    after, adds = best_pair if best_single[0] - best_pair[0] > MIN_GAIN_DE else best_single
    if before - after < MIN_FIX_GAIN_DE:
        return None
    # She mixes by parts: the smallest addition is 1 part, against so many parts of the mix she has.
    total = sum(share for _, share in adds)
    unit = min(share for _, share in adds)
    amounts = [
        f"{round(share / unit)} part{'s' if round(share / unit) > 1 else ''} {tubes[i][0]}"
        for i, share in sorted(adds, key=lambda a: -a[1])
    ]
    return f"mix in about {' and '.join(amounts)} to {round((1 - total) / unit)} parts of it", after


def suggest_fix(measured_hex: str, planned_hex: str, inventory: dict) -> str | None:
    fix = best_fix(measured_hex, planned_hex, inventory)
    return fix[0] if fix else None


def measure(
    image: np.ndarray,
    band_map: np.ndarray,
    concept: dict,
    ground_lab: tuple[float, float, float],
    px_per_cm: float,
    inventory: dict,
) -> tuple[list[BandProgress], np.ndarray]:
    painted = painted_mask(image, ground_lab, px_per_cm)
    margin = round(COLOR_EDGE_MARGIN_CM * px_per_cm)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * margin + 1, 2 * margin + 1))
    px_area = 1 / px_per_cm**2
    progress = []
    for index, band in enumerate(concept["bands"]):
        planned_hex = band.get("mix", {}).get("hex", band["hex"])
        planned = band_map == index
        done = planned & painted
        result = BandProgress(
            id=index,
            name=band["name"],
            planned_hex=planned_hex,
            planned_cm2=round(float(planned.sum()) * px_area, 1),
            painted_cm2=round(float(done.sum()) * px_area, 1),
            coverage=round(float(done.sum()) / max(int(planned.sum()), 1), 3),
        )
        # Color from well inside the paint: band edges blend and the paint front has bare ground in it.
        interior = cv2.erode(done.astype(np.uint8), kernel).astype(bool)
        if interior.sum() * px_area >= MIN_COLOR_CM2 and result.coverage >= MIN_COLOR_COVERAGE:
            measured_hex = median_hex(image, interior)
            planned_lab, measured_lab = rgb_to_lab(hex_to_rgb(planned_hex)), rgb_to_lab(hex_to_rgb(measured_hex))
            result.measured_hex = measured_hex
            result.delta_e = round(delta_e2000(planned_lab, measured_lab), 1)
            if result.delta_e >= DRIFT_DE:
                result.drift = describe_drift(planned_lab, measured_lab)
                result.fix = suggest_fix(measured_hex, planned_hex, inventory)
        progress.append(result)
    return progress, painted


def pct(share: float) -> str:
    """Whole percent, half rounded up as the web app does (format's .0% rounds 0.365 down)."""
    return f"{int(share * 100 + 0.5)}%"


def names(bands: list[BandProgress]) -> str:
    labels = [band.name for band in bands]
    return labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " and " + labels[-1]


def summarize(bands: list[BandProgress], coverage: float) -> list[str]:
    """At most MAX_LINES short lines: where she stands, then the worst color drifts."""
    done = [b for b in bands if b.coverage >= DONE]
    started = [b for b in bands if MIN_STARTED <= b.coverage < DONE]
    waiting = [b for b in bands if b.coverage < MIN_STARTED]
    status = [f"{names(done)} done"] if done else []
    status += [f"{b.name} {pct(b.coverage)}" for b in started]
    status += [f"{names(waiting)} not started"] if waiting else []
    lines = [f"{pct(coverage)} painted: " + ", ".join(status) + "."]

    drifting = sorted((b for b in bands if b.drift), key=lambda b: -b.delta_e)
    room = MAX_LINES - 1
    for band in drifting[: room if len(drifting) <= room else room - 1]:
        line = f"{band.name[:1].upper()}{band.name[1:]} is drifting {band.drift} (ΔE {band.delta_e:.0f})"
        lines.append(line + (f": {band.fix}." if band.fix else ": remix it from the recipe."))
    if len(drifting) > room:
        lines.append(f"Also drifting: {names(drifting[room - 1:])}.")
    if not drifting and any(b.delta_e is not None for b in bands):
        lines.append("Colors are on plan.")
    return lines


def draw_progress(image: np.ndarray, band_map: np.ndarray, painted: np.ndarray, bands: list[BandProgress], px_per_cm: float) -> np.ndarray:
    """Painted areas as photographed; planned but bare areas hatched in their band's planned color."""
    drawn = image.copy()
    height, width = band_map.shape
    ys, xs = np.mgrid[0:height, 0:width]
    spacing = max(6, round(2 * px_per_cm))
    hatch = (xs + ys) % spacing < max(2, spacing // 3)
    for band in bands:
        bare = (band_map == band.id) & ~painted
        red, green, blue = hex_to_rgb(band.planned_hex)
        tint = np.array((blue, green, red), dtype=np.float32)
        drawn[bare] = (0.3 * drawn[bare] + 0.7 * tint).astype(np.uint8)
        lines = bare & hatch
        drawn[lines] = (0.75 * tint).astype(np.uint8)
    edges = cv2.morphologyEx(band_map, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    drawn[edges] = (40, 40, 40)
    return drawn


def seed_from_name(path: Path) -> int:
    match = re.fullmatch(r"concept-(\d+)", path.stem)
    return int(match.group(1)) if match else 1


async def check_in(
    photo: Path,
    concept_path: Path,
    size: tuple[float, float],
    white: tuple[float, float],
    out: Path,
    *,
    corners: list[tuple[float, float]] | None = None,
    ground: tuple[float, float] | None = None,
    inventory: dict = PLACEHOLDER_INVENTORY,
    px_per_cm: float = DEFAULT_PX_PER_CM,
    seed: int | None = None,
    plan_map: Path | None = None,
) -> CheckIn:
    """Measure one photo against the plan and write checkin.json, rectified.png and progress.png to out."""
    image = cv2.imread(str(photo))
    if image is None:
        raise FileNotFoundError(photo)
    concept = json.loads(concept_path.read_text(encoding="utf-8"))
    seed = seed if seed is not None else seed_from_name(concept_path)
    taken_at = datetime.now(timezone.utc)
    out.mkdir(parents=True, exist_ok=True)

    height, width = image.shape[:2]
    if corners:
        corners_px, source = np.array(corners, dtype=np.float32), "manual"
    else:
        corners_px, source = await detect_corners(photo, (width, height)), "auto"
    warped, info = rectify(image, corners_px, size, px_per_cm, source, white)
    warnings = list(info.warnings)
    if ground:
        (ground_px,) = photo_to_canvas([ground], info.homography)
        ground_lab = sample_ground(warped, ground_px)
    else:
        ground_lab = WHITE_GROUND_LAB

    if plan_map:
        planned = cv2.imread(str(plan_map), cv2.IMREAD_UNCHANGED)
        if planned is None:
            raise FileNotFoundError(plan_map)
        if planned.ndim == 3:
            planned = np.ascontiguousarray(planned[..., 2])  # an impasto.layout map: band index in red
    else:
        piece = {"piece": {"width_cm": size[0], "height_cm": size[1]}}
        planned = plan_band_map(concept_path, seed, canvas_px(piece), out / "plan.png")
    band_map = cv2.resize(planned, info.output_size, interpolation=cv2.INTER_NEAREST)
    # Canvas a corner of the photo cut off is neither painted nor bare: leave it out.
    in_photo = cv2.warpPerspective(
        np.full((height, width), 255, np.uint8), np.array(info.homography), info.output_size, flags=cv2.INTER_NEAREST,
    ) > 0
    outside = 1 - float(in_photo.mean())
    if outside > MAX_OUTSIDE:
        warnings.append(f"{outside:.0%} of the canvas is outside the photo and isn't counted.")
    band_map[~in_photo] = NO_BAND

    bands, painted = measure(warped, band_map, concept, ground_lab, px_per_cm, inventory)
    total = sum(b.planned_cm2 for b in bands)
    coverage = round(sum(b.painted_cm2 for b in bands) / total, 3) if total else 0.0
    checkin = CheckIn(
        taken_at=taken_at.isoformat(timespec="seconds"),
        photo=str(photo),
        concept=str(concept_path),
        seed=seed,
        canvas_cm=size,
        coverage=coverage,
        bands=bands,
        summary=summarize(bands, coverage),
        warnings=warnings,
    )
    cv2.imwrite(str(out / "rectified.png"), warped)
    cv2.imwrite(str(out / "progress.png"), draw_progress(warped, band_map, painted, bands, px_per_cm))
    (out / "checkin.json").write_text(json.dumps(asdict(checkin), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return checkin


def print_checkin(checkin: CheckIn) -> None:
    for line in checkin.summary:
        print(line)
    print()
    for b in checkin.bands:
        color = f"  {b.measured_hex} vs {b.planned_hex} ΔE {b.delta_e:4.1f}" if b.delta_e is not None else ""
        print(f"{b.id}. {b.name:<16} {b.coverage:5.0%} of {b.planned_cm2:7.1f} cm²{color}")
    for warning in checkin.warnings:
        print(f"Warning: {warning}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("photo", type=Path)
    parser.add_argument("--concept", type=Path, required=True, help="the chosen concept's spec (concept-N.json)")
    parser.add_argument("--seed", type=int, help="the concept's seed (default: N in concept-N.json)")
    parser.add_argument("--plan-map", type=Path,
                        help=f"band index per pixel as a grayscale PNG ({NO_BAND} = no band) or an impasto.layout map, instead of drawing it from the concept")
    parser.add_argument("--size", type=parse_size, required=True, help="canvas WIDTHxHEIGHT in cm")
    parser.add_argument("--corners", type=parse_point, nargs=4, metavar="X,Y",
                        help="canvas corners in photo pixels; skips automatic detection")
    parser.add_argument("--white", type=parse_point, metavar="X,Y", required=True,
                        help="a point on something white in the photo (paper beside the canvas), for color correction")
    parser.add_argument("--ground", type=parse_point, metavar="X,Y",
                        help="a point on bare canvas in the photo (default: primed white)")
    parser.add_argument("--without", action="append", default=[], metavar="TUBE",
                        help="a tube she doesn't have, left out of the fixes; repeat for several")
    parser.add_argument("--px-per-cm", type=float, default=DEFAULT_PX_PER_CM)
    parser.add_argument("--out", type=Path, help="output folder (default: checkins/<concept>/<time> next to the spec)")
    args = parser.parse_args()

    try:
        inventory = without(PLACEHOLDER_INVENTORY, args.without)
    except ValueError as error:
        parser.error(str(error))
    out = args.out or args.concept.parent / "checkins" / args.concept.stem / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    checkin = await check_in(
        args.photo, args.concept, args.size, args.white, out,
        corners=args.corners, ground=args.ground, inventory=inventory, px_per_cm=args.px_per_cm,
        seed=args.seed, plan_map=args.plan_map,
    )
    print_checkin(checkin)
    print(f"Wrote {out}")


if __name__ == "__main__":
    asyncio.run(main())
