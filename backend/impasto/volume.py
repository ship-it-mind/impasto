"""Paint + paste estimator: band areas → grams to mix and a shopping list.

    # estimate from a band map, with per-band relief levels
    uv run python -m impasto.volume output/rectify/painting --level "dark plum=heavy"
    # calibrate on a finished piece: what it actually used, in grams
    uv run python -m impasto.volume output/rectify/painting \
        --calibrate 900,2400 --save materials.json
    # estimate a new piece with the saved calibration
    uv run python -m impasto.volume output/rectify/new --materials materials.json

Per band: grams = area_cm² × thickness_cm × density_g/cm³ × waste_factor,
split into paint and paste by volume fraction. The shopping list adds a
buffer and rounds up to her tube and tub sizes.

The default materials are PLACEHOLDERS, not her numbers. Results stay marked
uncalibrated until --calibrate has been run on one of her finished pieces.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

LEVELS = ("thin", "medium", "heavy")


@dataclass
class Materials:
    # PLACEHOLDER: typical impasto layer depths, before calibration.
    thickness_cm: dict[str, float] = field(
        default_factory=lambda: {"thin": 0.15, "medium": 0.3, "heavy": 0.5}
    )
    # Calibration multiplies every thickness level by this.
    thickness_scale: float = 1.0
    # PLACEHOLDER: heavy-body acrylic and modeling paste (marble-dust filled).
    paint_density_g_cm3: float = 1.35
    paste_density_g_cm3: float = 1.7
    # PLACEHOLDER: share of the applied volume that is paint; the rest is paste.
    paint_fraction: float = 0.35
    # Paint left on the palette and knife.
    waste_factor: float = 1.1
    # Extra on the shopping list so she never runs dry mid-band.
    buffer: float = 1.15
    # PLACEHOLDER: her container sizes.
    paint_tube_ml: float = 120.0
    paste_tub_ml: float = 500.0
    calibrated_from: str | None = None

    @property
    def mix_density_g_cm3(self) -> float:
        return (
            self.paint_fraction * self.paint_density_g_cm3
            + (1 - self.paint_fraction) * self.paste_density_g_cm3
        )

    def layer_cm(self, level: str) -> float:
        return self.thickness_cm[level] * self.thickness_scale


@dataclass
class BandEstimate:
    id: int
    name: str
    area_cm2: float
    level: str
    thickness_cm: float
    volume_cm3: float
    paint_g: float
    paste_g: float


@dataclass
class Estimate:
    calibrated: bool
    calibrated_from: str | None
    bands: list[BandEstimate]
    paint_g: float
    paste_g: float
    shopping: dict[str, float]


def estimate(
    bands: list[dict], levels: dict[str, str], materials: Materials, default_level: str = "medium"
) -> Estimate:
    """Grams of paint and paste per band, including waste, plus a buffered shopping list."""
    estimates = []
    for band in bands:
        level = levels.get(band["name"], default_level)
        thickness = materials.layer_cm(level)
        volume = band["area_cm2"] * thickness * materials.waste_factor
        paint_volume = volume * materials.paint_fraction
        estimates.append(
            BandEstimate(
                id=band["id"],
                name=band["name"],
                area_cm2=band["area_cm2"],
                level=level,
                thickness_cm=round(thickness, 3),
                volume_cm3=round(volume, 1),
                paint_g=round(paint_volume * materials.paint_density_g_cm3, 1),
                paste_g=round((volume - paint_volume) * materials.paste_density_g_cm3, 1),
            )
        )

    paint_g = sum(b.paint_g for b in estimates)
    paste_g = sum(b.paste_g for b in estimates)
    paint_buy_g = paint_g * materials.buffer
    paste_buy_g = paste_g * materials.buffer
    tube_g = materials.paint_tube_ml * materials.paint_density_g_cm3
    tub_g = materials.paste_tub_ml * materials.paste_density_g_cm3
    return Estimate(
        calibrated=materials.calibrated_from is not None,
        calibrated_from=materials.calibrated_from,
        bands=estimates,
        paint_g=round(paint_g, 1),
        paste_g=round(paste_g, 1),
        shopping={
            "paint_g": round(paint_buy_g),
            "paste_g": round(paste_buy_g),
            # All paint as one mix for now; per-pigment tubes come from the mixing model.
            "paint_tubes": math.ceil(paint_buy_g / tube_g),
            "paste_tubs": math.ceil(paste_buy_g / tub_g),
        },
    )


def calibrate(
    bands: list[dict],
    levels: dict[str, str],
    materials: Materials,
    used_paint_g: float,
    used_paste_g: float,
    source: str,
    default_level: str = "medium",
) -> Materials:
    """Fit thickness_scale and paint_fraction so the estimate matches what a finished piece used.

    used_* are what she actually went through, palette waste included, so they
    are compared against the estimate with waste but without the buffer.
    """
    if used_paint_g <= 0 or used_paste_g < 0:
        raise ValueError("Calibration needs positive paint grams and non-negative paste grams.")
    paint_volume = used_paint_g / materials.paint_density_g_cm3
    paste_volume = used_paste_g / materials.paste_density_g_cm3
    used_volume = paint_volume + paste_volume

    predicted_volume = sum(
        band["area_cm2"] * materials.thickness_cm[levels.get(band["name"], default_level)]
        for band in bands
    ) * materials.waste_factor
    return Materials(
        **{
            **asdict(materials),
            "thickness_scale": round(used_volume / predicted_volume, 4),
            "paint_fraction": round(paint_volume / used_volume, 4),
            "calibrated_from": source,
        }
    )


def load_materials(path: Path | None) -> Materials:
    if path is None:
        return Materials()
    return Materials(**json.loads(path.read_text(encoding="utf-8")))


def parse_level(value: str) -> tuple[str, str]:
    name, _, level = value.rpartition("=")
    if level not in LEVELS:
        raise argparse.ArgumentTypeError(f"Level must be one of {', '.join(LEVELS)}.")
    return name, level


def parse_grams(value: str) -> tuple[float, float]:
    paint, _, paste = value.partition(",")
    return float(paint), float(paste)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="folder with bands.json")
    parser.add_argument(
        "--level", action="append", type=parse_level, default=[], metavar="BAND=LEVEL",
        help=f"relief level for one band ({', '.join(LEVELS)}); repeat per band",
    )
    parser.add_argument("--default-level", choices=LEVELS, default="medium")
    parser.add_argument("--materials", type=Path, help="materials JSON (default: placeholders)")
    parser.add_argument(
        "--calibrate", type=parse_grams, metavar="PAINT_G,PASTE_G",
        help="grams this finished piece actually used; fits the materials to it",
    )
    parser.add_argument("--save", type=Path, help="write the calibrated materials here")
    args = parser.parse_args()

    band_map = json.loads((args.folder / "bands.json").read_text(encoding="utf-8"))
    bands = band_map["bands"]
    levels = dict(args.level)
    unknown = set(levels) - {band["name"] for band in bands}
    if unknown:
        parser.error(f"No band named {', '.join(sorted(unknown))} in bands.json.")
    materials = load_materials(args.materials)

    if args.calibrate:
        paint_g, paste_g = args.calibrate
        materials = calibrate(
            bands, levels, materials, paint_g, paste_g, str(args.folder), args.default_level
        )
        print(
            f"Calibrated on {args.folder}: thickness × {materials.thickness_scale}, "
            f"paint is {materials.paint_fraction:.0%} of the volume"
        )
        if args.save:
            args.save.write_text(json.dumps(asdict(materials), indent=2) + "\n", encoding="utf-8")
            print(f"Wrote {args.save}")

    result = estimate(bands, levels, materials, args.default_level)
    (args.folder / "estimate.json").write_text(json.dumps(asdict(result), indent=2) + "\n", encoding="utf-8")

    if not result.calibrated:
        print("UNCALIBRATED: placeholder materials, not her numbers.\n")
    for band in result.bands:
        print(
            f"{band.id}. {band.name:<14} {band.area_cm2:>7.0f} cm²  {band.level:<6} "
            f"{band.thickness_cm * 10:4.1f} mm  paint {band.paint_g:>6.0f} g  paste {band.paste_g:>6.0f} g"
        )
    shop = result.shopping
    print(f"\nUses: paint {result.paint_g:.0f} g, paste {result.paste_g:.0f} g (palette waste included)")
    print(
        f"Buy (+{materials.buffer - 1:.0%}): paint {shop['paint_g']} g ≈ {shop['paint_tubes']} × "
        f"{materials.paint_tube_ml:g} ml tubes, paste {shop['paste_g']} g ≈ {shop['paste_tubs']} × "
        f"{materials.paste_tub_ml:g} ml tubs"
    )
    print(f"Wrote {args.folder / 'estimate.json'}")


if __name__ == "__main__":
    main()
