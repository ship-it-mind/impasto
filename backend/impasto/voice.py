"""Muse Voice Transcribe: a voice note → transcript.

Any audio ffmpeg can read is converted to the mono 16-bit 24 kHz WAV the
endpoint takes.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import wave
from pathlib import Path

import requests

from impasto.meta import BASE_URL, api_key

MODEL = "muse-voice-transcribe-1.0"
TRANSCRIBE_URL = f"{BASE_URL}/asr/transcribe"
NATIVE_RATES = (16000, 24000)
# Painting terms a client is likely to say. Day 1 got these right unbiased,
# but color names like "terracotta" or "ochre" are rarer words.
KEYWORDS = [
    "impasto", "palette knife", "canvas", "terracotta", "sage", "ochre",
    "umber", "sienna", "mauve", "taupe", "teal", "cream",
]


def is_native_wav(path: Path) -> bool:
    try:
        with wave.open(str(path), "rb") as wav:
            return (
                wav.getnchannels() == 1
                and wav.getsampwidth() == 2
                and wav.getframerate() in NATIVE_RATES
            )
    except (wave.Error, EOFError):
        return False


def to_native_wav(path: Path, folder: Path) -> Path:
    if is_native_wav(path):
        return path
    converted = folder / f"{path.stem}.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
         "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", str(converted)],
        check=True,
    )
    return converted


def transcribe(path: Path, keywords: list[str] = KEYWORDS) -> str:
    request = {"mode": "PUSH_TO_TALK", "model": MODEL, "audioEncoding": "WAV"}
    if keywords:
        request["keywords"] = keywords
    with tempfile.TemporaryDirectory() as tmp:
        wav = to_native_wav(path, Path(tmp))
        with wav.open("rb") as audio:
            response = requests.post(
                TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {api_key()}"},
                files={
                    # The params travel as a JSON part, not as form fields.
                    "request": (None, json.dumps(request), "application/json"),
                    "audio": (wav.name, audio),
                },
                timeout=300,
            )
    if response.status_code != 200:
        raise RuntimeError(f"Voice Transcribe [{response.status_code}] {response.text[:300]}")
    return response.json().get("transcript", "")
