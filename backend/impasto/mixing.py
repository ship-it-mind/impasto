"""Mixing model: which of her tubes, in what ratio, hit each band's color.

    uv run python -m impasto.mixing output/rectify/painting
    uv run python -m impasto.mixing output/rectify/painting --inventory tubes.json --paste-in-mix

Mixes are predicted with Mixbox (Sochorova & Jamriska 2021, CC BY-NC 4.0),
which models paint as real pigments rather than averaging RGB. For each
band, every combination of 1–3 tubes is searched for the ratio with the
lowest CIEDE2000 difference to the band's color. A tube is only added when it
improves the match by more than MIN_GAIN_DE, so recipes stay short.

The recipe is by weight: she weighs each tube on a kitchen scale. Whole parts
(at most MAX_PARTS) are also given as a rough guide for small test batches,
with their own ΔE, since rounding a 4% tube to 1 part in 10 shifts the color.

--paste-in-mix treats the modeling paste as part of the colored mix (tinted
paste), using the paint/paste split from the materials file. Without it the
paste is assumed to sit under the paint and not affect color.

Reads bands.json (target colors) and estimate.json (grams per band, if
present); writes recipes.json.
"""

from __future__ import annotations

import argparse
import itertools
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import mixbox
import numpy as np

from impasto.color import delta_e2000, hex_to_rgb, rgb_to_hex, rgb_to_lab
from impasto.volume import load_materials

# PLACEHOLDER inventory: common acrylic colors, not her tubes.
PLACEHOLDER_INVENTORY = {
    "placeholder": True,
    "tubes": [
        {"name": "Titanium White", "hex": "#ffffff"},
        {"name": "Mars Black", "hex": "#1c1b1a"},
        {"name": "Burnt Sienna", "hex": "#7b4800"},
        {"name": "Raw Umber", "hex": "#4a3b2c"},
        {"name": "Yellow Ochre", "hex": "#c6973e"},
        {"name": "Cadmium Red", "hex": "#ff2702"},
        {"name": "Quinacridone Magenta", "hex": "#80022e"},
        {"name": "Ultramarine Blue", "hex": "#190059"},
        {"name": "Sap Green", "hex": "#6b9404"},
    ],
    "paste": {"name": "Modeling Paste", "hex": "#eeeae0"},
}

MAX_TUBES = 3
COARSE_STEP = 0.05
FINE_STEP = 0.01
# A recipe needs one more tube only if that tube lowers ΔE by more than this.
MIN_GAIN_DE = 1.0
# She mixes in whole parts, so recipes are rounded to at most this many parts.
MAX_PARTS = 10


@dataclass
class Ingredient:
    name: str
    share: float  # of the paint; weighed on her kitchen scale, this is the recipe
    grams: float | None
    parts: int  # rough whole-part guide for small test batches


@dataclass
class Recipe:
    band: str
    target_hex: str
    predicted_hex: str
    delta_e: float  # mixed by weight
    parts_delta_e: float  # mixed by the rough whole parts
    tubes: list[Ingredient]
    paste_grams: float | None


def simplex_grid(k: int, step: float) -> np.ndarray:
    """All k-part shares that are multiples of step, sum to 1, and are all > 0."""
    n = round(1 / step)
    points = [c for c in itertools.product(range(1, n + 1), repeat=k - 1) if sum(c) < n]
    return np.array([[*c, n - sum(c)] for c in points], dtype=float) / n if k > 1 else np.ones((1, 1))


