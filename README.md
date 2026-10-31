# Impasto Studio Co-pilot

A studio co-pilot for palette-knife / impasto artists, built for the Meta Global AI Developer Hackathon (Indie Developer track, theme: *Build for Your World*).

## What it does

1. **Brief → concepts** — the client's request, typed or dictated, is structured into a brief, then turned into three concept compositions and a wall mockup at true scale. With a wall photo, Muse Spark recommends a size and where it hangs; the painter can type another size or move the painting's four corners on the photo. To paint an existing picture as it is, attach it as the exact picture instead: its colors and shapes are measured off it, with its corners marked if the photo shows more than the painting, and no image is generated. A picture whose shape is too far from the canvas is refused, with a message to upload another or change the size. On the Concepts screen, the painting hangs on the wall in the size chosen, and a chat changes it: Muse Image repaints all of it, or only an area selected on it, and each answer is a version to keep or go back from. "Let's start painting" takes the version on show through the same steps below.
2. **Concept → recipe** — the chosen concept is segmented into color bands; each band's area becomes grams of paint and paste, with mixing ratios from common acrylic tubes. The app recommends tinted paste or paste underneath for this painting, from what each can actually mix, and lists the colors, paste and tools needed; ticking what you already have updates what's left to buy.
3. **How to paint it** — each stage in order, in Muse Spark's words, with a picture of how the canvas should look after it, cut from the concept along its band map.
4. **Progress check-ins** — a mid-way photo of the canvas reports coverage, color drift against the plan, and paste shortfalls.

## Built during the hackathon

All code in this repository was written during the hackathon (Oct 26 – Nov 4, 2026). The commit history is the record.

### Day 1 decisions (Oct 27)

We tested each model on a photo of one of the artist's finished pieces before designing around it. Scripts are in `backend/spikes/`.

- **All four Meta models stay in.**
- **Band segmentation uses manual points.** SAM 3.1 returns clean masks that follow band edges and ignore knife texture, but only when it is given 2–3 points inside each band. Text prompts only worked for plain color words ("cream", "sage", "pink" returned nothing), and points picked by Muse Spark missed a band. The artist points at each band in the app. Fallback: color clustering inside SAM's canvas mask.
- **Muse Image always gets reference images.** From text alone it produced generic texture; with her past works as references it kept her composition and palette. It is the concept model for now, pending a comparison with other image models. The procedural SVG fallback is not needed yet.
- **Canvas rectification comes first.** It turns pixels into cm², and once photos are rectified, the points from the plan carry over to the progress check-in photos.
- **Cut or deferred:** Spark-picked points (cut), the wall mockup (if time allows), relief estimation (stretch only).

## Meta models used

| Model | Job in the app |
|---|---|
| Muse Spark | Reads band structure from a painting, names the colors measured off an exact picture, turns the client's request into a structured brief, writes mixing recipes and the step-by-step painting guide |
| SAM 3.1 | One mask per color band from the artist's points, for area per band; finds the canvas corners in check-in photos |
| Muse Image | Paints each concept from Spark's band spec, steered by the user's reference photos when given; its painting is what the app shows for the concept, and the band layout read off it drives the recipe's band areas and the check-ins |
| Muse Voice Transcribe | Turns dictation into text in the brief box, to check and edit before the brief is read |

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

### Web app

Needs Node 22+ and ffmpeg (for dictation). Run the API and the web app side by side:

```sh
cd backend && uv run uvicorn impasto.api:app --port 8000
cd web && npm install && npm run dev   # http://localhost:5173, proxies /api to :8000
```

Pieces, with their pictures, are kept in `backend/output/impasto.db`, a SQLite file (git-ignored). On first start it imports any older pieces from `backend/output/api/`.

## Credits

- Paint mixing is predicted with [Mixbox](https://github.com/scrtwpns/mixbox) by Šárka Sochorová and Ondřej Jamriška (Secret Weapons), licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) for non-commercial use.
- The SAM stream adapter is adapted from Meta's [meta-model-cookbook](https://github.com/meta-models/meta-model-cookbook) (MIT).

## Team

_TODO_
