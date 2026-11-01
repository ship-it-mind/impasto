# /// script
# dependencies = ["numpy", "scipy"]
# ///
"""The film's score, synthesised from nothing: every sound is maths, written without ever hearing it.
Writes public/track.wav and src/reactive.json (what the picture reacts to)."""
import base64, json, wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

ROOT = Path(__file__).parent.parent
SR = 48000
BPM = 120
B = 60 / BPM
TOTAL_BEATS = 360
N = int(TOTAL_BEATS * B * SR) + SR * 2
rng = np.random.default_rng(7)


midi = lambda n: 440 * 2 ** ((np.asarray(n, dtype=float) - 69) / 12)
at = lambda beat: int(beat * B * SR)


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, sig, beat, gain=1.0, pan=0.5):
        i = at(beat)
        if i >= N or i + len(sig) <= 0:
            return
        sig = sig[: N - i]
        l, r = np.cos(pan * np.pi / 2), np.sin(pan * np.pi / 2)
        self.x[i : i + len(sig), 0] += sig * gain * l * 1.414
        self.x[i : i + len(sig), 1] += sig * gain * r * 1.414


def tvec(sec):
    return np.arange(int(sec * SR)) / SR


def additive(freq, sec, cutoff=4000, odd=False, detune=0.0):
    """Band-limited saw (or square): sums harmonics up to the cutoff, so there's no aliasing."""
    t = tvec(sec)
    y = np.zeros_like(t)
    k = 1
    while k * freq < min(cutoff, SR * 0.45) and k < 40:
        if not odd or k % 2:
            y += np.sin(2 * np.pi * freq * (1 + detune) * k * t + k) / k
        k += 1
    return y


def kick(body=1.0):
    t = tvec(0.42)
    f = 46 + 120 * np.exp(-t * 30) + 40 * np.exp(-t * 120)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = rng.standard_normal(len(t)) * np.exp(-t * 700) * 0.25
    return np.tanh((y * body + click) * 2.2) * 0.85


def softkick():
    t = tvec(0.3)
    f = 50 + 60 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)


def band(y, lo, hi):
    return sosfilt(butter(2, [lo / (SR / 2), hi / (SR / 2)], "band", output="sos"), y)


def clap():
    t = tvec(0.34)
    n = rng.standard_normal(len(t))
    env = np.maximum.reduce([np.exp(-np.maximum(t - d, 0) * 95) * (t >= d) for d in (0, 0.012, 0.024)]) + 0.5 * np.exp(-t * 16)
    return band(n, 900, 5200) * env * 1.3


def hat(open_=False):
    t = tvec(0.22 if open_ else 0.06)
    n = sosfilt(butter(4, 7500 / (SR / 2), "high", output="sos"), rng.standard_normal(len(t)))
    return n * np.exp(-t * (16 if open_ else 80))


def tick(freq=1900):
    t = tvec(0.09)
    return (np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * freq * 2.01 * t)) * np.exp(-t * 62)


def sweep(sec, f0, f1, q=1.1, up_gain=True):
    """Noise through a moving band: risers and whooshes."""
    n = rng.standard_normal(int(sec * SR))
    out = np.zeros_like(n)
    block = 256
    zi = None
    for s in range(0, len(n), block):
        u = s / len(n)
        f = f0 * (f1 / f0) ** u
        w = min(0.98, max(0.001, f / (SR / 2)))
        bw = w / q
        b, a = butter(2, [max(0.0005, w - bw / 2), min(0.99, w + bw / 2)], "band")
        if zi is None:
            zi = np.zeros(max(len(a), len(b)) - 1)
        out[s : s + block], zi = lfilter(b, a, n[s : s + block], zi=zi)
    return out


def riser(beats):
    sec = beats * B
    y = sweep(sec, 300, 11000)
    u = np.linspace(0, 1, len(y))
    return y * u**2.4


def whoosh(sec=0.7, peak=0.75):
    y = sweep(sec, 500, 6000, q=0.9)
    u = np.linspace(0, 1, len(y))
    return y * np.sin(np.pi * u**peak) ** 1.5


def impact():
    t = tvec(2.6)
    f = 34 + 70 * np.exp(-t * 14)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    n = band(rng.standard_normal(len(t)), 120, 5000) * np.exp(-t * 9) * 0.5
    return np.tanh((y + n) * 1.8)


# F minor: Fm9, Dbmaj7, Abmaj7, Eb6sus. Each lasts two bars.
CHORDS = [[53, 60, 63, 67, 68 + 4], [49, 60, 61, 65, 68], [44, 60, 63, 67, 70], [51, 58, 63, 65, 70]]
ROOTS = [29, 25, 32, 27]


