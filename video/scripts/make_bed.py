# /// script
# dependencies = ["numpy"]
# ///
"""A quiet original music bed, made from sine waves so there's nothing to license. Writes public/music/bed.wav."""
import wave
from pathlib import Path

import numpy as np

RATE, SECONDS = 48000, 176
t = np.arange(RATE * SECONDS) / RATE
midi = lambda n: 440 * 2 ** ((n - 69) / 12)
# Slow changes, a warm major seventh and its neighbours.
CHORDS = [[44, 56, 60, 63, 67], [41, 56, 60, 63, 68], [49, 56, 61, 65, 68], [46, 58, 61, 65, 70]]
BAR = 11.0
pad = np.zeros((len(t), 2))
for start in np.arange(-BAR, SECONDS, BAR):
    chord = CHORDS[int(round(start / BAR)) % len(CHORDS)]
    env = np.clip((t - start) / 4.5, 0, 1) * np.clip((start + BAR + 4.5 - t) / 4.5, 0, 1)
    env = np.sin(env * np.pi / 2) ** 2
    live = env > 0
    for i, n in enumerate(chord):
        f = midi(n)
        for side, detune in enumerate((-0.0009, 0.0009)):
            wobble = 1 + 0.12 * np.sin(2 * np.pi * (0.07 + i * 0.013) * t[live] + i + side)
            tone = np.sin(2 * np.pi * f * (1 + detune) * t[live]) + 0.22 * np.sin(4 * np.pi * f * t[live]) + 0.06 * np.sin(6 * np.pi * f * t[live])
            pad[live, side] += env[live] * wobble * tone * (0.5 if i == 0 else 0.26)

# A few soft struck notes.
rng = np.random.default_rng(4)
notes = np.zeros((len(t), 2))
for start in np.arange(3, SECONDS - 6, 5.5):
    chord = CHORDS[int(start // BAR) % len(CHORDS)]
    n = chord[rng.integers(2, 5)] + 12
    begin, length = int((start + rng.uniform(-0.3, 0.3)) * RATE), int(5 * RATE)
    k = np.arange(length) / RATE
    f = midi(n)
    tone = (np.sin(2 * np.pi * f * k) + 0.3 * np.sin(4 * np.pi * f * k) * np.exp(-k * 3)) * np.exp(-k * 1.3) * (1 - np.exp(-k * 90))
    pan = rng.uniform(0.35, 0.65)
    end = min(begin + length, len(t))
    notes[begin:end, 0] += tone[: end - begin] * pan * 0.42
    notes[begin:end, 1] += tone[: end - begin] * (1 - pan) * 0.42

mix = pad + notes
# A simple room: a handful of decaying echoes.
wet = np.zeros_like(mix)
for delay, gain in ((0.031, 0.5), (0.067, 0.42), (0.113, 0.33), (0.197, 0.26), (0.331, 0.18), (0.523, 0.11)):
    d = int(delay * RATE)
    wet[d:, 0] += mix[:-d, 0] * gain
    wet[d:, 1] += mix[:-d, 1] * gain * 0.92
mix = mix + 0.55 * wet
# Round off the top: a gentle one-pole low-pass.
alpha = 0.16
for c in range(2):
    y, out = 0.0, mix[:, c]
    for i in range(len(out)):
        y += alpha * (out[i] - y)
        out[i] = y
fade = np.clip(t / 3, 0, 1) * np.clip((SECONDS - t) / 5, 0, 1)
mix *= fade[:, None]
mix = mix / np.abs(mix).max() * 0.5
out = Path(__file__).parent.parent / "public/music/bed.wav"
out.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("peak", float(np.abs(mix).max()), "rms dB", float(20 * np.log10(np.sqrt((mix ** 2).mean()))))
