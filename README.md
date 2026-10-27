# Impasto Studio Co-pilot

A studio co-pilot for palette-knife / impasto artists, built for the Meta Global AI Developer Hackathon (Indie Developer track, theme: *Build for Your World*).

## What it does

1. **Brief → concepts** — a client voice note is transcribed and structured into a brief, then turned into three concept compositions and a wall mockup at true scale.
2. **Concept → recipe** — the chosen concept is segmented into color bands; each band's area becomes grams of paint and paste, with mixing ratios from the artist's own tubes.
3. **Progress check-ins** — a mid-way photo of the canvas reports coverage, color drift against the plan, and paste shortfalls.

## Built during the hackathon

All code in this repository was written during the hackathon (Oct 26 – Nov 4, 2026). The commit history is the record.

_TODO: scope decisions from the Day 1 go/no-go._

## Meta models used

| Model | Job in the app |
|---|---|
| Muse Spark | _TODO_ |
| SAM 3.1 | _TODO_ |
| Muse Image | _TODO_ |
| Muse Voice Transcribe | _TODO_ |

## Setup

Requires [uv](https://docs.astral.sh/uv/) and a Meta Model API key.

```sh
cp .env.example .env   # then fill in MODEL_API_KEY
cd backend && uv sync
```

### Model spikes

One script per model in `backend/spikes/`, run from `backend/`. Put inputs in `backend/spikes/inputs/`; results land in `backend/spikes/output/`. Both folders are git-ignored.

```sh
uv run spikes/spark_bands.py spikes/inputs/painting.jpg
uv run spikes/sam_bands.py spikes/inputs/painting.jpg --concept "teal paint band" --concept "white paint band"
uv run spikes/image_concept.py --name with-refs --reference spikes/inputs/past/01.jpg
uv run spikes/voice_transcribe.py spikes/inputs/brief.m4a --expected spikes/inputs/brief.txt
```

_TODO: web app run instructions._

## Team

_TODO_
