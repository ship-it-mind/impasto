"""Mixing model: which of her tubes, in what ratio, hit each band's color.

    uv run python -m impasto.mixing output/rectify/painting
    uv run python -m impasto.mixing output/rectify/painting --inventory tubes.json --paste-in-mix
    uv run python -m impasto.mixing output/rectify/painting --without "Sap Green" --without "Mars Black"

Mixes are predicted with Mixbox (Sochorova & Jamriska 2021, CC BY-NC 4.0),
which models paint as real pigments rather than averaging RGB. For each
band, every combination of 1–3 tubes is searched for the ratio with the
lowest CIEDE2000 difference to the band's color. A tube is only added when it
improves the match by more than MIN_GAIN_DE, so recipes stay short.

She mixes by parts, not by weight, so each recipe is also rounded to whole
parts with its own ΔE, since rounding a 4% tube to 1 part in 10 shifts the
color: at most SHORT_PARTS, or up to MAX_PARTS when that is still visibly off. With paste in the mix, the paste gets parts too.

Each recipe also names the tube to add if the mix comes out too dark, and the
one to add if it comes out too light: the tube whose NUDGE share moves L* the
right way with the least shift in hue and chroma, preferring tubes already in
the recipe.

--paste-in-mix treats the modeling paste as part of the colored mix (tinted
paste), using the paint/paste split from the materials file. Without it the
paste is assumed to sit under the paint and not affect color.

--without leaves out a tube the user doesn't have for this piece; nothing is
saved, so the next piece starts from the full list again.

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
# She mixes in whole parts: at most SHORT_PARTS in all, or up to MAX_PARTS if the
# short recipe is more than GOOD_PARTS_DE off.
SHORT_PARTS = 10
MAX_PARTS = 20
GOOD_PARTS_DE = 1.5
# Too dark / too light: the share of a tube added to test it, and how far it must move L*.
NUDGE = 0.2
MIN_NUDGE_L = 1.0


@dataclass
class Ingredient:
    name: str
    share: float  # of the paint
    grams: float | None
    parts: int  # whole parts, how she mixes


@dataclass
class Recipe:
    band: str
    target_hex: str
    predicted_hex: str
    delta_e: float  # mixed at the exact shares
    parts_delta_e: float  # mixed by the whole parts
    tubes: list[Ingredient]
    paste_parts: int | None  # only when paste is mixed into the color
    paste_grams: float | None
    if_too_dark: str | None  # tube to add a little of
    if_too_light: str | None


def without(inventory: dict, names: list[str]) -> dict:
    """The inventory minus the tubes the user unticked for this piece (names match case-insensitively)."""
    known = {tube["name"].lower() for tube in inventory["tubes"]}
    unknown = [name for name in names if name.lower() not in known]
    if unknown:
        raise ValueError(f"No such tube: {', '.join(unknown)}. Tubes: {', '.join(t['name'] for t in inventory['tubes'])}.")
    dropped = {name.lower() for name in names}
    tubes = [tube for tube in inventory["tubes"] if tube["name"].lower() not in dropped]
    if not tubes:
        raise ValueError("Every tube was left out; keep at least one.")
    return {**inventory, "tubes": tubes}


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
        """Whole-number parts (each ≥ 1) with the lowest ΔE, at most SHORT_PARTS in all
        unless more parts (up to MAX_PARTS) are needed to get within GOOD_PARTS_DE.

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
            if total >= SHORT_PARTS and best_de <= GOOD_PARTS_DE:
                break
        return best_de, best

    def paste_parts(self, paint_parts: int) -> int | None:
        """Parts of paste next to paint_parts of tube, or None if the paste isn't in the mix."""
        if not self.paste_share:
            return None
        return max(1, round(paint_parts * self.paste_share / (1 - self.paste_share)))

    def nudges(self, combo: tuple[int, ...], shares: np.ndarray) -> tuple[str | None, str | None]:
        """The tube to add if the mix is too dark, and the one if it's too light."""
        base = rgb_to_lab(self.mix_rgb(combo, shares))
        tested = []
        for i in range(len(self.names)):
            indices = combo if i in combo else (*combo, i)
            nudged = (np.append(shares, 0.0) if i not in combo else shares.copy()) * (1 - NUDGE)
            nudged[indices.index(i)] += NUDGE
            lab = rgb_to_lab(self.mix_rgb(indices, nudged))
            shift = float(np.hypot(lab[1] - base[1], lab[2] - base[2]))
            tested.append((lab[0] - base[0], i not in combo, shift, i))

        def pick(sign: int) -> str | None:
            moves = [(outside, shift, i) for dl, outside, shift, i in tested if sign * dl >= MIN_NUDGE_L]
            return self.names[min(moves)[2]] if moves else None

        return pick(+1), pick(-1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path, help="folder with bands.json (and estimate.json)")
    parser.add_argument("--inventory", type=Path, help="her tubes as JSON (default: placeholders)")
    parser.add_argument("--materials", type=Path, help="materials JSON for the paint/paste split")
    parser.add_argument("--paste-in-mix", action="store_true", help="paste is mixed into the color")
    parser.add_argument("--without", action="append", default=[], metavar="TUBE",
                        help="leave out a tube for this piece; repeat for several")
    args = parser.parse_args()

    inventory = (
        json.loads(args.inventory.read_text(encoding="utf-8")) if args.inventory else PLACEHOLDER_INVENTORY
    )
    try:
        inventory = without(inventory, args.without)
    except ValueError as error:
        parser.error(str(error))
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
        lighten, darken = mixer.nudges(combo, shares)
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
            paste_parts=mixer.paste_parts(sum(parts)),
            paste_grams=round(band_grams["paste_g"]) if band_grams else None,
            if_too_dark=lighten,
            if_too_light=darken,
        )
        recipes.append(recipe)
        weighed = " + ".join(
            f"{t.share:.0%} {t.name}" + (f" ({t.grams:.0f} g)" if t.grams is not None else "") for t in tubes
        )
        print(f"{recipe.band:<14} {recipe.target_hex} → {recipe.predicted_hex}  ΔE {recipe.delta_e:5.2f}  {weighed}")
        paste = f" + {recipe.paste_parts} paste" if recipe.paste_parts else ""
        print(
            f"{'':<14} parts {':'.join(str(t.parts) for t in tubes)}{paste}  ΔE {recipe.parts_delta_e:5.2f}"
            f"  too dark: {recipe.if_too_dark or '-'}  too light: {recipe.if_too_light or '-'}"
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