def chord_at(beat):
    return int(beat // 8) % 4


main, verb, delay, duck = Bus(), Bus(), Bus(), Bus()  # duck: pumped by the kick
kicks, claps, hats, stabs, arps, basses, ticks_, hits = [], [], [], [], [], [], [], []

CHAPTERS = [84, 124, 192, 300]
GAPS = [(74, 76), (122, 124), (190, 192), (298, 300), (350, 352)]
in_gap = lambda b: any(a <= b < z for a, z in GAPS)


def scrape(beats, peak=0.5):
    """A loaded knife dragged through paste: gritty band-passed noise that swells and dies."""
    y = sweep(beats * B, 700, 2200, q=0.75) + 0.4 * sweep(beats * B, 2600, 5200, q=1.2)
    u = np.linspace(0, 1, len(y))
    grit = 0.7 + 0.3 * np.interp(u, np.linspace(0, 1, 90), rng.random(90))
    return y * np.sin(np.pi * u**peak) ** 1.2 * grit


def level(b, pts):
    return float(np.interp(b, [p[0] for p in pts], [p[1] for p in pts]))

# ---------- The pad runs through nearly everything, opening and closing with the story.
PAD_LEVEL = [(0, 0.03), (28, 0.05), (76, 0.065), (124, 0.07), (192, 0.075), (260, 0.085), (300, 0.07), (336, 0.08), (352, 0.0)]
PAD_CUT = [(0, 500), (28, 800), (76, 1400), (124, 2200), (192, 3000), (260, 1400), (300, 2400), (336, 1200), (352, 800)]
for b in range(0, 352, 8):
    ch = CHORDS[chord_at(b)]
    sec = 8 * B + 1.2
    t = tvec(sec)
    env_ = np.clip(t / 0.9, 0, 1) * np.clip((sec - t) / 1.2, 0, 1)
    for i, n in enumerate(ch):
        for det, pan in ((-0.002, 0.25), (0.002, 0.75)):
            s = additive(midi(n), sec, level(b, PAD_CUT), detune=det) * env_
            duck.add(s, b, level(b, PAD_LEVEL) * (1.25 if i == 0 else 1) * 0.5, pan)
            verb.add(s, b, level(b, PAD_LEVEL) * 0.12, pan)

# ---------- COLD OPEN, 0-28: paint, a knife, a definition.
for b, n in ((1, 7), (9, 6), (17, 7)):
    main.add(scrape(n), b, 0.16, 0.42 + 0.03 * n); verb.add(scrape(n), b, 0.05)
for b in (7, 10.5, 12.5):
    main.add(tick(1700), b, 0.14); verb.add(tick(1700), b, 0.14)
main.add(riser(4), 20, 0.09)
main.add(impact(), 24, 0.2); verb.add(impact(), 24, 0.09); hits.append(24)
main.add(tick(2500), 24, 0.2); verb.add(tick(2500), 24, 0.2)

# ---------- THE STORY, 28-76: a pulse comes up under the words.
for b in range(28, 76):
    if in_gap(b):
        continue
    main.add(softkick(), b, 0.45 if b < 44 else 0.7)
    kicks.append((b, 0.5 if b < 44 else 0.7))
for b in np.arange(36.5, 74, 1):
    main.add(hat(), b, 0.07, 0.62); hats.append(b)
for b in (48, 52, 56):
    main.add(impact(), b, 0.09); main.add(whoosh(0.5), b - 0.45, 0.09, 0.5)
    hits.append(b)
for b in (45, 46, 47):
    main.add(tick(1500 + (b - 45) * 400), b, 0.2); verb.add(tick(1500 + (b - 45) * 400), b, 0.14)
for b in np.arange(48, 60, 1):
    main.add(tick(900 + 200 * ((b * 2) % 5)), b + 0.5, 0.06, 0.3 + 0.4 * ((b * 2) % 2))
main.add(riser(10), 64, 0.15); main.add(whoosh(1.9, 0.95), 74, 0.15)

# ---------- THE GROOVE. Everything from the drop on follows these sections.
main.add(impact(), 76, 0.28); verb.add(impact(), 76, 0.12); hits.append(76)
def groove(b):
    """(kick, bass cutoff, clap, hat level) at beat b."""
    if 260 <= b < 300:
        return (0.7 if b % 2 == 0 else 0, 0, False, 0.03)  # half time: the guide breathes
    if 336 <= b:
        return (0, 0, False, 0)
    return (1.0, 500 if b < 124 else 1000 if b < 192 else 1700, True, 0.06 if b < 124 else 0.075)
for b in range(76, 336):
    k, cut, cl, h = groove(b)
    if in_gap(b):
        continue
    if k:
        main.add(kick(), b, k * 0.95); kicks.append((b, k))
    if cl and b % 2 == 1:
        main.add(clap(), b, 0.28, 0.5); verb.add(clap(), b, 0.09); claps.append(b)
    if h:
        main.add(hat(True), b + 0.5, h, 0.6); hats.append(b + 0.5)
        main.add(hat(), b + 0.25, h * 0.33, 0.38); main.add(hat(), b + 0.75, h * 0.45, 0.38)
BASS = [0, 0.75, 1.5, 2.5, 3, 3.5]; OCT = [0, 0, 12, 0, 12, 0]
for bar in range(76, 336, 4):
    for off, o in zip(BASS, OCT):
        b = bar + off
        k, cut, _, _ = groove(b)
        if not cut or in_gap(b):
            continue
        root = ROOTS[chord_at(b)] + o + 12
        s = np.tanh(additive(midi(root), 0.26, cut) * np.exp(-tvec(0.26) * 9) * np.clip(tvec(0.26) * 400, 0, 1) * 1.8)
        duck.add(s, b, 0.34); basses.append((b, root))

# Chapter drops: a riser in, an impact on the card.
for b in (124, 192, 300):
    main.add(riser(6), b - 6, 0.13); main.add(whoosh(1.9, 0.95), b - 2, 0.13)
    main.add(impact(), b, 0.24); verb.add(impact(), b, 0.1); hits.append(b)
main.add(impact(), 84, 0.14); hits.append(84)
main.add(impact(), 260, 0.22); hits.append(260)

# Stabs under the brief and the recipe: the screen cuts on these.
STAB = [0, 1.5, 3, 3.5]
for lo, hi, g in ((84, 122, 0.8), (192, 258, 1.0), (300, 334, 0.85)):
    for bar in range(lo, hi, 4):
        for off in STAB:
            b = bar + off
            ch = CHORDS[chord_at(b)]
            for i, n in enumerate(ch[1:]):
                s = additive(midi(n + 12), 0.4, 3000, detune=(i - 1.5) * 0.0015) * np.exp(-tvec(0.4) * 10)
                duck.add(s, b, 0.045 * g, 0.3 + 0.13 * i); delay.add(s, b, 0.02 * g, 0.3 + 0.13 * i); verb.add(s, b, 0.015 * g)
            stabs.append(b)

# Arp.
ARP = [0, 2, 3, 4, 3, 2, 4, 1]
def arp(b, cut, gain):
    ch = CHORDS[chord_at(b)]
    n = ch[ARP[int(round(b * 4)) % 8]] + 12
    s = additive(midi(n), 0.32, cut, odd=True) * np.exp(-tvec(0.32) * 12) * np.clip(tvec(0.32) * 700, 0, 1)
    pan = 0.5 + 0.34 * np.sin(b * 1.7)
    duck.add(s, b, gain, pan); delay.add(s, b, gain * 0.5, pan); arps.append((b, n))
for b in np.arange(124, 190, 0.25):
    arp(b, 1400 + 4600 * (b - 124) / 66, 0.07)
for b in np.arange(260, 298, 0.5):
    arp(b, 1800, 0.075)
for b in np.arange(224, 258, 0.5):
    arp(b, 3000, 0.05)

# The lead, over the concepts: the emotional top of the film.
LEAD = [(0, 72, 1.5), (1.5, 75, 1), (2.5, 77, 1.5), (4, 80, 2), (6, 79, 1), (7, 75, 1), (8, 73, 1.5), (9.5, 77, 1), (10.5, 80, 1.5), (12, 84, 2.5), (14.5, 82, 1.5)]
for start in (128, 144, 160, 176):
    for off, n, dur in LEAD:
        b = start + off
        sec = dur * B
        t = tvec(sec)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t * 3, 0, 1)
        y = sum(np.sin(2 * np.pi * np.cumsum(midi(n) * k * vib) / SR) / k for k in range(1, 8))
        y = y * np.clip(t * 60, 0, 1) * np.clip((sec - t) * 14, 0, 1)
        main.add(y, b, 0.045, 0.5); delay.add(y, b, 0.03, 0.5); verb.add(y, b, 0.03)

