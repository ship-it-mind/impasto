"""HTTP API for the web app: brief → concepts → recipe → check-ins, wrapping the pipeline modules.

    uv run uvicorn impasto.api:app --port 8000

Model calls take 5–30 s, so they run as background jobs: a POST returns a job
id, and the web app polls GET /api/jobs/{id} for the phase and the result.
Pieces live in SQLite (impasto.store); jobs only in memory. Nothing is kept per user.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import math
import mimetypes
import re
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Callable, Iterator

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Query, Response, UploadFile
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from pydantic import BaseModel

from impasto import brief as briefs
from impasto import checkin as checkins
from impasto import coach
from impasto import concepts
from impasto import edits
from impasto import exact as exact_pictures
from impasto import guide as guides
from impasto import method
from impasto import mix_check
from impasto import store
from impasto import wall as walls
from impasto.color import rgb_to_hex
from impasto.mixing import PLACEHOLDER_INVENTORY, Mixer, without
from impasto.presets import DEFAULT_PRESET, PRESETS
from impasto.recipe_cards import band_brief, write_cards
from impasto.tools import tools_for
from impasto.voice import transcribe
from impasto.volume import Materials, estimate

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_REFERENCES = 6
# Wall photos and style pictures go to the models as base64 and load in the browser, so big ones are slow.
MAX_PHOTO_SIDE = 2048
MAX_PHOTO_BYTES = 3 * 1024 * 1024
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
MIN_PIECE_CM, MAX_PIECE_CM = 5, 2000
BRIEF_ID = re.compile(r"^[0-9a-f]{32}$")
RUN_ID = re.compile(r"^concepts-[0-9a-f]{8}$")
CHECKIN_ID = re.compile(r"^\d{8}T\d{6}Z-[0-9a-f]{4}$")
CHECKIN_IMAGES = {"progress.png", "rectified.png"}
# A stored picture never changes, so the browser needn't fetch it again.
CACHE_FOREVER = {"Cache-Control": "public, max-age=31536000, immutable"}
CONCEPT_FILE = re.compile(r"^concept-\d+-(muse|exact|edit|layout)\.png$")
MAX_EDIT_CHARS = 1000
MAX_QUESTION_CHARS = 1000
CHECK_IMAGES = {"photo.jpg"}

log = logging.getLogger("impasto.api")
app = FastAPI(title="Impasto")
pool = ThreadPoolExecutor(max_workers=4)
jobs: dict[str, dict] = {}
# What's being worked on right now, so asking again joins the job instead of paying for a second one.
running: dict[str, str] = {}
running_lock = threading.Lock()

register_heif_opener()
store.init()


# --- Jobs --------------------------------------------------------------------

def start(work: Callable[[Callable[[str], None]], dict], key: str | None = None) -> dict:
    with running_lock:
        if key in running:
            return {"job": running[key]}
        job_id = uuid.uuid4().hex
        jobs[job_id] = {"status": "running", "phase": "Starting…", "result": None, "error": None}
        if key:
            running[key] = job_id

    def run() -> None:
        job = jobs[job_id]
        try:
            job["result"] = work(lambda phase: job.update(phase=phase))
            job["status"] = "done"
        except Exception as error:  # noqa: BLE001 - the web app gets a message, the log gets the trace
            log.exception("Job %s failed", job_id)
            job["status"], job["error"] = "failed", str(error)[:300]
        finally:
            with running_lock:
                running.pop(key, None)

    pool.submit(run)
    return {"job": job_id}


def finished(result: dict) -> dict:
    """A job that's already done, for an answer that's already stored."""
    job_id = uuid.uuid4().hex
    jobs[job_id] = {"status": "done", "phase": "Done", "result": result, "error": None}
    return {"job": job_id}


@app.get("/api/jobs/{job_id}")
def job_state(job_id: str) -> dict:
    if job_id not in jobs:
        raise HTTPException(404, "No such job.")
    return jobs[job_id]


# --- Uploads -----------------------------------------------------------------

def read_upload(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"{upload.filename} is over 25 MB.")
    return data


def to_jpeg(image: Image.Image, max_side: int | None = None) -> bytes:
    """An upright sRGB JPEG. iPhones shoot in Display P3, and the color work reads pixels as sRGB."""
    image = ImageOps.exif_transpose(image)
    if max_side:
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    profile = image.info.get("icc_profile")
    rgb = image.convert("RGB")
    if profile:
        try:
            rgb = ImageCms.profileToProfile(rgb, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile("sRGB"), outputMode="RGB")
        except ImageCms.PyCMSError:
            log.warning("Skipped a color profile that can't be applied to RGB")
    out = io.BytesIO()
    rgb.save(out, "JPEG", quality=90 if max_side else 95)
    return out.getvalue()


def read_image(upload: UploadFile, name: str, shrink: bool = False) -> tuple[str, bytes]:
    """A picture's stored name and bytes. With shrink, a big one is kept smaller; check-in photos stay as taken, since taps are in their pixels."""
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in IMAGE_SUFFIXES:
        raise HTTPException(415, f"{upload.filename}: use a JPG, PNG, WebP or HEIC photo.")
    data = read_upload(upload)
    if shrink:
        try:
            image = Image.open(io.BytesIO(data))
            if max(image.size) > MAX_PHOTO_SIDE or len(data) > MAX_PHOTO_BYTES:
                data, suffix = to_jpeg(image, MAX_PHOTO_SIDE), ".jpg"
        except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError) as error:
            raise HTTPException(415, f"{upload.filename}: couldn't read this picture.") from error
    return f"{name}{suffix}", data


