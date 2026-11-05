# Impasto: the details

Everything the [README](README.md) leaves out: what each screen does, the model decisions, running and testing it, accounts, the example piece and deploying.

## What it does

1. **Brief → concepts** — what the painter wants to paint, typed or dictated, is structured into a brief, then turned into three concept compositions and a wall mockup at true scale. The compositions aren't picked from a list: Muse Spark takes them from the style pictures if there are any, and otherwise recommends what fits the brief. With a wall photo, Muse Spark recommends a size and where it hangs; the painter can type another size or move the painting's four corners on the photo. To paint an existing picture as it is, attach it and say so in the brief: SAM finds the painting in the photo so a plant or floor around it is left out, with its corners shown to redo by hand if they're off. Muse Image then cleans it, taking out anything still in front of the painting and the room's light on it, and its colors and shapes are measured off that version. A picture whose shape is too far from the canvas is refused, with a message to upload another or change the size. On the Concepts screen, the painting hangs on the wall in the size chosen, and a chat changes it: Muse Image repaints all of it, or only the segments tapped on it, and each answer is a version to keep or go back from. "Let's start painting" takes the version on show through the same steps below.
2. **Concept → recipe** — the chosen concept is segmented into color bands; each band's area becomes grams of paint and paste, with mixing ratios from common acrylic tubes. The app recommends tinted paste or paste underneath for this painting, from what each can actually mix, and lists the colors, paste and tools needed; ticking what you already have updates what's left to buy.
3. **How to paint it** — each stage in order, in Muse Spark's words, with a picture of how the canvas should look after it, cut from the concept along its band map.
4. **Check-ins** — optional sections that follow the steps of How to paint it, so they change with the paste method: tinted paste, or paste, drying, then paint. A photo of a step gets Muse Spark's look at it against how that step should look, and warns if paste hasn't had long enough to dry. Upload a photo of the paint in the bowl, say which color it should be, and it's found in the photo and measured against the recipe, corrected against anything white in the shot; if it's off, it says which tube to add and how much. A photo of the whole canvas reports coverage and color drift against the plan. A chat beside them answers questions about the painting from its plan and what the check-ins found.

## Day 1 decisions (Oct 27)

We tested each model on a photo of one of the artist's finished pieces before designing around it. Scripts are in `backend/spikes/`.

- **All four Meta models stay in.**
- **Band segmentation uses manual points.** SAM 3.1 returns clean masks that follow band edges and ignore knife texture, but only when it is given 2–3 points inside each band. Text prompts only worked for plain color words ("cream", "sage", "pink" returned nothing), and points picked by Muse Spark missed a band. The artist points at each band in the app. Fallback: color clustering inside SAM's canvas mask.
- **Muse Image always gets reference images.** From text alone it produced generic texture; with her past works as references it kept her composition and palette. It is the concept model for now, pending a comparison with other image models. The procedural SVG fallback is not needed yet.
- **Canvas rectification comes first.** It turns pixels into cm², and once photos are rectified, the points from the plan carry over to the progress check-in photos.
- **Cut or deferred:** Spark-picked points (cut), the wall mockup (if time allows), relief estimation (stretch only).

## Run it

