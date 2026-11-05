"""The user's voiceover takes (demo/voiceover/*.opus, git-ignored) → public/vo/, ready for the film.

Each take is cut to its speech, pauses longer than MAX_PAUSE between words are shortened to it (the
speech itself is untouched), then filtered (hum, a little noise) and leveled to -16 LUFS. Word times are
from faster-whisper (words.json, made beside this script's input); the shifted times go to
public/vo/words.json so the film's subtitles can follow the voice.

    uv run --no-project --with numpy python scripts/voiceover.py /path/to/words.json          # recorded takes
    uv run --no-project --with numpy python scripts/voiceover.py /path/to/words.json --el     # the ElevenLabs voice (scripts/elevenlabs.py)
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

SR, PAD, MAX_PAUSE = 48000, 0.12, 0.5
TAKES = {  # the take used for each part of the film
    'hook': 'hook', 'intro': 'intro', 'easy': 'would-be-easy', 'idea': 'app-tour-idea', 'change': 'app-tour-change',
    'see': 'app-tour-see-it', 'colors': 'app-tour-colors', 'steps': 'app-tour-steps', 'bowl': 'check-ins-bowl',
    'step': 'check-ins-canvas', 'hood': 'under-the-hood', 'back': 'callback',
}
root = Path(__file__).resolve().parent.parent
words = json.load(open(sys.argv[1]))
EL = '--el' in sys.argv
if EL:  # the generated sections are named after their text files, one per part
    TAKES = {**TAKES, 'change': 'app-tour-change', 'intro': 'intro', 'hood': 'under-the-hood'}
out = {}
for part, take in TAKES.items():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(root.parent / 'voiceover' / ('el' if EL else '') / f'{take}.{"wav" if EL else "opus"}'), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, np.float32)
    ws = words[take]
    # Runs of speech, split where a pause is longer than MAX_PAUSE.
    runs, cur = [], [ws[0]]
    for w in ws[1:]:
        if w[1] - cur[-1][2] > MAX_PAUSE: runs.append(cur); cur = [w]
        else: cur.append(w)
    runs.append(cur)
    pieces, mapped, t = [], [], 0.0
    for i, r in enumerate(runs):
        a, b = max(0, r[0][1] - PAD), min(len(audio) / SR, r[-1][2] + PAD + (0.25 if i == len(runs) - 1 else 0))
        seg = audio[int(a * SR):int(b * SR)]
        if pieces:  # the pause before this run: MAX_PAUSE less the padding both sides already keep
            gap = np.zeros(int(max(0, MAX_PAUSE - 2 * PAD) * SR), np.float32); pieces.append(gap); t += len(gap) / SR
        pieces.append(seg)
        mapped += [(w[0], round(t + w[1] - a, 3), round(t + w[2] - a, 3)) for w in r]
        t += len(seg) / SR
    joined = np.concatenate(pieces)
    # Trim the silence before the voice starts (the transcriber puts a first word at 0 when it can't tell).
    hop = int(0.01 * SR)
    rms = np.sqrt(np.convolve(joined ** 2, np.ones(hop) / hop, 'same'))[::hop]
    onset = max(0.0, int(np.argmax(rms > 0.08 * rms.max())) * 0.01 - 0.08)
    joined = joined[int(onset * SR):]
    t -= onset
    mapped = [(w, round(max(0.0, a - onset), 3), round(max(0.0, b - onset), 3)) for w, a, b in mapped]
    tmp = root / 'public' / 'vo' / f'{part}.raw.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', str(tmp)], input=joined.tobytes(), check=True)
    chain = 'highpass=f=80,afftdn=nf=-28'
    m = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(tmp), '-af', f'{chain},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    ln = f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-af', f'{chain},{ln}', '-ar', str(SR), str(root / 'public' / 'vo' / f'{part}.wav')], check=True)
    tmp.unlink()
    out[part] = {'take': take, 'length': round(t, 3), 'words': mapped}
    print(f'{part:7s} {take:22s} {len(ws) and ws[-1][2] - ws[0][1]:5.1f}s of speech -> {t:5.1f}s')
json.dump(out, open(root / 'public' / 'vo' / 'words.json', 'w'), indent=1)