@contextmanager
def scratch(images: dict[str, bytes]) -> Iterator[Path]:
    """The pipeline modules work on files, so a job gets a throwaway folder; what it keeps goes in the database."""
    with tempfile.TemporaryDirectory() as folder:
        for name, data in images.items():
            (Path(folder) / name).write_bytes(data)
        yield Path(folder)


def stored_image(owner: str, name: str) -> Response:
    data = store.image(owner, name)
    if data is None:
        raise HTTPException(404, "No such image.")
    return Response(data, media_type=mimetypes.guess_type(name)[0], headers=CACHE_FOREVER)


@app.post("/api/images/heic")
def convert_heic(photo: Annotated[UploadFile, File()]) -> Response:
    """Browsers can't show HEIC, so the web app swaps one for this JPEG as soon as it's picked."""
    try:
        return Response(to_jpeg(Image.open(io.BytesIO(read_upload(photo)))), media_type="image/jpeg")
    except (UnidentifiedImageError, ValueError, OSError) as error:
        raise HTTPException(415, f"{photo.filename}: couldn't read this HEIC photo.") from error


def piece_or_404(brief_id: str) -> dict:
    piece = store.piece(brief_id) if BRIEF_ID.match(brief_id) else None
    if piece is None:
        raise HTTPException(404, "No such brief. Read the brief again.")
    return piece


def run_or_404(brief_id: str, run: str) -> dict:
    piece_or_404(brief_id)
    drafted = store.run(brief_id, run) if RUN_ID.match(run) else None
    if drafted is None:
        raise HTTPException(404, "No such set of concepts. Make them again.")
    return drafted


# --- Presets and tubes -------------------------------------------------------

@app.get("/api/presets")
def presets() -> dict:
    return {
        "default": DEFAULT_PRESET,
        "presets": [
            {"key": key, "name": p["name"], "flows": p["flows"], "bands": list(p["bands"]), "relief": p["relief"],
             "palette": [{"name": n, "hex": h} for n, h in p["fallback_palette"]]}
            for key, p in PRESETS.items()
        ],
        "tubes": [tube["name"] for tube in PLACEHOLDER_INVENTORY["tubes"]],
    }


# --- Brief -------------------------------------------------------------------

def read(brief_id: str, record: dict, wall: dict[str, bytes], phase: Callable[[str], None]) -> dict:
    phase("Reading the brief and the wall photo…" if wall else "Reading the brief…")
    with scratch(wall) as folder:
        record["brief"] = briefs.structure(record["transcript"], folder / record["wall_photo"] if wall else None, record["answers"])
    record["warnings"] = briefs.warnings(record["brief"])
    store.save_piece(brief_id, record, wall)
    if fit := record["brief"].get("wall_fit"):
        store.save_mockup(brief_id, walls.from_fit(fit, record["brief"]["piece"], photo_size(wall[record["wall_photo"]])))
    return brief_view(record, brief_id)


def photo_size(data: bytes) -> tuple[int, int]:
    """A photo's width and height as seen, turned upright as a browser shows it."""
    with Image.open(io.BytesIO(data)) as image:
        return ImageOps.exif_transpose(image).size


def brief_view(record: dict, brief_id: str) -> dict:
    """A read brief as the web app gets it, with its wall photo as a URL."""
    return {
        "id": brief_id, "transcript": record["transcript"], "brief": record["brief"], "warnings": record["warnings"],
        "wall": f"/api/pieces/{brief_id}/wall" if record.get("wall_photo") else None,
    }


@app.post("/api/transcribe")
def new_transcript(audio: Annotated[UploadFile, File()]) -> dict:
    """Dictation: speech to text for the brief box, to check and edit before the brief is read."""
    if not (audio.content_type or "").startswith(("audio/", "video/")):
        raise HTTPException(415, f"{audio.filename}: that doesn't look like audio.")
    data = read_upload(audio)
    suffix = Path(audio.filename or "").suffix.lower() or ".bin"

    def work(phase: Callable[[str], None]) -> dict:
        phase("Transcribing…")
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / f"dictation{suffix}"
            path.write_bytes(data)
            return {"transcript": transcribe(path)}

    return start(work)


@app.post("/api/brief")
def new_brief(
    text: Annotated[str, Form(max_length=5000)] = "",
    wall: Annotated[UploadFile | None, File()] = None,
) -> dict:
    if not text.strip():
        raise HTTPException(422, "Type or dictate the client's brief first.")
    brief_id = uuid.uuid4().hex
    photo = read_image(wall, "wall", shrink=True) if wall else None
    record = {"source": "web", "transcript": text.strip(), "wall_photo": photo[0] if photo else None, "answers": []}
    return start(lambda phase: read(brief_id, record, dict([photo]) if photo else {}, phase))


# --- Concepts ----------------------------------------------------------------

def settled(record: dict, width_cm: float | None, height_cm: float | None) -> dict:
    """The piece's record at the size the painter settled on. It's kept once the concepts are made: until then, the concepts on show keep theirs."""
    if width_cm is None or height_cm is None:
        width_cm, height_cm = record["brief"]["piece"]["width_cm"], record["brief"]["piece"]["height_cm"]
    if not (width_cm and height_cm):
        raise HTTPException(422, "Give the piece's width and height first.")
    if not (MIN_PIECE_CM <= width_cm <= MAX_PIECE_CM and MIN_PIECE_CM <= height_cm <= MAX_PIECE_CM):
        raise HTTPException(422, f"Give the width and height in cm, between {MIN_PIECE_CM} and {MAX_PIECE_CM}.")
    brief = briefs.set_size(record["brief"], width_cm, height_cm)
    return {**record, "brief": brief, "warnings": briefs.warnings(brief)}


