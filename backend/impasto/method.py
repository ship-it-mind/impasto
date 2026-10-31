"""Which way to use the modeling paste on one painting: tinted, or underneath and painted once dry.

Tinted paste is mostly paste, so a band can only get as dark and deep as that
much pale paste allows. So the advice is measured, not a rule of thumb: every
band's best mix is worked out both ways from the same tubes. If tinted paste
leaves a band visibly off, and paste underneath does clearly better, the paste
goes underneath. Otherwise tinted paste wins: one session, no waiting, and the
color runs all the way through the ridges. No model call.
"""

from __future__ import annotations

from functools import lru_cache

from impasto.color import rgb_to_hex
from impasto.mixing import MIN_GAIN_DE, PLACEHOLDER_INVENTORY, Mixer, without
from impasto.volume import LEVELS, Materials

# A band's mix this far (ΔE2000) from its color is clearly off, as in impasto.concepts.
MAX_OFF_DE = 3.0
DRY_TIME = {"thin": "a few hours", "medium": "about a day", "heavy": "2–3 days"}


def dry_time(levels: list[str]) -> str:
    """How long the thickest paste in these relief levels takes to dry right through."""
    return DRY_TIME[max(levels, key=LEVELS.index)]


@lru_cache(maxsize=64)
def best_mixes(colors: tuple[str, ...], dropped: tuple[str, ...], paste_share: float) -> tuple[tuple[str, float], ...]:
    mixer = Mixer(without(PLACEHOLDER_INVENTORY, list(dropped)), paste_share)
    mixes = []
    for color in colors:
        de, combo, shares = mixer.recipe(color)
        mixes.append((rgb_to_hex(mixer.mix_rgb(combo, shares)), round(de, 1)))
    return tuple(mixes)


def named(names: list[str], most: int = 3) -> str:
    shown = names[:most] + ([f"{len(names) - most} more"] if len(names) > most else [])
    return shown[0] if len(shown) == 1 else f"{', '.join(shown[:-1])} and {shown[-1]}"


def advise(bands: list[dict], dropped: list[str], materials: Materials | None = None) -> dict:
    """The recommended way for these concept bands, why, and what each way can mix."""
    materials = materials or Materials()
    paste_share = 1 - materials.paint_fraction
    colors, key = tuple(band["hex"] for band in bands), tuple(sorted(dropped))
    under, tinted = best_mixes(colors, key, 0.0), best_mixes(colors, key, paste_share)

    off = [
        (band["name"], t_de)
        for band, (_, u_de), (_, t_de) in zip(bands, under, tinted)
        if t_de > MAX_OFF_DE and t_de - u_de > MIN_GAIN_DE
    ]
    under_max, tinted_max = max(de for _, de in under), max(de for _, de in tinted)
    if off:
        recommended = "under"
        reason = (
            f"Tinted paste is {paste_share:.0%} paste, so {named([name for name, _ in off])} can't reach "
            f"{'its' if len(off) == 1 else 'their'} color: the closest mix lands up to ΔE {max(de for _, de in off):.0f} off. "
            f"With the paste underneath, every band stays within ΔE {under_max:.1f}."
        )
    else:
        recommended = "tinted"
        reason = (
            f"Every band can be mixed as tinted paste within ΔE {tinted_max:.1f}, so you can paint it in one go, "
            "and the color runs all the way through the ridges."
        )

    def way(mixes: tuple[tuple[str, float], ...]) -> list[dict]:
        return [{"name": band["name"], "target_hex": band["hex"], "mix_hex": hex_, "delta_e": de} for band, (hex_, de) in zip(bands, mixes)]

    return {
        "recommended": recommended,
        "reason": reason,
        "paste_pct": round(paste_share * 100),
        "dry_time": dry_time([band["relief"] for band in bands]),
        "under": way(under),
        "tinted": way(tinted),
    }
