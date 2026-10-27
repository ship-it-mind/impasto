"""Color conversions (sRGB ↔ CIELAB, D65) and the CIEDE2000 color difference."""

from __future__ import annotations

import math

# sRGB (D65) to XYZ, and the D65 reference white.
_RGB_TO_XYZ = (
    (0.4124564, 0.3575761, 0.1804375),
    (0.2126729, 0.7151522, 0.0721750),
    (0.0193339, 0.1191920, 0.9503041),
)
_XYZ_TO_RGB = (
    (3.2404542, -1.5371385, -0.4985314),
    (-0.9692660, 1.8760108, 0.0415560),
    (0.0556434, -0.2040259, 1.0572252),
)
_WHITE = (0.95047, 1.0, 1.08883)

RGB = tuple[int, int, int]
Lab = tuple[float, float, float]


def hex_to_rgb(value: str) -> RGB:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def rgb_to_hex(rgb: RGB) -> str:
    return "#%02x%02x%02x" % tuple(rgb)


def _to_linear(channel: float) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _from_linear(channel: float) -> int:
    c = min(1.0, max(0.0, channel))
    c = c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return round(c * 255)


def rgb_to_lab(rgb: RGB) -> Lab:
    linear = [_to_linear(c) for c in rgb]
    xyz = [sum(m * c for m, c in zip(row, linear)) / w for row, w in zip(_RGB_TO_XYZ, _WHITE)]
    f = [t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29 for t in xyz]
    return 116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])


def lab_to_rgb(lab: Lab) -> RGB:
    L, a, b = lab
    fy = (L + 16) / 116
    f = (fy + a / 500, fy, fy - b / 200)
    xyz = [
        w * (t**3 if t > 6 / 29 else 3 * (6 / 29) ** 2 * (t - 4 / 29))
        for t, w in zip(f, _WHITE)
    ]
    return tuple(_from_linear(sum(m * c for m, c in zip(row, xyz))) for row in _XYZ_TO_RGB)


def delta_e2000(lab1: Lab, lab2: Lab) -> float:
    """CIEDE2000 (Sharma, Wu & Dalal 2005), with kL = kC = kH = 1."""
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    c_bar = (math.hypot(a1, b1) + math.hypot(a2, b2)) / 2
    g = 0.5 * (1 - math.sqrt(c_bar**7 / (c_bar**7 + 25**7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if c1p else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if c2p else 0.0

    dLp = L2 - L1
    dCp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp / 2))

    Lp_bar = (L1 + L2) / 2
    Cp_bar = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hp_bar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hp_bar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hp_bar = (h1p + h2p + 360) / 2
    else:
        hp_bar = (h1p + h2p - 360) / 2

    t = (
        1
        - 0.17 * math.cos(math.radians(hp_bar - 30))
        + 0.24 * math.cos(math.radians(2 * hp_bar))
        + 0.32 * math.cos(math.radians(3 * hp_bar + 6))
        - 0.20 * math.cos(math.radians(4 * hp_bar - 63))
    )
    d_theta = 30 * math.exp(-(((hp_bar - 275) / 25) ** 2))
    rc = 2 * math.sqrt(Cp_bar**7 / (Cp_bar**7 + 25**7))
    sl = 1 + 0.015 * (Lp_bar - 50) ** 2 / math.sqrt(20 + (Lp_bar - 50) ** 2)
    sc = 1 + 0.045 * Cp_bar
    sh = 1 + 0.015 * Cp_bar * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc
    return math.sqrt(
        (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh)
    )