def parsed_mockup(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        mockup = Mockup.model_validate_json(value)
    except ValueError as error:
        raise HTTPException(422, "Couldn't read where the piece hangs on the wall.") from error
    return checked_mockup(mockup)


def keep_size(brief_id: str, record: dict, mockup: dict | None) -> None:
    store.save_piece(brief_id, record, {})
    if mockup:
        store.save_mockup(brief_id, mockup)


@app.post("/api/concepts")
def new_concepts(
    brief_id: Annotated[str, Form()],
    references: Annotated[list[UploadFile], File()] = [],  # noqa: B006 - FastAPI copies defaults
    without_tubes: Annotated[list[str], Form(alias="without")] = [],  # noqa: B006
    paste_in_mix: Annotated[bool, Form()] = False,
    exact: Annotated[UploadFile | None, File()] = None,
    corners: Annotated[list[str], Form()] = [],  # noqa: B006
    width_cm: Annotated[float | None, Form()] = None,
    height_cm: Annotated[float | None, Form()] = None,
    mockup: Annotated[str | None, Form()] = None,
) -> dict:
    record = settled(piece_or_404(brief_id)["record"], width_cm, height_cm)
    wall_mockup = parsed_mockup(mockup)
    if len(references) > MAX_REFERENCES:
        raise HTTPException(422, f"Up to {MAX_REFERENCES} style pictures.")
    if exact and references:
        raise HTTPException(422, "Give an exact picture or style pictures, not both.")
    if corners and (not exact or len(corners) != 4):
        raise HTTPException(422, "Tap all 4 corners of the painting in the exact picture, or none to use all of it.")
    try:
        without(PLACEHOLDER_INVENTORY, without_tubes)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    run = f"concepts-{uuid.uuid4().hex[:8]}"
    if exact:
        picture = exact_picture(exact)
        corners_px = [point(c, "corner") for c in corners]
        width, height = photo_size(picture)
        ratio = exact_pictures.corners_ratio(corners_px) if corners_px else width / height
        piece = record["brief"]["piece"]
        if problem := exact_pictures.shape_problem(ratio, piece["width_cm"], piece["height_cm"]):
            raise HTTPException(422, problem)
        return start(exact_work(brief_id, run, record, wall_mockup, picture, corners_px, without_tubes, paste_in_mix), key=concepts_key(brief_id))
    refs = dict(read_image(upload, f"reference-{i + 1}", shrink=True) for i, upload in enumerate(references))

    def work(phase: Callable[[str], None]) -> dict:
        with scratch(refs) as folder:
            paths = [folder / name for name in refs]
            phase("Drafting 3 concepts…")
            drafted = concepts.draft(record["brief"], None, paths)  # no pictures: the default preset
            drafted["style"]["references"] = list(refs)
            phase("Mixing each band from the tubes on hand…")
            concepts.mix(drafted, without_tubes, paste_in_mix)
            phase("Painting each concept with Muse Image…")
            concepts.paint(drafted, folder, paths)
            keep_size(brief_id, record, wall_mockup)
            store.save_run(brief_id, run, drafted, {path.name: path.read_bytes() for path in folder.iterdir()})
        return {**run_view(drafted, brief_id, run), "brief": brief_view(record, brief_id)}

    return start(work, key=concepts_key(brief_id))


def exact_picture(upload: UploadFile) -> bytes:
    """An upright sRGB JPEG, so the colors read off it are the ones seen and tapped corners land where they were tapped."""
    _, data = read_image(upload, "exact")
    try:
        return to_jpeg(Image.open(io.BytesIO(data)))
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(415, f"{upload.filename}: couldn't read this picture.") from error


def exact_work(
    brief_id: str, run: str, record: dict, wall_mockup: dict | None, picture: bytes, corners: list[tuple[float, float]], without_tubes: list[str], paste_in_mix: bool,
) -> Callable[[Callable[[str], None]], dict]:
    """The one concept an exact picture gives: no drafting and no painting, so one Spark call and no Muse Image."""

    def work(phase: Callable[[str], None]) -> dict:
        with scratch({"exact.jpg": picture}) as folder:
            phase("Reading the colors off the picture…")
            drafted = exact_pictures.draft(record["brief"], folder / "exact.jpg", folder, corners or None)
            phase("Mixing each color from the tubes on hand…")
            concepts.mix(drafted, without_tubes, paste_in_mix)
            keep_size(brief_id, record, wall_mockup)
            store.save_run(brief_id, run, drafted, {path.name: path.read_bytes() for path in folder.iterdir()})
        return {**run_view(drafted, brief_id, run), "brief": brief_view(record, brief_id)}

    return work


def concepts_key(brief_id: str) -> str:
    return f"concepts:{brief_id}"


def run_view(drafted: dict, brief_id: str, run: str) -> dict:
    return {
        "run": run,
        **{key: drafted[key] for key in ("style", "canvas_px", "mixing")},
        "concepts": [concept_view(c, brief_id, run) for c in drafted["concepts"]],
    }


def concept_view(concept: dict, brief_id: str, run: str) -> dict:
    """A concept as the web app gets it: its Muse layout as URLs, without the prompt."""
    if "layout" not in concept:
        return concept
    base = f"/api/concepts/{brief_id}/{run}"
    layout = concept["layout"]
    return {**concept, "layout": {"image": f"{base}/{layout['image']}", "map": f"{base}/{layout['map']}", "shares": layout["shares"]}}


@app.get("/api/concepts/{brief_id}/{run}/{name}")
def concept_file(brief_id: str, run: str, name: str) -> Response:
    run_or_404(brief_id, run)
    if not CONCEPT_FILE.match(name):
        raise HTTPException(404, "No such image.")
    return stored_image(run, name)


class EditRequest(BaseModel):
    """What the painter asks to change. segments: the parts it's about, each by a point on it, as shares of the canvas (x, y)."""
    message: str
    segments: list[tuple[float, float]] = []


@app.post("/api/concepts/{brief_id}/{run}/{concept}/edit")
def edit_concept(brief_id: str, run: str, concept: int, body: EditRequest) -> dict:
    """The painter's change, as a new concept in the run. One edit at a time per run: asking again joins it."""
    drafted = run_or_404(brief_id, run)
    source = known_concept(drafted, concept)
    message = body.message.strip()
    if not message:
        raise HTTPException(422, "Say what to change first.")
    if len(message) > MAX_EDIT_CHARS:
        raise HTTPException(422, f"Keep it under {MAX_EDIT_CHARS} characters.")
    if "layout" not in source:
        raise HTTPException(409, "This concept has only a drawn preview, so there's no painting to change. Pick another, or make new ones.")
    if not all(0 <= x <= 1 and 0 <= y <= 1 for x, y in body.segments):
        raise HTTPException(422, "Select the segments again.")
    painting = cv2.imdecode(np.frombuffer(store.image(run, source["layout"]["image"]), np.uint8), cv2.IMREAD_COLOR)
    # Red is the band: impasto.layout writes the map that way, and OpenCV reads BGR.
    bands = cv2.imdecode(np.frombuffer(store.image(run, source["layout"]["map"]), np.uint8), cv2.IMREAD_COLOR)[..., 2] if body.segments else None
    size = tuple(drafted["canvas_px"])
    mixing = drafted["mixing"]

    def work(phase: Callable[[str], None]) -> dict:
        # Read again here: an edit that just finished has added to the run.
        number = len(store.run(brief_id, run)["concepts"]) + 1
        with scratch({}) as folder:
            phase("Muse Image is repainting it…")
            edited = edits.edit(source, concept, painting, size, message, body.segments, bands, number, folder)
            phase("Mixing each color from the tubes on hand…")
            concepts.mix({"concepts": [edited]}, mixing["without"], mixing["paste_in_mix"])
            index = store.add_concept(brief_id, run, edited, {path.name: path.read_bytes() for path in folder.iterdir()})
        return {"concept": concept_view(edited, brief_id, run), "index": index}

    return start(work, key=f"edit:{run}")


# --- Recipe ------------------------------------------------------------------

class RecipeRequest(BaseModel):
    brief_id: str
    run: str
    concept: int
    # Each band's share of the canvas, measured from the painted concept (sums to 1).
    shares: list[float]
    without: list[str] = []
    paste_in_mix: bool = False


class Choice(BaseModel):
    """A concept picked to paint, and the mixing settings picked for it; without settings, the ones it last used."""
    run: str
    concept: int
    without: list[str] | None = None
    paste_in_mix: bool = False


def known_concept(drafted: dict, concept: int) -> dict:
    if not 0 <= concept < len(drafted["concepts"]):
        raise HTTPException(422, "No such concept.")
    return drafted["concepts"][concept]


@app.put("/api/pieces/{brief_id}/choice")
def choose(brief_id: str, body: Choice) -> dict:
    """Keep the choice, and hand back the recipe already made for it, if any: then no model needs asking."""
    known_concept(run_or_404(brief_id, body.run), body.concept)
    store.choose(brief_id, body.concept)
    if body.without is None:
        return {"recipe": store.latest_recipe(body.run, body.concept)}
    return {"recipe": store.recipe(body.run, body.concept, body.without, body.paste_in_mix)}


def unique_names(names: list[str]) -> list[str]:
    """Spark's cards are matched by band name, so repeated names get a number."""
    seen: dict[str, int] = {}
    out = []
    for name in names:
        seen[name] = seen.get(name, 0) + 1
        out.append(name if seen[name] == 1 else f"{name} ({seen[name]})")
    return out


@app.post("/api/recipe")
def new_recipe(body: RecipeRequest) -> dict:
    drafted = run_or_404(body.brief_id, body.run)
    concept = known_concept(drafted, body.concept)
    if made := store.recipe(body.run, body.concept, body.without, body.paste_in_mix):
        return finished(made)
    piece = piece_or_404(body.brief_id)["record"]["brief"]["piece"]
    if not (piece["width_cm"] and piece["height_cm"]):
        raise HTTPException(409, "The brief has no piece size yet.")
    if len(body.shares) != len(concept["bands"]) or min(body.shares) < 0 or abs(sum(body.shares) - 1) > 0.02:
        raise HTTPException(422, "Band shares must match the bands and add up to the whole canvas.")
    try:
        inventory = without(PLACEHOLDER_INVENTORY, body.without)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error

    def work(phase: Callable[[str], None]) -> dict:
        materials = Materials()
        names = unique_names([band["name"] for band in concept["bands"]])
        area = piece["width_cm"] * piece["height_cm"]
        phase("Working out paint and paste per band…")
        est = estimate(
            [{"id": i, "name": name, "area_cm2": round(share * area, 1)} for i, (name, share) in enumerate(zip(names, body.shares))],
            {name: band["relief"] for name, band in zip(names, concept["bands"])},
            materials,
        )
        phase("Mixing each band from the tubes on hand…")
        mixer = Mixer(inventory, 1 - materials.paint_fraction if body.paste_in_mix else 0.0)
        recipes = []
        for name, band, grams in zip(names, concept["bands"], est.bands):
            de, combo, shares = mixer.recipe(band["hex"])
            parts_de, parts = mixer.best_parts(band["hex"], combo)
            lighten, darken = mixer.nudges(combo, shares)
            recipes.append({
                "band": name,
                "target_hex": band["hex"],
                "predicted_hex": rgb_to_hex(mixer.mix_rgb(combo, shares)),
                "delta_e": round(de, 2),
                "parts_delta_e": round(parts_de, 2),
                "tubes": [
                    {"name": mixer.names[i], "share": round(float(s), 2), "grams": round(float(s) * grams.paint_g), "parts": p}
                    for i, s, p in sorted(zip(combo, shares, parts), key=lambda item: -item[1])
                ],
                "paste_parts": mixer.paste_parts(sum(parts)),
                "paste_grams": round(grams.paste_g),
                "if_too_dark": lighten,
                "if_too_light": darken,
            })
        phase("Writing the recipe cards…")
        cards = write_cards([band_brief(r) for r in recipes])

        tube_g = materials.paint_tube_ml * materials.paint_density_g_cm3
        tub_g = materials.paste_tub_ml * materials.paste_density_g_cm3
        per_tube: dict[str, float] = {}
        for recipe in recipes:
            for tube in recipe["tubes"]:
                per_tube[tube["name"]] = per_tube.get(tube["name"], 0) + tube["grams"]
        paste_buy = est.paste_g * materials.buffer
        result = {
            "bands": [
                {"name": r["band"], "target_hex": r["target_hex"], "mix_hex": r["predicted_hex"], "delta_e": r["delta_e"],
                 "parts_delta_e": r["parts_delta_e"], "tubes": r["tubes"], "paste_parts": r["paste_parts"],
                 "area_cm2": g.area_cm2, "level": g.level,
                 "paint_g": g.paint_g, "paste_g": g.paste_g,
                 "card": {key: card[key] for key in ("recipe_line", "steps", "too_dark", "too_light", "warnings", "rematch")}}
                for r, g, card in zip(recipes, est.bands, cards)
            ],
            "totals": {"paint_g": est.paint_g, "paste_g": est.paste_g, "area_cm2": round(sum(g.area_cm2 for g in est.bands), 1)},
            "shopping": {
                "tubes": sorted(
                    ({"name": name, "grams": round(g), "buy_g": round(g * materials.buffer),
                      "tubes": math.ceil(g * materials.buffer / tube_g)} for name, g in per_tube.items()),
                    key=lambda t: -t["grams"],
                ),
                "paste": {"grams": round(est.paste_g), "buy_g": round(paste_buy), "tubs": math.ceil(paste_buy / tub_g)},
            },
            "materials": {"tube_ml": materials.paint_tube_ml, "tub_ml": materials.paste_tub_ml,
                          "buffer_pct": round((materials.buffer - 1) * 100), "waste_pct": round((materials.waste_factor - 1) * 100),
                          "calibrated": est.calibrated},
            "mixing": {"tubes": mixer.names, "without": body.without, "paste_in_mix": body.paste_in_mix},
        }
        store.save_recipe(body.brief_id, body.run, body.concept, body.without, body.paste_in_mix, result)
        return result

    return start(work, key=f"recipe:{body.run}:{body.concept}:{store.tubes_key(body.without)}:{body.paste_in_mix}")


@app.get("/api/pieces/{brief_id}/method")
def paste_method(
    brief_id: str,
    run: str,
    concept: int,
    without_tubes: Annotated[list[str], Query(alias="without")] = [],  # noqa: B006 - FastAPI copies defaults
) -> dict:
    """Paste mixed in or underneath, for this painting: the recommendation and what each way can mix."""
    bands = known_concept(run_or_404(brief_id, run), concept)["bands"]
    try:
        return method.advise(bands, without_tubes)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


# --- Supplies ----------------------------------------------------------------

class Have(BaseModel):
    qty: int
    size: float | None = None


class Supplies(BaseModel):
    """What the painter already has for this piece, by item: tube:NAME and paste as ml in size, tool:ID as qty and size."""
    have: dict[str, Have]


@app.get("/api/pieces/{brief_id}/supplies")
def get_supplies(brief_id: str, run: str, concept: int, paste_in_mix: bool = False) -> dict:
    """The tools this painting needs, what the painter already has, and what the app needs to work out what's left to buy."""
    drafted = known_concept(run_or_404(brief_id, run), concept)
    piece = piece_or_404(brief_id)["record"]["brief"]["piece"]
    if not (piece["width_cm"] and piece["height_cm"]):
        raise HTTPException(409, "The brief has no piece size yet.")
    materials = Materials()
    return {
        "tools": tools_for(piece["width_cm"], piece["height_cm"], drafted["flow"], [band["relief"] for band in drafted["bands"]], paste_in_mix),
        "have": store.supplies(brief_id),
        "density": {"paint": materials.paint_density_g_cm3, "paste": materials.paste_density_g_cm3},
    }


@app.put("/api/pieces/{brief_id}/supplies")
def save_supplies(brief_id: str, body: Supplies) -> dict:
    piece_or_404(brief_id)
    if any(item.qty < 1 or (item.size or 0) < 0 for item in body.have.values()):
        raise HTTPException(422, "Quantities start at 1 and sizes can't be negative; leave out what you don't have.")
    have = body.model_dump()["have"]
    store.save_supplies(brief_id, have)
    return {"have": have}


# --- Painting guide ----------------------------------------------------------

class GuideRequest(BaseModel):
    brief_id: str
    run: str
    concept: int
    without: list[str] = []
    paste_in_mix: bool = False


@app.post("/api/guide")
def new_guide(body: GuideRequest) -> dict:
    """How to paint the concept, for one recipe. A guide already written comes back as it was."""
    concept = known_concept(run_or_404(body.brief_id, body.run), body.concept)
    if made := store.guide(body.run, body.concept, body.without, body.paste_in_mix):
        return finished(made)
    recipe = store.recipe(body.run, body.concept, body.without, body.paste_in_mix)
    if recipe is None:
        raise HTTPException(409, "Make the recipes first.")
    piece = piece_or_404(body.brief_id)["record"]["brief"]["piece"]

    def work(phase: Callable[[str], None]) -> dict:
        phase("Writing how to paint it…")
        made = guides.write(concept, recipe, piece["width_cm"], piece["height_cm"])
        store.save_guide(body.brief_id, body.run, body.concept, body.without, body.paste_in_mix, made)
        return made

    return start(work, key=f"guide:{body.run}:{body.concept}:{store.tubes_key(body.without)}:{body.paste_in_mix}")


# --- Pieces ------------------------------------------------------------------

@app.get("/api/pieces")
def list_pieces() -> dict:
    """Every piece read so far, latest first: enough to pick one to reopen."""
    pieces = []
    for piece in store.pieces():
        run, chosen = piece["run"], piece["chosen"]
        concept = None
        if run is not None and chosen is not None:
            view = concept_view(store.run(piece["id"], run)["concepts"][chosen], piece["id"], run)
            concept = {"title": view["title"], "image": view.get("layout", {}).get("image"),
                       "recipe": store.latest_recipe(run, chosen) is not None,
                       "checkins": store.checkin_count(run, chosen)}
        pieces.append({
            "id": piece["id"],
            "summary": piece["record"]["brief"]["summary"],
            "updated": datetime.fromtimestamp(piece["updated_at"], timezone.utc).isoformat(timespec="seconds"),
            "concepts": run is not None,
            "concept": concept,
        })
    return {"pieces": pieces}


@app.get("/api/pieces/{brief_id}")
def open_piece(brief_id: str) -> dict:
    """A piece as the app left it: the brief, its latest concepts, the chosen concept with its recipe, and any concepts still being made."""
    saved = piece_or_404(brief_id)
    piece = {"brief": brief_view(saved["record"], brief_id)}
    run, chosen = saved["run"], saved["chosen"]
    if run is not None:
        piece["concepts"] = run_view(store.run(brief_id, run), brief_id, run)
        if chosen is not None:
            piece["chosen"] = chosen
            piece["recipe"] = store.latest_recipe(run, chosen)
    with running_lock:
        piece["making"] = running.get(concepts_key(brief_id))
    return piece


@app.get("/api/pieces/{brief_id}/wall")
def wall_photo(brief_id: str) -> Response:
    name = piece_or_404(brief_id)["record"].get("wall_photo")
    if not name:
        raise HTTPException(404, "This piece has no wall photo.")
    return stored_image(brief_id, name)


PhotoPoint = tuple[float, float]


class Mockup(BaseModel):
    """How the piece hangs on the wall photo: a line of known length for the scale, and the painting's corners (all photo pixels).

    estimated: the scale is Spark's guess from the photo, not a line the painter measured."""
    line: tuple[PhotoPoint, PhotoPoint]
    length_cm: float
    corners: tuple[PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint]
    estimated: bool = False


@app.get("/api/pieces/{brief_id}/mockup")
def get_mockup(brief_id: str) -> dict:
    saved = piece_or_404(brief_id)
    return {"mockup": walls.with_corners(saved["mockup"], saved["record"]["brief"]["piece"])}


def checked_mockup(mockup: Mockup) -> dict:
    if not 1 <= mockup.length_cm <= 5000:
        raise HTTPException(422, "Give the length in cm, between 1 and 5000.")
    return mockup.model_dump()


@app.put("/api/pieces/{brief_id}/mockup")
def save_mockup(brief_id: str, body: Mockup) -> dict:
    mockup = checked_mockup(body)
    piece_or_404(brief_id)
    store.save_mockup(brief_id, mockup)
    return {"mockup": mockup}


# --- Check-ins ---------------------------------------------------------------

def point(value: str, what: str) -> tuple[float, float]:
    try:
        x, y = (float(v) for v in value.split(","))
    except ValueError as error:
        raise HTTPException(422, f"The {what} should be a point X,Y in photo pixels.") from error
    return x, y


def checkin_view(record: dict, checkin_id: str, brief_id: str, run: str, concept: int) -> dict:
    """A stored check-in as the web app shows it: no server paths, image URLs instead."""
    base = f"/api/checkins/{brief_id}/{run}/{concept}/{checkin_id}"
    return {
        "id": checkin_id,
        **{key: record[key] for key in ("taken_at", "coverage", "bands", "summary", "warnings")},
        "images": {"progress": f"{base}/progress.png", "rectified": f"{base}/rectified.png"},
    }


@app.post("/api/checkins")
def new_checkin(
    brief_id: Annotated[str, Form()],
    run: Annotated[str, Form()],
    concept: Annotated[int, Form()],
    # The seed the relief preview painted the concept with, so the band map matches what she saw.
    seed: Annotated[int, Form()],
    photo: Annotated[UploadFile, File()],
    white: Annotated[str, Form()],
    corners: Annotated[list[str], Form()] = [],  # noqa: B006 - FastAPI copies defaults
    ground: Annotated[str | None, Form()] = None,
) -> dict:
    drafted = run_or_404(brief_id, run)
    known_concept(drafted, concept)
    piece = piece_or_404(brief_id)["record"]["brief"]["piece"]
    if not (piece["width_cm"] and piece["height_cm"]):
        raise HTTPException(409, "The brief has no piece size yet.")
    if corners and len(corners) != 4:
        raise HTTPException(422, "Tap all 4 corners of the canvas, or none to find them automatically.")
    white_px = point(white, "white paper")
    corners_px = [point(c, "corner") for c in corners] or None
    ground_px = point(ground, "bare canvas") if ground else None

    # Plan against the mixes and tubes of the latest recipe, if she made one.
    spec = dict(drafted["concepts"][concept])
    inventory = PLACEHOLDER_INVENTORY
    recipe = store.latest_recipe(run, concept)
    if recipe:
        spec["bands"] = [{**b, "mix": {**b["mix"], "hex": r["mix_hex"]}} for b, r in zip(spec["bands"], recipe["bands"])]
        inventory = without(PLACEHOLDER_INVENTORY, recipe["mixing"]["without"])

    photo_name, photo_data = read_image(photo, "photo")
    images = {photo_name: photo_data}
    # Muse's band layout when the concept has one, else the spec's drawn geometry at the preview's seed.
    map_name = spec["layout"]["map"] if "layout" in spec else None
    if map_name:
        images[map_name] = store.image(run, map_name)
    checkin_id = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:4]}"

    def work(phase: Callable[[str], None]) -> dict:
        phase("Finding the canvas…" if corners_px is None else "Straightening the photo…")
        with scratch(images) as folder:
            plan, out = folder / "plan-concept.json", folder / "out"
            plan.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
            result = asdict(asyncio.run(checkins.check_in(
                folder / photo_name, plan, (piece["width_cm"], piece["height_cm"]), white_px, out,
                corners=corners_px, ground=ground_px, inventory=inventory, seed=seed, plan_map=folder / map_name if map_name else None,
            )))
            del result["photo"], result["concept"]  # paths in the throwaway folder
            kept = {name: (out / name).read_bytes() for name in CHECKIN_IMAGES}
        store.save_checkin(brief_id, checkin_id, run, concept, result, {photo_name: photo_data, **kept})
        return checkin_view(result, checkin_id, brief_id, run, concept)

    return start(work)


