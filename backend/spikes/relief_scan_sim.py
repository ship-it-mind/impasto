"""Does the relief scan recover a surface whose true shape we know?

    uv run spikes/relief_scan_sim.py
    uv run spikes/relief_scan_sim.py --lights 4 --distance 1.0 --gloss 0.3 --shake 6

The relief engine paints a canvas, so its height map is the truth. Phone photos of it
are simulated with what the scan isn't told: a nearby torch with a beam, cast shadows,
varnish highlights, room light, auto-exposure, white balance drift, a nudged phone,
sensor noise and JPEG. Then the scan runs on the photos alone, and the score is its
height and normals against the truth, plus a relight from a direction no photo used.
No model calls. Results land in spikes/output/relief_scan_sim/.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from impasto.rectify import linear_to_srgb, srgb_to_linear  # noqa: E402
from impasto.relief_scan import ReliefScanError, integrate, relit, scan  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "output" / "relief_scan_sim"
SPEC = {
    "title": "Test canvas",
    "flow": "arc",
    "bands": [
        {"name": "cream", "hex": "#e8dcc4", "width": 2, "relief": "heavy"},
        {"name": "sage", "hex": "#8fa58a", "width": 3, "relief": "medium"},
        {"name": "mauve", "hex": "#9c7a8c", "width": 2, "relief": "heavy"},
        {"name": "ochre", "hex": "#c49a4a", "width": 2, "relief": "thin"},
        {"name": "teal", "hex": "#2f6b70", "width": 3, "relief": "medium"},
    ],
}


def paint_truth(width: int, height: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    OUT.mkdir(parents=True, exist_ok=True)
    spec, raw = OUT / "spec.json", OUT / f"surface-{width}x{height}-{seed}.bin"
    if not raw.exists():
        spec.write_text(json.dumps(SPEC), encoding="utf-8")
        subprocess.run(
            ["node", "relief/render.ts", str(spec), str(OUT / "engine-render.png"),
             "--width", str(width), "--height", str(height), "--seed", str(seed), "--surface", str(raw)],
            cwd=REPO / "web", check=True,
        )
    data = np.fromfile(raw, dtype=np.float32)
    color = data[: width * height * 3].reshape(height, width, 3)
    # The engine's relight reads a slope of 3 x dHm/dx off a 3x3-blurred height, so this
    # is the surface its own renders show.
    z = cv2.blur(data[width * height * 3 :].reshape(height, width), (3, 3)) * 3.0
    return color[..., ::-1].copy(), z  # BGR, as photos are


def cast_shadow(z: np.ndarray, light_pos: np.ndarray) -> np.ndarray:
    """Soft horizon test: march toward the torch, and anything higher than the ray shades the pixel."""
    height, width = z.shape
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    dx, dy, dz = light_pos[0] - xs, light_pos[1] - ys, light_pos[2] - z
    length = np.maximum(np.hypot(dx, dy), 1e-3)
    ux, uy, rise = dx / length, dy / length, dz / length
    lit = np.ones_like(z)
    for step in (2, 4, 7, 11, 16, 24, 36, 52):
        over = cv2.remap(z, (xs + ux * step).astype(np.float32), (ys + uy * step).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        blocked = over - (z + rise * step)
        lit = np.minimum(lit, 1.0 - np.clip(blocked / 1.5, 0.0, 1.0))
    return lit


def photograph(
    color: np.ndarray, z: np.ndarray, light_pos: np.ndarray, rng: np.random.Generator,
    gloss: float, shake: float, ambient: float, noise: float, misaim: float = 0.0, hdr: float = 0.0,
) -> np.ndarray:
    height, width = z.shape
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    zx, zy = np.gradient(z, axis=1), np.gradient(z, axis=0)
    norm = np.sqrt(zx**2 + zy**2 + 1)
    nx, ny, nz = -zx / norm, -zy / norm, 1 / norm
    lx, ly, lz = light_pos[0] - xs, light_pos[1] - ys, light_pos[2] - z
    r = np.sqrt(lx**2 + ly**2 + lz**2)
    lx, ly, lz = lx / r, ly / r, lz / r
    lambert = np.maximum(nx * lx + ny * ly + nz * lz, 0.0)
    # A phone torch's beam: brightest at its center, aimed at the canvas's middle.
    off = rng.uniform(-misaim, misaim, 2) * width
    aim = np.array([width / 2 + off[0], height / 2 + off[1], 0.0]) - light_pos
    aim /= np.linalg.norm(aim)
    beam = np.maximum(-(lx * aim[0] + ly * aim[1] + lz * aim[2]), 0.0) ** 4
    falloff = (light_pos[2] ** 2 + (width / 2) ** 2) / r**2
    shadow = cast_shadow(z, light_pos)
    irradiance = lambert * beam * falloff * shadow

    hx, hy, hz = lx, ly, lz + 1
    half = np.sqrt(hx**2 + hy**2 + hz**2)
    glint = np.maximum(nx * hx / half + ny * hy / half + nz * hz / half, 0.0) ** 60 * gloss * beam * falloff * shadow

    paint = srgb_to_linear(color)
    image = paint * (irradiance + ambient)[..., None] + glint[..., None]
    # Auto-exposure aims the middle of the frame at mid-grey; white balance wanders a little.
    image = image * (0.22 / max(float(np.median(image)), 1e-4)) * rng.uniform(0.9, 1.1)
    if hdr:
        # A phone's HDR lifts dark regions and holds back bright ones, in the very brightness
        # slope the scan reads the torch's side from.
        level = np.log(np.maximum(image.mean(axis=2), 1e-4))
        base = cv2.GaussianBlur(level, (0, 0), width * 0.08)
        image = image * np.exp((np.median(base) - base) * hdr)[..., None]
    image = image * rng.uniform(0.97, 1.03, size=3)
    image = image + rng.normal(0, noise, image.shape) * np.sqrt(np.maximum(image, 1e-4))
    photo = linear_to_srgb(image)

    if shake:
        src = np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.float32)
        dst = src + rng.uniform(-shake, shake, (4, 2)).astype(np.float32)
        photo = cv2.warpPerspective(photo, cv2.getPerspectiveTransform(src, dst), (width, height), borderMode=cv2.BORDER_REPLICATE)
    ok, encoded = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def high_pass(z: np.ndarray, flat_scale: float = 0.25) -> np.ndarray:
    """The truth, under the same fade of wide detail the scan applies."""
    zx, zy = np.gradient(z, axis=1), np.gradient(z, axis=0)
    return integrate(zx, zy, flat_scale)


def score(result, z: np.ndarray, true_lights: list[np.ndarray]) -> dict:
    margin = 40
    crop = lambda a: a[margin:-margin, margin:-margin]  # the frame's edge is where a nudge leaves no data
    truth = high_pass(z)
    found = result.height
    correlation = float(np.corrcoef(crop(truth).ravel(), crop(found).ravel())[0, 1])
    # Compare shapes at the best scale: the absolute scale is only an estimate, reported apart.
    scale = float((crop(truth) * crop(found)).sum() / max((crop(found) ** 2).sum(), 1e-9))

    tx, ty = np.gradient(z, axis=1), np.gradient(z, axis=0)
    t = np.stack([-tx, -ty, np.ones_like(tx)], axis=2)
    t /= np.linalg.norm(t, axis=2, keepdims=True)
    fx, fy = np.gradient(found * scale, axis=1), np.gradient(found * scale, axis=0)
    f = np.stack([-fx, -fy, np.ones_like(fx)], axis=2)
    f /= np.linalg.norm(f, axis=2, keepdims=True)
    angle = np.degrees(np.arccos(np.clip((t * f).sum(2), -1, 1)))
    # Against the flat answer: how much of the surface's tilt did the scan get?
    flat = np.degrees(np.arccos(np.clip(t[..., 2], -1, 1)))

    azimuth_errors = []
    height, width = z.shape
    for light, found_azimuth in zip(true_lights, result.light_azimuths):
        true_az = np.degrees(np.arctan2(light[1] - height / 2, light[0] - width / 2)) % 360
        azimuth_errors.append(abs((found_azimuth - true_az + 180) % 360 - 180))
    # Most of a knife-painted canvas is flat slab: the scan's worth shows where there's relief.
    relief = crop(np.hypot(tx, ty)) > 0.15
    return {
        "height_correlation": round(correlation, 3),
        "scale_error": round(1 / scale, 2),  # 1 = right size, 2 = twice as tall as the truth
        "normal_error_deg_on_relief": round(float(np.median(crop(angle)[relief])), 1),
        "normal_error_if_flat_deg_on_relief": round(float(np.median(crop(flat)[relief])), 1),
        "light_azimuth_error_deg": [round(float(e), 1) for e in azimuth_errors],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lights", type=int, default=5)
    parser.add_argument("--distance", type=float, default=1.5, help="torch distance from the canvas center, in canvas widths")
    parser.add_argument("--elevation", type=float, default=35.0)
    parser.add_argument("--gloss", type=float, default=0.15)
    parser.add_argument("--shake", type=float, default=3.0, help="how far the phone's nudge moves the frame's corners, in px")
    parser.add_argument("--ambient", type=float, default=0.05)
    parser.add_argument("--noise", type=float, default=0.01)
    parser.add_argument("--misaim", type=float, default=0.0, help="how far off-center the beam lands, in canvas widths")
    parser.add_argument("--hdr", type=float, default=0.0, help="share of the slow brightness changes the phone's HDR flattens")
    parser.add_argument("--arc", type=float, default=360.0, help="how far around the canvas the torch went, in degrees")
    parser.add_argument("--seed", type=int, default=3)
    parser.add_argument("--width", type=int, default=1000)
    parser.add_argument("--height", type=int, default=750)
    parser.add_argument("--name", default="default")
    args = parser.parse_args()

    color, z = paint_truth(args.width, args.height, args.seed)
    rng = np.random.default_rng(args.seed)
    reach = args.distance * args.width
    positions = []
    start = rng.uniform(0, 360)
    for i in range(args.lights):
        # A hand doesn't space them evenly.
        az = np.radians(start + (i + rng.uniform(-0.2, 0.2)) * args.arc / args.lights)
        el = np.radians(args.elevation + rng.uniform(-6, 6))
        positions.append(np.array([
            args.width / 2 + reach * np.cos(el) * np.cos(az),
            args.height / 2 + reach * np.cos(el) * np.sin(az),
            reach * np.sin(el),
        ]))
    photos = [photograph(color, z, pos, rng, args.gloss, args.shake if i else 0.0, args.ambient, args.noise, args.misaim, args.hdr) for i, pos in enumerate(positions)]

    out = OUT / args.name
    out.mkdir(parents=True, exist_ok=True)
    for i, photo in enumerate(photos):
        cv2.imwrite(str(out / f"photo-{i}.jpg"), photo)

    try:
        result = scan(photos)
    except ReliefScanError as error:
        print(f"Refused: {error}")
        return
    scores = score(result, z, positions)
    report = {"scores": scores, "quality": result.quality.__dict__, "light_azimuths": result.light_azimuths}
    print(json.dumps(report, indent=1))
    (out / "report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")

    # A view no photo had: truth from a far light, then the same from the scan.
    held_out = 200.0
    distant = np.array([args.width / 2 + 1e5 * np.cos(np.radians(held_out)) * np.cos(np.radians(38)),
                        args.height / 2 + 1e5 * np.sin(np.radians(held_out)) * np.cos(np.radians(38)),
                        1e5 * np.sin(np.radians(38))])
    zx, zy = np.gradient(z, axis=1), np.gradient(z, axis=0)
    norm = np.sqrt(zx**2 + zy**2 + 1)
    l = (distant - [args.width / 2, args.height / 2, 0]); l /= np.linalg.norm(l)
    diffuse = np.maximum((-zx * l[0] - zy * l[1] + l[2]) / norm, 0) / l[2]
    truth_view = linear_to_srgb(srgb_to_linear(color) * (0.28 + 0.72 * diffuse)[..., None])
    scan_view = relit(result, held_out)
    truth_map = high_pass(z)
    def gray(a):
        low, high = np.percentile(a, (1, 99))
        return cv2.cvtColor(np.uint8(np.clip((a - low) / (high - low), 0, 1) * 255), cv2.COLOR_GRAY2BGR)
    sheet = np.vstack([np.hstack([truth_view, scan_view]), np.hstack([gray(truth_map), gray(result.height)]), np.hstack([photos[0], result.albedo])])
    cv2.imwrite(str(out / "sheet.jpg"), cv2.resize(sheet, None, fx=0.6, fy=0.6, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(f"Wrote {out}/sheet.jpg (left truth, right scan; lit from an unseen side, height, then a photo and the paint)")


if __name__ == "__main__":
    main()