# A tick on every stage of the guide, climbing.
for i in range(8):
    b = 264 + i * 3.5
    main.add(tick(1200 * 2 ** (i / 12 * 2)), b, 0.18); verb.add(tick(1200 * 2 ** (i / 12 * 2)), b, 0.16)
    hits.append(b)
# The tap on the shape, and its repaint.
main.add(tick(2400), 157, 0.22); verb.add(tick(2400), 157, 0.2)
main.add(tick(2400), 158.5, 0.22); verb.add(tick(2400), 158.5, 0.2)
main.add(whoosh(1.4, 0.4), 165.6, 0.15); hits.append(166)
# Bowl: two found dots, the reading, the verdict.
for b, f in ((306, 2600), (308, 2000), (312, 1300)):
    main.add(tick(f), b, 0.2); verb.add(tick(f), b, 0.18)

# ---------- THE END: a hush, a last drag of the knife, the chord.
main.add(scrape(5), 346, 0.2, 0.5); verb.add(scrape(5), 346, 0.06)
sec = 8.4 * B
t = tvec(sec)
for i, n in enumerate([41, 53, 60, 63, 67, 72, 79]):
    for det, pan in ((-0.0018, 0.2), (0.0018, 0.8)):
        s = additive(midi(n), sec, 2600 if i else 500, detune=det) * np.exp(-t * 0.5) * np.clip(t * 60, 0, 1)
        main.add(s, 352, 0.05 if i else 0.1, pan); verb.add(s, 352, 0.008, pan)