Needs [uv](https://docs.astral.sh/uv/), Node 22+, and ffmpeg for dictation. Run on your own computer, nobody signs in: accounts are only for the hosted demo.

```sh
git clone https://github.com/ship-it-mind/impasto.git && cd impasto
make install
make example   # look through the example piece: no keys needed
```

Then open http://localhost:8000. That's the Python API, which also serves the web app: `make example` and `make run` build it first. The repo holds one real piece, recorded from the first brief to the last check-in, and `make example` opens straight at it. Every screen can be looked through, and nothing calls a model, even with a key in `.env`.

To start pieces of your own, you need a Meta Model API key:

```sh
cp .env.example .env   # then fill in MODEL_API_KEY
make run               # http://localhost:8000
make dev               # the same, reloading as you edit: http://localhost:5173
make test              # the backend tests, with no keys and a throwaway database
```

`make run` and `make dev` keep everything you make in `backend/output/impasto.db`, with the example piece listed first. If port 8000 is taken, put another before any of them, like `PORT=8001 make example`.

### Model spikes

One script per model in `backend/spikes/`, run from `backend/`. Put inputs in `backend/spikes/inputs/`; results land in `backend/spikes/output/`. Both folders are git-ignored.

```sh
uv run spikes/spark_bands.py spikes/inputs/painting.jpg
uv run spikes/sam_bands.py spikes/inputs/painting.jpg --concept "teal paint band" --concept "white paint band"
uv run spikes/image_concept.py --name with-refs --reference spikes/inputs/past/01.jpg
uv run spikes/voice_transcribe.py spikes/inputs/brief.m4a --expected spikes/inputs/brief.txt
```

### Web app

`make dev` runs the API on port 8000 (or `PORT`) and the web app's dev server beside it, which sends `/api` there.

Pieces, with their pictures, are kept in `backend/output/impasto.db`, a SQLite file (git-ignored). On first start it imports any older pieces from `backend/output/api/`.

### Accounts and the private demo

Model calls cost money, so the app is invite-only. Everyone signs in with an email and password, and each account only sees its own pieces.

- **Invite code.** Signing up takes the code in `IMPASTO_INVITE_CODE` in `.env`. With none set, nobody can sign up. Keep it out of the repo. A link like `https://your-host/?invite=CODE` opens sign-up with the code filled in.
- **Existing pieces.** The first account to sign up gets every piece made before accounts existed, so create yours before sharing the code.
- **Behind a proxy.** Sign-up and sign-in attempts are limited per client address, so run uvicorn with `--proxy-headers --forwarded-allow-ips <proxy address>` (the `Dockerfile` does). Otherwise all visitors count as one client and an outsider's guesses can block sign-ups for up to an hour.
- **On one computer, no accounts.** The Makefile sets `IMPASTO_MODE`. With `example`, every visitor is a guest who can only look through the example piece, and anything that would start a piece or call a model is refused. With `local`, every visitor is one local user who owns everything made there, and only requests from that computer are answered. Left unset, as on the hosted demo, everyone signs in. The exception is a copy with neither `MODEL_API_KEY` nor `IMPASTO_INVITE_CODE`, which is example only.
- **Not built.** There's no password reset or email verification, because the app doesn't send email.

### The example piece

Judges don't have a wall to photograph or a canvas in progress, so the app shows one real piece, recorded from the first brief to the last check-in. It's kept in the repo, in [`example/`](example/), and loaded into the database on start, so it shows locally too, with no database to copy and no model key. To put a piece there, download it signed in as its owner from `/api/pieces/PIECE_ID/export` (the id is the `piece=` in its address) and run `uv run python -m impasto.example unpack piece.zip` from `backend/`. `IMPASTO_EXAMPLE_PIECE` overrides it with another piece in the database. Every account sees the example first in the list. It opens at its brief, and every screen can be looked through. Nobody can change it, its owner included, and it never calls a model: whatever would make something new is turned off in the app and refused by the API.

It only holds what was done while it was painted, so in that run:

- read the brief with a wall photo, and use references;
- change a concept in the chat at least once, then press "Make it look real" on the wall. Don't move the painting after that, or the photo is dropped;
- make the recipes, and open How to paint it;
- check the steps with photos, check a mix or two, and do a whole-canvas check-in;
- ask the chat a question or two.

### Deploying

The `Dockerfile` at the repo root builds the whole app as one service: the API serves the web build on port 8000, with Node and ffmpeg alongside it for the renderers and dictation. Any host that builds a Dockerfile works. The demo runs on Coolify.

- **Keep `/data`.** The database, with every account and picture, is `/data/impasto.db`. Mount a persistent volume there, or a redeploy wipes it.
- **Set `MODEL_API_KEY` and `IMPASTO_INVITE_CODE`** as environment variables on the host.
- **One instance, one process.** Jobs and sign-in limits are in memory, and a restart ends any running job. The volume must be a local disk, because SQLite's WAL mode doesn't work over a network filesystem.
- **Don't publish port 8000 on the host.** The container trusts forwarded headers from whoever connects, so only the reverse proxy should reach it. The proxy must set `X-Forwarded-Proto`, and must terminate HTTPS.
- **Back up** with `sqlite3 /data/impasto.db ".backup /data/backup.db"`. A plain copy can miss recent writes.

Tests use a throwaway database and no model keys:

```sh
make test
```