@app.get("/api/checkins")
def list_checkins(brief_id: str, run: str, concept: int) -> dict:
    """Every check-in on one concept, oldest first: for the history and the drift over time."""
    run_or_404(brief_id, run)
    return {"checkins": [checkin_view(record, checkin_id, brief_id, run, concept) for checkin_id, record in store.checkins(run, concept)]}


@app.get("/api/checkins/{brief_id}/{run}/{concept}/{checkin_id}/{image}")
def checkin_image(brief_id: str, run: str, concept: int, checkin_id: str, image: str) -> Response:
    run_or_404(brief_id, run)
    if image not in CHECKIN_IMAGES or not CHECKIN_ID.match(checkin_id):
        raise HTTPException(404, "No such image.")
    return stored_image(checkin_id, image)


# --- Step and mix checks, and the chat ----------------------------------------

def new_check_id() -> str:
    return f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:4]}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def upright_jpeg(upload: UploadFile, max_side: int | None = None) -> bytes:
    """A photo for the checks: upright and sRGB, as the browser shows it, so taps land on the same pixels."""
    read_image(upload, "photo")  # only for its checks on the file's type
    upload.file.seek(0)
    try:
        return to_jpeg(Image.open(io.BytesIO(read_upload(upload))), max_side)
    except (UnidentifiedImageError, ValueError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(415, f"{upload.filename}: couldn't read this picture.") from error


def painting_plan(brief_id: str, run: str, concept: int) -> tuple[dict, dict, dict, str]:
    """The concept, its latest recipe and guide, and the plan in words for Spark."""
    source = known_concept(run_or_404(brief_id, run), concept)
    recipe = store.latest_recipe(run, concept)
    if recipe is None:
        raise HTTPException(409, "Make the recipes first.")
    guide = store.guide(run, concept, recipe["mixing"]["without"], recipe["mixing"]["paste_in_mix"])
    if guide is None:
        raise HTTPException(409, "The steps aren't written yet. Try again in a moment.")
    piece = piece_or_404(brief_id)["record"]["brief"]["piece"]
    return source, recipe, guide, coach.plan_text(source, recipe, guide, piece["width_cm"], piece["height_cm"])


def check_view(record: dict, check_id: str, brief_id: str, run: str, concept: int) -> dict:
    return {"id": check_id, **record, "photo": f"/api/checks/{brief_id}/{run}/{concept}/{check_id}/photo.jpg"}


def drying_note(steps: list[dict], step_id: str, run: str, concept: int) -> str:
    """How long the paste has had, for the first step after one that has to dry. Goes by when its check was taken."""
    index = next(i for i, step in enumerate(steps) if step["id"] == step_id)
    previous = steps[index - 1] if index else None
    if not previous or not previous["wait"]:
        return ""
    taken = [record["taken_at"] for _, record in store.checks(run, concept, "step") if record["step"] == previous["id"]]
    if not taken:
        return ""
    hours = (datetime.now(timezone.utc) - datetime.fromisoformat(taken[-1])).total_seconds() / 3600
    return (
        f"The step before this one needs {previous['wait']} to dry. Its last photo was taken about {hours:.0f} hours ago: "
        "if the photo shows paint going on over paste that can't be dry yet, say so."
    )


@app.post("/api/step-checks")
def new_step_check(
    brief_id: Annotated[str, Form()],
    run: Annotated[str, Form()],
    concept: Annotated[int, Form()],
    step: Annotated[str, Form()],
    photo: Annotated[UploadFile, File()],
    # How the canvas should look after this step, as the guide draws it.
    expected: Annotated[UploadFile, File()],
) -> dict:
    """Spark's look at a photo of one step of the guide. Only colors measured against white paper are trusted, so nothing here measures."""
    _, recipe, guide, plan = painting_plan(brief_id, run, concept)
    stage = next((s for s in guide["steps"] if s["id"] == step), None)
    if stage is None:
        raise HTTPException(422, "This painting has no such step.")
    photo_data = upright_jpeg(photo, MAX_PHOTO_SIDE)
    expected_data = upright_jpeg(expected, MAX_PHOTO_SIDE)
    note = drying_note(guide["steps"], step, run, concept)

    def work(phase: Callable[[str], None]) -> dict:
        phase("Spark is looking at the photo…")
        made = coach.review(stage, plan, ("photo.jpg", photo_data), ("expected.jpg", expected_data), note)
        check_id = new_check_id()
        record = {"step": step, "taken_at": now_iso(), "paste_in_mix": recipe["mixing"]["paste_in_mix"], "review": made}
        store.save_check(brief_id, check_id, run, concept, "step", record, {"photo.jpg": photo_data})
        return check_view(record, check_id, brief_id, run, concept)

    return start(work)


class MixSample(BaseModel):
    band: int
    point: PhotoPoint


@app.post("/api/mix-checks")
def new_mix_check(
    brief_id: Annotated[str, Form()],
    run: Annotated[str, Form()],
    concept: Annotated[int, Form()],
    photo: Annotated[UploadFile, File()],
    white: Annotated[str, Form()],
    # JSON: the colors tapped in the photo, each with the band it's meant to be.
    samples: Annotated[str, Form()],
) -> dict:
    """The paint in the bowl against the recipe: measured, with what to do if it's off."""
    known_concept(run_or_404(brief_id, run), concept)
    recipe = store.latest_recipe(run, concept)
    if recipe is None:
        raise HTTPException(409, "Make the recipes first.")
    try:
        tapped = [MixSample(**sample) for sample in json.loads(samples)]
    except (ValueError, TypeError) as error:
        raise HTTPException(422, "Tap the paint again.") from error
    if not tapped:
        raise HTTPException(422, "Tap at least one color.")
    if any(not 0 <= sample.band < len(recipe["bands"]) for sample in tapped):
        raise HTTPException(422, "This painting has no such color.")
    white_px = point(white, "white paper")
    photo_data = upright_jpeg(photo)

    def work(phase: Callable[[str], None]) -> dict:
        phase("Reading the color…")
        image = cv2.imdecode(np.frombuffer(photo_data, np.uint8), cv2.IMREAD_COLOR)
        found = mix_check.check(image, white_px, [{"band": s.band, "point": s.point} for s in tapped], recipe)
        check_id = new_check_id()
        record = {"taken_at": now_iso(), "paste_in_mix": recipe["mixing"]["paste_in_mix"], **found}
        store.save_check(brief_id, check_id, run, concept, "mix", record, {"photo.jpg": photo_data})
        return check_view(record, check_id, brief_id, run, concept)

    return start(work)


@app.get("/api/checks")
def list_checks(brief_id: str, run: str, concept: int) -> dict:
    """Everything on the check-ins screen besides the whole-canvas check-ins: step and mix checks, oldest first, and the chat."""
    run_or_404(brief_id, run)

    def views(kind: str) -> list[dict]:
        return [check_view(record, check_id, brief_id, run, concept) for check_id, record in store.checks(run, concept, kind)]

    return {"steps": views("step"), "mixes": views("mix"), "questions": store.questions(run, concept)}


@app.get("/api/checks/{brief_id}/{run}/{concept}/{check_id}/{image}")
def check_image(brief_id: str, run: str, concept: int, check_id: str, image: str) -> Response:
    run_or_404(brief_id, run)
    if image not in CHECK_IMAGES or not CHECKIN_ID.match(check_id):
        raise HTTPException(404, "No such image.")
    return stored_image(check_id, image)


def section_context(section: str | None, steps: list[dict], run: str, concept: int) -> tuple[str, tuple[str, bytes] | None]:
    """What the painter has open as they ask, and the latest photo from it."""
    if section == "mix":
        checks = store.checks(run, concept, "mix")
        return "They have the Color mixes check open.", (("photo.jpg", store.image(checks[-1][0], "photo.jpg")) if checks else None)
    if section == "canvas":
        checks = store.checkins(run, concept)
        return "They have the Whole canvas check open.", (("rectified.png", store.image(checks[-1][0], "rectified.png")) if checks else None)
    stage = next((s for s in steps if s["id"] == section), None)
    if stage is None:
        return "", None
    checks = [(check_id, record) for check_id, record in store.checks(run, concept, "step") if record["step"] == section]
    return (
        f"They have this step open, so a question with no other subject is about it: {stage['title']}."
        + (" The picture is their latest photo of it." if checks else ""),
        ("photo.jpg", store.image(checks[-1][0], "photo.jpg")) if checks else None,
    )


class Question(BaseModel):
    brief_id: str
    run: str
    concept: int
    question: str
    # The section open as they ask: a guide step's id, mix, canvas, or none.
    section: str | None = None


@app.post("/api/questions")
def ask(body: Question) -> dict:
    """Spark answers a question about the painting. One at a time per painting: asking again joins it."""
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "Ask something first.")
    if len(question) > MAX_QUESTION_CHARS:
        raise HTTPException(422, f"Keep it under {MAX_QUESTION_CHARS} characters.")
    _, recipe, guide, plan = painting_plan(body.brief_id, body.run, body.concept)
    method = recipe["mixing"]["paste_in_mix"]

    def work(phase: Callable[[str], None]) -> dict:
        phase("Spark is thinking…")
        found = coach.findings(
            guide["steps"],
            [record for _, record in store.checks(body.run, body.concept, "step") if record["paste_in_mix"] == method],
            [record for _, record in store.checks(body.run, body.concept, "mix") if record["paste_in_mix"] == method],
            [record for _, record in store.checkins(body.run, body.concept)],
        )
        section, photo = section_context(body.section, guide["steps"], body.run, body.concept)
        said = coach.answer(plan, found, section, store.questions(body.run, body.concept), question, photo)
        record = {"question": question, "answer": said, "asked_at": now_iso(), "section": body.section}
        store.save_question(body.brief_id, body.run, body.concept, record)
        return record

    return start(work, key=f"question:{body.run}:{body.concept}")
