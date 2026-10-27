"""Spike: how accurate and fast is Muse Voice Transcribe on a client voice note?

    uv run spikes/voice_transcribe.py spikes/inputs/brief.m4a \
        --expected spikes/inputs/brief.txt

Any audio ffmpeg can read is converted to the mono 16-bit 24 kHz WAV the
endpoint takes. --expected is the script the note was read from; with it the
spike reports word error rate. Writes spikes/output/voice/<audio>.json.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
import wave
from pathlib import Path

import requests

from common import BASE_URL, api_key, output_dir, require_file

MODEL = "muse-voice-transcribe-1.0"
TRANSCRIBE_URL = f"{BASE_URL}/asr/transcribe"
MODES = ("PUSH_TO_TALK", "ENDPOINTING", "DIARIZATION")
NATIVE_RATES = (16000, 24000)


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


def to_native_wav(path: Path, out: Path) -> Path:
    if is_native_wav(path):
        return path
    converted = out / f"{path.stem}.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
         "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", str(converted)],
        check=True,
    )
    return converted


def words(text: str) -> list[str]:
    return re.findall(r"[\w']+", text.lower())


def word_error_rate(reference: str, hypothesis: str) -> float:
    ref, hyp = words(reference), words(hypothesis)
    previous = list(range(len(hyp) + 1))
    for i, ref_word in enumerate(ref, 1):
        current = [i]
        for j, hyp_word in enumerate(hyp, 1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (ref_word != hyp_word),
                )
            )
        previous = current
    return previous[-1] / max(1, len(ref))


def transcribe(path: Path, mode: str, keywords: list[str]) -> dict:
    request = {"mode": mode, "model": MODEL, "audioEncoding": "WAV"}
    if keywords:
        request["keywords"] = keywords
    with path.open("rb") as audio:
        response = requests.post(
            TRANSCRIBE_URL,
            headers={"Authorization": f"Bearer {api_key()}"},
            files={
                # The params travel as a JSON part, not as form fields.
                "request": (None, json.dumps(request), "application/json"),
                "audio": (path.name, audio),
            },
            timeout=300,
        )
    if response.status_code != 200:
        raise RuntimeError(f"[{response.status_code}] {response.text[:300]}")
    return response.json()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--expected", type=Path, help="text the note was read from")
    parser.add_argument("--mode", default="PUSH_TO_TALK", choices=MODES)
    parser.add_argument(
        "--keywords",
        action="append",
        default=[],
        metavar="TERM",
        help="bias toward a term (e.g. impasto); repeat for several",
    )
    args = parser.parse_args()
    audio = require_file(args.audio)
    out = output_dir("voice")
    wav = to_native_wav(audio, out)

    started = time.perf_counter()
    result = transcribe(wav, args.mode, args.keywords)
    latency = time.perf_counter() - started

    transcript = result.get("transcript", "")
    duration = (result.get("audioDurationMs") or 0) / 1000
    summary = {
        "model": MODEL,
        "audio": str(audio),
        "mode": args.mode,
        "keywords": args.keywords,
        "audio_duration_s": duration,
        "latency_s": round(latency, 2),
        "transcript": transcript,
        "turns": result.get("turns"),
        "session_id": result.get("sessionId"),
    }
    if args.expected:
        expected = require_file(args.expected).read_text(encoding="utf-8")
        summary["expected"] = expected
        summary["word_error_rate"] = round(word_error_rate(expected, transcript), 3)

    path = out / f"{audio.stem}.json"
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(transcript)
    print(f"\n{duration:.1f}s of audio transcribed in {latency:.1f}s")
    if "word_error_rate" in summary:
        print(f"Word error rate: {summary['word_error_rate']:.1%}")
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
