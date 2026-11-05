"""The voiceover in the user's cloned ElevenLabs voice, one line at a time, so each can be redone or re-paced.

Reads the key from ~/.config/elevenlabs/key (never from the repo). Each line is cached in
demo/voiceover/el/ (git-ignored), so running again only makes lines that changed or were deleted.
Then each section's lines are joined with a short pause into demo/voiceover/el/<section>.wav, which
scripts/voiceover.py treats like a recorded take.

    uv run --no-project --with requests python scripts/elevenlabs.py            # make what's missing
    uv run --no-project --with requests python scripts/elevenlabs.py intro:2   # redo one line
"""
import hashlib, json, subprocess, sys, time
from pathlib import Path

import requests

VOICE = 'NhYAwE75KjPavWcOGOQC'
MODEL = 'eleven_v4'
SETTINGS = {'stability': 0.5, 'similarity_boost': 0.8, 'style': 0.15, 'use_speaker_boost': True, 'speed': 1.0}
PAUSE = 0.35  # between lines in a section
# What is said, per section. Spelled for the ear where it matters ("SAM three point one");
# the subtitles keep the written forms.
LINES = {
    'hook': ['Every painting starts in your head.', 'Getting it onto the canvas is the hard part.'],
    'intro': ["Hi, I'm Sultan. I've been building Impasto, a co-pilot for painters, to help my wife, Yara.",
              "About a year ago, Yara started painting, and it's become the thing she loves most.",
              'She paints impasto: thick paint, laid on with a knife, so it stands up off the canvas.',
              'Every color is mixed by hand.'],
    'would-be-easy': ['I thought AI could do this easily.', 'I was wrong.',
                      'Ask it to paint her idea: generic texture, nothing like hers.',
                      'Ask it to find "sage" or "cream" in her painting: nothing.',
                      "Every ridge's shadow changes the color.", "So Impasto doesn't guess. It measures."],
    'app-tour-idea': ["Here's how it works. It starts with the idea. Yara says it out loud: this wall, and a painting she loves.",
                      'Impasto turns what she said into a brief, and sizes the canvas to the wall.'],
    'app-tour-change': ["She talks to it to change what she doesn't like, the whole thing or one part."],
    'app-tour-see-it': ['Then she sees it on her wall, at its real size.'],
    'app-tour-colors': ['Then the colors: every one she needs, how much to make, and how to mix it from the tubes she has.'],
    'app-tour-steps': ['Then the steps: every stage in order, with a picture of how the canvas should look after it.'],
    'check-ins-bowl': ['And she checks in: a photo of her mix, measured against the recipe.', "Too dark, and here's the fix."],
    'check-ins-canvas': ['A photo of the canvas is compared with how that step should look.', 'Burgundy needs work. Dusty Rose is on track.'],
    'under-the-hood': ['Underneath, four Meta models.', 'Muse Voice Transcribe hears the idea.',
                       'Muse Spark plans it, from the brief to every step.',
                       'SAM three point one finds the painting, and the canvas in every photo.',
                       'Muse Image cleans it, and repaints what she changes.',
                       'The rest, Impasto measures itself: areas into grams, colors into mixes.'],
    'callback': ['It started as a picture she loved and an empty wall.', "Now it's real."],
}
OUT = Path(__file__).resolve().parents[2] / 'voiceover' / 'el'
OUT.mkdir(parents=True, exist_ok=True)
key = (Path.home() / '.config' / 'elevenlabs' / 'key').read_text().strip()
redo = {tuple(a.split(':')) for a in sys.argv[1:]}

for section, lines in LINES.items():
    files = []
    for i, text in enumerate(lines, 1):
        # The line, and its neighbours for natural flow; the cache key changes if any of them changes.
        prev, nxt = ' '.join(lines[:i - 1])[-300:], ' '.join(lines[i:])[:300]
        tag = hashlib.sha1(json.dumps([VOICE, MODEL, SETTINGS, text, prev, nxt]).encode()).hexdigest()[:8]
        path = OUT / f'{section}-{i}-{tag}.mp3'
        if (section, str(i)) in redo:
            for old in OUT.glob(f'{section}-{i}-*.mp3'): old.unlink()
        if not path.exists():
            for old in OUT.glob(f'{section}-{i}-*.mp3'): old.unlink()
            for attempt in range(4):  # the connection sometimes drops; a retry is free, only a finished line costs
                try:
                    r = requests.post(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}', params={'output_format': 'mp3_44100_128'},
                                      headers={'xi-api-key': key, 'Content-Type': 'application/json'},
                                      json={'text': text, 'model_id': MODEL, 'voice_settings': SETTINGS, 'previous_text': prev or None, 'next_text': nxt or None}, timeout=120)
                    break
                except requests.exceptions.ConnectionError:
                    if attempt == 3: raise
                    time.sleep(3 * (attempt + 1))
            if r.status_code != 200:
                sys.exit(f'{section}:{i} failed: {r.status_code} {r.text[:300]}')
            path.write_bytes(r.content)
            print(f'made  {section}:{i}  {text}')
        files.append(path)
    # Join the section's lines, with a short pause between them.
    inputs, chain = [], ''
    for j, f in enumerate(files):
        inputs += ['-i', str(f)]
        chain += f'[{j}:a]aresample=48000,pan=mono|c0=c0' + (f',apad=pad_dur={PAUSE}' if j < len(files) - 1 else '') + f'[a{j}];'
    chain += ''.join(f'[a{j}]' for j in range(len(files))) + f'concat=n={len(files)}:v=0:a=1[out]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', chain, '-map', '[out]', str(OUT / f'{section}.wav')], check=True)
print('sections joined in', OUT)
