# /// script
# dependencies = ["numpy", "scipy"]
# ///
"""Light background music for the demo, synthesised from nothing, so there's nothing to license:
soft piano, a warm pad and a little room, in D major at 70 BPM. It follows the film's sections
(SECTIONS, in seconds, from src/Video.tsx): sparse under the intro, almost nothing under Yara,
a minor turn and a pause in "I thought this would be easy", moving piano through the app, a lift
into the callback, and a held chord under the wordmark. The film turns it down under every voice.

    uv run scripts/music.py   → public/music.wav
"""
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 70
BEAT = 60 / BPM
BAR = 4 * BEAT
TOTAL = 179.84
# Where each part of the film starts (s), and the moments the music answers.
SECTIONS = {'intro': 9.0, 'yara': 30.93, 'easy': 47.53, 'wrong': 51.2, 'guess': 63.5, 'app': 66.47,
            'hood': 128.07, 'back': 151.0, 'last': 156.73, 'end': 178.23}
rng = np.random.default_rng(11)
N = int((TOTAL + 6) * SR)
out = np.zeros((N, 2))
midi = lambda n: 440 * 2 ** ((n - 69) / 12)


def place(sig, t, gain=1.0, pan=0.5):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i]
    out[i:i + len(sig), 0] += sig * gain * np.cos(pan * np.pi / 2) * 1.414
    out[i:i + len(sig), 1] += sig * gain * np.sin(pan * np.pi / 2) * 1.414


def piano(note, vel=0.6, sec=4.5):
    """A soft, felt-like piano note: slightly stretched partials, each dying away faster the higher it is."""
    t = np.arange(int(sec * SR)) / SR
    f0 = midi(note)
    y = np.zeros_like(t)
    for n in range(1, 9):
        fn = n * f0 * np.sqrt(1 + 0.0004 * n * n)
        if fn > 9000: break
        amp = (1 / n ** 1.4) * (0.55 + 0.45 * vel) ** (n - 1)
        for d in (-0.0005, 0.0005):  # two strings, a hair apart
            y += amp * np.sin(2 * np.pi * fn * (1 + d) * t + n) * np.exp(-t * (0.9 + 0.55 * n + f0 / 900))
    y *= np.minimum(1, t / 0.006)  # a soft hammer
    hammer = sosfilt(butter(2, 1800, 'low', fs=SR, output='sos'), rng.standard_normal(len(t))) * np.exp(-t * 60) * 0.02
    return (y / 4 + hammer) * vel


def pad(notes, sec, attack=1.8, release=2.5):
    """A warm pad: a few gently detuned voices per note, low-passed, swelling in and out."""
    t = np.arange(int((sec + release) * SR)) / SR
    y = np.zeros_like(t)
    for note in notes:
        f = midi(note)
        for d in (-0.003, 0, 0.004):
            for k, a in ((1, 1), (2, 0.35), (3, 0.12)):
                y += a * np.sin(2 * np.pi * f * k * (1 + d) * t + rng.uniform(0, 6.28))
    env = np.minimum(1, t / attack) * np.clip((sec + release - t) / release, 0, 1)
    y = sosfilt(butter(2, 1400, 'low', fs=SR, output='sos'), y * env)
    return y / (len(notes) * 6)


def bass(note, sec):
    t = np.arange(int(sec * SR)) / SR
    f = midi(note)
    y = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.minimum(1, t / 0.05) * np.exp(-t * 0.5)
    return y * np.clip((sec - t) / 0.3, 0, 1) * 0.5


# Chords as (bass, pad notes, piano notes), in D major.
D = (38, [50, 54, 57, 62], [62, 66, 69, 74])
A = (37, [49, 52, 57, 61], [61, 64, 69, 73])   # A over C#
Bm = (35, [47, 50, 54, 59], [59, 62, 66, 71])
G = (31, [43, 50, 55, 59], [62, 67, 71, 74])
Em = (40, [52, 55, 59, 64], [64, 67, 71, 76])
Dadd9 = (38, [50, 57, 62, 64, 66], [66, 69, 74, 76])
LIGHT = [D, A, Bm, G]
TURN = [Bm, G, D, A]
LIFT = [G, A, Dadd9, Dadd9]


def part(t):
    for k in ('end', 'last', 'back', 'hood', 'app', 'guess', 'wrong', 'easy', 'yara', 'intro'):
        if t >= SECTIONS[k]: return k
    return 'hook'


bars = int(np.ceil((TOTAL + 2) / BAR))
for b in range(bars):
    t0 = b * BAR
    p = part(t0 + BAR / 2)
    prog = TURN if p in ('easy', 'wrong') else LIFT if p in ('back', 'end') else LIGHT
    chord = prog[b % 4] if p not in ('end',) else Dadd9
    lo, pads, keys = chord
    # The pad is always there, quieter under Yara.
    place(pad(pads, BAR), t0, {'hook': 0.9, 'yara': 0.55, 'last': 0.55, 'end': 0.8}.get(p, 0.75), 0.5)
    if p in ('hook', 'yara', 'last', 'wrong'):
        if p == 'last' and b % 2 == 0: place(piano(keys[-1], 0.32, 6), t0 + BEAT * 0.02, 0.8, 0.6)
        continue
    place(bass(lo, BAR), t0, 0.5 if p != 'intro' else 0.3)
    if p == 'end':
        continue
    # Piano: quarter notes in the intro and the turn, gentle eighths through the app, rising into the callback.
    step = BEAT if p in ('intro', 'easy', 'guess') else BEAT / 2
    count = int(round(BAR / step))
    pattern = [0, 2, 1, 3, 2, 1, 3, 2] if count == 8 else [0, 2, 1, 3]
    for i in range(count):
        note = keys[pattern[i % len(pattern)]] + (12 if p == 'back' and i >= count - 2 else 0)
        vel = (0.5 if i % (count // 2) == 0 else 0.36) * (1.1 if p == 'back' else 1) + rng.uniform(-0.04, 0.04)
        t = t0 + i * step + rng.uniform(-0.008, 0.012)
        place(piano(note, vel), t, 0.85, 0.3 + 0.4 * (pattern[i % len(pattern)] / 3))

# The last chord rings out under the wordmark, on its first frame.
lo, pads, keys = Dadd9
place(pad(pads, 3, attack=0.4, release=3), SECTIONS['end'] - 0.3, 0.8)
place(bass(lo, 3), SECTIONS['end'], 0.4)
for i, n in enumerate(keys): place(piano(n, 0.45, 7), SECTIONS['end'] + i * 0.09, 0.8, 0.35 + 0.1 * i)

# A small warm room, then gentle limiting.
irt = np.arange(int(2.2 * SR)) / SR
ir = np.stack([sosfilt(butter(2, 3500, 'low', fs=SR, output='sos'), rng.standard_normal(len(irt))) * np.exp(-irt / 0.55) for _ in range(2)], 1)
ir[:int(0.012 * SR)] = 0
wet = np.stack([fftconvolve(out[:, c], ir[:, c])[:N] for c in range(2)], 1)
mix = out + wet * (0.22 / np.abs(wet).max() * np.abs(out).max())
mix = mix[:int(TOTAL * SR)]
fade = np.ones(len(mix)); fi, fo = int(1.5 * SR), int(1.6 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo) ** 0.8
mix *= fade[:, None]
mix = np.tanh(mix / np.abs(mix).max() * 1.2) / np.tanh(1.2) * 0.89
path = Path(__file__).resolve().parent.parent / 'public' / 'music.wav'
with wave.open(str(path), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(path, f'{len(mix) / SR:.1f}s')