main.add(impact(), 352, 0.3); main.add(kick(), 352, 0.9); hits.append(352)
main.add(tick(2500), 352, 0.2); verb.add(tick(2500), 352, 0.2)

# ---------- Mix down to the film's "source" timeline.
pump = np.ones(N)
for b, g in kicks:
    i = at(b)
    t = tvec(0.42)[: N - i]
    pump[i : i + len(t)] = np.minimum(pump[i : i + len(t)], 1 - 0.72 * g * np.exp(-t * 11))
main.x += duck.x * pump[:, None]
# Dotted-eighth stereo delay.
d = int(0.75 * B * SR)
echo = np.zeros_like(delay.x)
src = delay.x.copy()
for k in range(1, 6):
    g = 0.5**k
    side = (k % 2)
    echo[d * k :, side] += src[: -d * k].sum(axis=1) * g
main.x += echo * 0.8
# A room.
ln = int(2.4 * SR)
ir_t = np.arange(ln) / SR
ir = rng.standard_normal((ln, 2)) * np.exp(-ir_t * 2.6)[:, None]
ir = sosfilt(butter(1, 5000 / (SR / 2), "low", output="sos"), ir, axis=0)
wet = np.stack([fftconvolve(verb.x[:, c], ir[:, c])[:N] for c in range(2)], axis=1) * 0.5
pre = main.x + wet

final = pre

# ---------- Master.
final = sosfilt(butter(2, 28 / (SR / 2), "high", output="sos"), final, axis=0)
final = final[: int(TOTAL_BEATS * B * SR)]
fade = np.clip((len(final) - np.arange(len(final))) / (1.2 * SR), 0, 1)
final *= fade[:, None]
# A look-ahead limiter, so loud moments don't push everything else down, then a touch of saturation.
target = 0.17  # body of the mix, by rms, sets the level
rms = np.sqrt((final[at(130):at(188)] ** 2).mean())
final = final * (target / rms)
peak = np.abs(final).max(axis=1)
look, rel = int(0.004 * SR), int(0.09 * SR)
need = np.minimum(1.0, 0.82 / np.maximum(peak, 1e-6))
need = -np.convolve(-need, np.ones(look * 2 + 1) / 1, "same") * 0 + np.array(need)
# hold the lowest gain over the look-ahead window, then let it recover smoothly
from scipy.ndimage import minimum_filter1d, uniform_filter1d
g = minimum_filter1d(need, look * 2 + 1)
g = minimum_filter1d(g, rel // 2)
g = uniform_filter1d(g, rel // 2)
final = final * g[:, None]
final = np.tanh(final * 1.05) / np.tanh(1.05) * 0.97
final = np.clip(final, -0.98, 0.98)
with wave.open(str(ROOT / "public/track.wav"), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((final * 32767).astype("<i2").tobytes())

# ---------- What the picture reacts to, on the source timeline, 120 samples a beat.
RATE = 120
L = TOTAL_BEATS * RATE
grid = np.arange(L) / RATE
def env(events, decay):
    y = np.zeros(L)
    for e in events:
        b, g = e if isinstance(e, tuple) else (e, 1.0)
        m = grid >= b
        y[m] = np.maximum(y[m], g * np.exp(-(grid[m] - b) * decay))
    return np.round(y, 3).tolist()
wave_src = pre.mean(axis=1)[:: SR // 3000]
wave_src = np.clip(wave_src / (np.abs(wave_src).max() + 1e-6) * 127, -127, 127).astype(np.int8)
(ROOT / "src/reactive.json").write_text(json.dumps({
    "rate": RATE,
    "kick": env(kicks, 5), "clap": env(claps, 6), "hat": env(list(hats), 9), "stab": env(stabs, 4.5),
    "arp": env([(b, 1.0) for b, _ in arps], 8), "bass": env([(b, 1.0) for b, _ in basses], 4),
    "hit": env(hits, 1.2),
    "wave": base64.b64encode(wave_src.tobytes()).decode(), "waveRate": 3000,
}))
print("peak", float(np.abs(final).max()), "rms dB", float(20 * np.log10(np.sqrt((final**2).mean()))))