class Mixer:
    def __init__(self, inventory: dict, paste_share: float):
        self.names = [tube["name"] for tube in inventory["tubes"]]
        self.latents = np.array([mixbox.rgb_to_latent(hex_to_rgb(t["hex"])) for t in inventory["tubes"]])
        self.paste_share = paste_share
        self.paste_latent = np.array(mixbox.rgb_to_latent(hex_to_rgb(inventory["paste"]["hex"])))

    def mix_rgb(self, indices: tuple[int, ...], shares: np.ndarray) -> tuple[int, int, int]:
        paint = shares @ self.latents[list(indices)]
        latent = (1 - self.paste_share) * paint + self.paste_share * self.paste_latent
        return tuple(mixbox.latent_to_rgb(latent.tolist()))

    def best_for(self, target_lab, indices: tuple[int, ...]) -> tuple[float, np.ndarray]:
        def search(grid: np.ndarray) -> tuple[float, np.ndarray]:
            scored = [(delta_e2000(target_lab, rgb_to_lab(self.mix_rgb(indices, s))), s) for s in grid]
            return min(scored, key=lambda item: item[0])

        best_de, best = search(simplex_grid(len(indices), COARSE_STEP))
        if len(indices) == 1:
            return best_de, best
        # Refine on a fine grid near the coarse optimum.
        fine = simplex_grid(len(indices), FINE_STEP)
        fine = fine[np.abs(fine - best).max(axis=1) <= COARSE_STEP]
        return search(fine)

    def recipe(self, target_hex: str) -> tuple[float, tuple[int, ...], np.ndarray]:
        target_lab = rgb_to_lab(hex_to_rgb(target_hex))
        best_by_size = []
        for size in range(1, MAX_TUBES + 1):
            candidates = [
                (*self.best_for(target_lab, combo), combo)
                for combo in itertools.combinations(range(len(self.names)), size)
            ]
            best_by_size.append(min(candidates, key=lambda item: item[0]))
        chosen = best_by_size[0]
        for candidate in best_by_size[1:]:
            if chosen[0] - candidate[0] > MIN_GAIN_DE:
                chosen = candidate
        de, shares, combo = chosen
        return de, combo, shares

    def best_parts(self, target_hex: str, combo: tuple[int, ...]) -> tuple[float, list[int]]:
        """Whole-number parts (each ≥ 1, total ≤ MAX_PARTS) with the lowest ΔE.

        Ties within 0.1 ΔE go to the recipe with fewer total parts.
        """
        target_lab = rgb_to_lab(hex_to_rgb(target_hex))
        best_de, best = float("inf"), None
        for total in range(len(combo), MAX_PARTS + 1):
            for parts in itertools.product(range(1, total + 1), repeat=len(combo)):
                if sum(parts) != total:
                    continue
                shares = np.array(parts, dtype=float) / total
                de = delta_e2000(target_lab, rgb_to_lab(self.mix_rgb(combo, shares)))
                if de < best_de - 0.1:
                    best_de, best = de, list(parts)
        return best_de, best


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="folder with bands.json (and estimate.json)")
    parser.add_argument("--inventory", type=Path, help="her tubes as JSON (default: placeholders)")
    parser.add_argument("--materials", type=Path, help="materials JSON for the paint/paste split")
    parser.add_argument("--paste-in-mix", action="store_true", help="paste is mixed into the color")
    args = parser.parse_args()

    inventory = (
        json.loads(args.inventory.read_text(encoding="utf-8")) if args.inventory else PLACEHOLDER_INVENTORY
    )
    materials = load_materials(args.materials)
    paste_share = 1 - materials.paint_fraction if args.paste_in_mix else 0.0
    mixer = Mixer(inventory, paste_share)

    bands = json.loads((args.folder / "bands.json").read_text(encoding="utf-8"))["bands"]
    estimate_path = args.folder / "estimate.json"
    grams = (
        {b["name"]: b for b in json.loads(estimate_path.read_text(encoding="utf-8"))["bands"]}
        if estimate_path.exists()
        else {}
    )

    if inventory.get("placeholder"):
        print("PLACEHOLDER tubes, not her inventory.")
    print(f"Paste {'mixed into the color' if paste_share else 'under the paint, not in the color'}.\n")
    recipes = []
    for band in bands:
        de, combo, shares = mixer.recipe(band["color_hex"])
        parts_de, parts = mixer.best_parts(band["color_hex"], combo)
        band_grams = grams.get(band["name"])
        tubes = [
            Ingredient(
                name=mixer.names[i],
                share=round(float(s), 2),
                grams=round(float(s) * band_grams["paint_g"]) if band_grams else None,
                parts=p,
            )
            for i, s, p in sorted(zip(combo, shares, parts), key=lambda item: -item[1])
        ]
        recipe = Recipe(
            band=band["name"],
            target_hex=band["color_hex"],
            predicted_hex=rgb_to_hex(mixer.mix_rgb(combo, shares)),
            delta_e=round(de, 2),
            parts_delta_e=round(parts_de, 2),
            tubes=tubes,
            paste_grams=round(band_grams["paste_g"]) if band_grams else None,
        )
        recipes.append(recipe)
        weighed = " + ".join(
            f"{t.share:.0%} {t.name}" + (f" ({t.grams:.0f} g)" if t.grams is not None else "") for t in tubes
        )
        print(f"{recipe.band:<14} {recipe.target_hex} → {recipe.predicted_hex}  ΔE {recipe.delta_e:5.2f}  {weighed}")
        print(
            f"{'':<14} rough parts {':'.join(str(t.parts) for t in tubes)}  ΔE {recipe.parts_delta_e:5.2f}"
        )

    output = {
        "placeholder_inventory": bool(inventory.get("placeholder")),
        "paste_in_mix": bool(paste_share),
        "recipes": [asdict(r) for r in recipes],
    }
    (args.folder / "recipes.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {args.folder / 'recipes.json'}")


if __name__ == "__main__":
    main()
