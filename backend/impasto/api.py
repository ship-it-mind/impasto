"""HTTP API for the web app: brief → concepts → recipe → check-ins, wrapping the pipeline modules.

    uv run uvicorn impasto.api:app --port 8000

Model calls take 5–30 s, so they run as background jobs: a POST returns a job
id, and the web app polls GET /api/jobs/{id} for the phase and the result.
Everything lives in memory and in output/api/;
nothing is kept per user.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import math
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Callable

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
from pydantic import BaseModel

from impasto import brief as briefs
from impasto import checkin as checkins
from impasto import concepts
from impasto.color import rgb_to_hex
from impasto.mixing import PLACEHOLDER_INVENTORY, Mixer, without
from impasto.presets import DEFAULT_PRESET, PRESETS
from impasto.recipe_cards import band_brief, write_cards
from impasto.voice import transcribe
from impasto.volume import Materials, estimate

OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "api"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_REFERENCES = 6
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
BRIEF_ID = re.compile(r"^[0-9a-f]{32}$")
RUN_ID = re.compile(r"^concepts-[0-9a-f]{8}$")
CHECKIN_ID = re.compile(r"^\d{8}T\d{6}Z-[0-9a-f]{4}$")
CHECKIN_IMAGES = {"progress.png", "rectified.png"}
CONCEPT_FILE = re.compile(r"^concept-\d+-(muse|layout)\.png$")

log = logging.getLogger("impasto.api")
app = FastAPI(title="Impasto")
pool = ThreadPoolExecutor(max_workers=4)
jobs: dict[str, dict] = {}

register_heif_opener()


# --- Jobs --------------------------------------------------------------------

def start(work: Callable[[Callable[[str], None]], dict]) -> dict:
    job_id = uuid.uuid4().hex
    jobs[job_id] = {"status": "running", "phase": "Starting…", "result": None, "error": None}

    def run() -> None:
        job = jobs[job_id]
        try:
            job["result"] = work(lambda phase: job.update(phase=phase))
            job["status"] = "done"
        except Exception as error:  # noqa: BLE001 - the web app gets a message, the log gets the trace
            log.exception("Job %s failed", job_id)
            job["status"], job["error"] = "failed", str(error)[:300]

    pool.submit(run)
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


def save(upload: UploadFile, folder: Path, name: str, kind: str) -> Path:
    suffix = Path(upload.filename or "").suffix.lower()
    if kind == "image" and suffix not in IMAGE_SUFFIXES:
        raise HTTPException(415, f"{upload.filename}: use a JPG, PNG, WebP or HEIC photo.")
    if kind == "audio" and not (upload.content_type or "").startswith(("audio/", "video/")):
        raise HTTPException(415, f"{upload.filename}: that doesn't look like a voice note.")
    path = folder / f"{name}{suffix or '.bin'}"
    path.write_bytes(read_upload(upload))
    return path


def heic_to_jpeg(data: bytes) -> bytes:
    """A HEIC photo as an upright sRGB JPEG. iPhones shoot in Display P3, and the color work reads pixels as sRGB."""
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    profile = image.info.get("icc_profile")
    if profile:
        image = ImageCms.profileToProfile(
            image.convert("RGB"), ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile("sRGB"), outputMode="RGB",
        )
    out = io.BytesIO()
    image.convert("RGB").save(out, "JPEG", quality=95)
    return out.getvalue()


@app.post("/api/images/heic")
def convert_heic(photo: Annotated[UploadFile, File()]) -> Response:
    """Browsers can't show HEIC, so the web app swaps one for this JPEG as soon as it's picked."""
    try:
        return Response(heic_to_jpeg(read_upload(photo)), media_type="image/jpeg")
    except (UnidentifiedImageError, ValueError, OSError) as error:
        raise HTTPException(415, f"{photo.filename}: couldn't read this HEIC photo.") from error


def brief_folder(brief_id: str) -> Path:
    folder = OUTPUT_ROOT / brief_id
    if not BRIEF_ID.match(brief_id) or not (folder / "brief.json").is_file():
        raise HTTPException(404, "No such brief. Read the brief again.")
    return folder


def write(path: Path, record: dict) -> None:
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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

def read(record: dict, folder: Path, phase: Callable[[str], None]) -> dict:
    wall = Path(record["wall_photo"]) if record["wall_photo"] else None
    phase("Reading the brief and the wall photo…" if wall else "Reading the brief…")
    record["brief"] = briefs.structure(record["transcript"], wall, record["answers"])
    record["warnings"] = briefs.warnings(record["brief"])
    write(folder / "brief.json", record)
    return brief_view(record, folder.name)


def brief_view(record: dict, brief_id: str) -> dict:
    """A read brief as the web app gets it, with its wall photo as a URL."""
    return {
        "id": brief_id, "transcript": record["transcript"], "brief": record["brief"], "warnings": record["warnings"],
        "wall": f"/api/pieces/{brief_id}/wall" if record.get("wall_photo") else None,
    }


@app.post("/api/brief")
def new_brief(
    text: Annotated[str, Form(max_length=5000)] = "",
    audio: Annotated[UploadFile | None, File()] = None,
    wall: Annotated[UploadFile | None, File()] = None,
) -> dict:
    if not audio and not text.strip():
        raise HTTPException(422, "Add the client's voice note or type their brief.")
    brief_id = uuid.uuid4().hex
    folder = OUTPUT_ROOT / brief_id
    folder.mkdir(parents=True)
    audio_path = save(audio, folder, "voice-note", "audio") if audio else None
    wall_path = save(wall, folder, "wall", "image") if wall else None

    def work(phase: Callable[[str], None]) -> dict:
        transcript = text.strip()
        if audio_path:
            phase("Transcribing the voice note…")
            transcript = transcribe(audio_path)
            if not transcript:
                raise RuntimeError("The voice note came back empty. Is there speech on it?")
        record = {"source": str(audio_path or "typed"), "transcript": transcript,
                  "wall_photo": str(wall_path) if wall_path else None, "answers": []}
        return read(record, folder, phase)

    return start(work)


class Answer(BaseModel):
    answer: str


@app.post("/api/brief/{brief_id}/answer")
def answer_brief(brief_id: str, body: Answer) -> dict:
    folder = brief_folder(brief_id)
    record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
    question = record["brief"]["clarifying_question"]
    if not question:
        raise HTTPException(409, "This brief has no open question.")
    if not body.answer.strip():
        raise HTTPException(422, "Type the answer first.")
    record["answers"].append({"question": question, "answer": body.answer.strip()[:500]})
    return start(lambda phase: read(record, folder, phase))


# --- Concepts ----------------------------------------------------------------

@app.post("/api/concepts")
def new_concepts(
    brief_id: Annotated[str, Form()],
    preset: Annotated[str | None, Form()] = None,
    references: Annotated[list[UploadFile], File()] = [],  # noqa: B006 - FastAPI copies defaults
    without_tubes: Annotated[list[str], Form(alias="without")] = [],  # noqa: B006
    paste_in_mix: Annotated[bool, Form()] = False,
) -> dict:
    folder = brief_folder(brief_id)
    record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
    if preset is not None and preset not in PRESETS:
        raise HTTPException(422, f"Unknown style preset {preset!r}.")
    if len(references) > MAX_REFERENCES:
        raise HTTPException(422, f"Up to {MAX_REFERENCES} style pictures.")
    try:
        without(PLACEHOLDER_INVENTORY, without_tubes)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    run_folder = folder / f"concepts-{uuid.uuid4().hex[:8]}"
    run_folder.mkdir()
    refs = [save(upload, run_folder, f"reference-{i + 1}", "image") for i, upload in enumerate(references)]

    def work(phase: Callable[[str], None]) -> dict:
        phase("Drafting 3 concepts…")
        drafted = concepts.draft(record["brief"], preset, refs)
        phase("Mixing each band from the tubes on hand…")
        concepts.mix(drafted, without_tubes, paste_in_mix)
        phase("Painting each concept with Muse Image…")
        concepts.paint(drafted, run_folder, refs)
        write(run_folder / "concepts.json", drafted)
        return {
            "run": run_folder.name,
            **{key: drafted[key] for key in ("style", "canvas_px", "mixing")},
            "concepts": [concept_view(c, brief_id, run_folder.name) for c in drafted["concepts"]],
        }

    return start(work)


def concept_view(concept: dict, brief_id: str, run: str) -> dict:
    """A concept as the web app gets it: its Muse layout as URLs, without the prompt."""
    if "layout" not in concept:
        return concept
    base = f"/api/concepts/{brief_id}/{run}"
    layout = concept["layout"]
    return {**concept, "layout": {"image": f"{base}/{layout['image']}", "map": f"{base}/{layout['map']}", "shares": layout["shares"]}}


@app.get("/api/concepts/{brief_id}/{run}/{name}")
def concept_file(brief_id: str, run: str, name: str) -> FileResponse:
    path = run_folder_for(brief_id, run) / name
    if not CONCEPT_FILE.match(name) or not path.is_file():
        raise HTTPException(404, "No such image.")
    return FileResponse(path, media_type="image/png")


# --- Recipe ------------------------------------------------------------------

class RecipeRequest(BaseModel):
    brief_id: str
    run: str
    concept: int
    # Each band's share of the canvas, measured from the painted concept (sums to 1).
    shares: list[float]
    without: list[str] = []
    paste_in_mix: bool = False


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
    folder = brief_folder(body.brief_id)
    run_folder = folder / body.run
    if not RUN_ID.match(body.run) or not (run_folder / "concepts.json").is_file():
        raise HTTPException(404, "No such set of concepts. Make them again.")
    drafted = json.loads((run_folder / "concepts.json").read_text(encoding="utf-8"))
    if not 0 <= body.concept < len(drafted["concepts"]):
        raise HTTPException(422, "No such concept.")
    concept = drafted["concepts"][body.concept]
    piece = json.loads((folder / "brief.json").read_text(encoding="utf-8"))["brief"]["piece"]
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
        write(run_folder / f"recipe-{body.concept + 1}.json", result)
        return result

    return start(work)


# --- Pieces ------------------------------------------------------------------

def latest_run(folder: Path) -> tuple[Path | None, int | None]:
    """The run to reopen a piece at: the latest one with a recipe, and its chosen concept; else the latest run."""
    runs = sorted((r for r in folder.glob("concepts-*") if (r / "concepts.json").is_file()), key=lambda r: r.stat().st_mtime)
    for run in reversed(runs):
        recipes = sorted(run.glob("recipe-*.json"), key=lambda r: r.stat().st_mtime)
        if recipes:
            return run, int(recipes[-1].stem.split("-")[1]) - 1
    return (runs[-1] if runs else None), None


@app.get("/api/pieces")
def list_pieces() -> dict:
    """Every piece read so far, latest first: enough to pick one to reopen."""
    pieces = []
    for path in OUTPUT_ROOT.glob("*/brief.json"):
        folder = path.parent
        if not BRIEF_ID.match(folder.name):
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        run, chosen = latest_run(folder)
        concept = None
        if run is not None and chosen is not None:
            drafted = json.loads((run / "concepts.json").read_text(encoding="utf-8"))
            view = concept_view(drafted["concepts"][chosen], folder.name, run.name)
            concept = {"title": view["title"], "image": view.get("layout", {}).get("image"),
                       "checkins": len(list(checkin_folder(run, chosen).glob("*/checkin.json")))}
        updated = max([folder.stat().st_mtime] + [p.stat().st_mtime for p in folder.rglob("*.json")])
        pieces.append({
            "id": folder.name,
            "summary": record["brief"]["summary"],
            "updated": datetime.fromtimestamp(updated, timezone.utc).isoformat(timespec="seconds"),
            "concepts": run is not None,
            "concept": concept,
        })
    return {"pieces": sorted(pieces, key=lambda p: p["updated"], reverse=True)}


@app.get("/api/pieces/{brief_id}")
def open_piece(brief_id: str) -> dict:
    """A piece as the app left it: the brief, its latest concepts, and the chosen concept with its recipe."""
    folder = brief_folder(brief_id)
    record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
    piece = {"brief": brief_view(record, brief_id)}
    run, chosen = latest_run(folder)
    if run is not None:
        drafted = json.loads((run / "concepts.json").read_text(encoding="utf-8"))
        piece["concepts"] = {
            "run": run.name, **{key: drafted[key] for key in ("style", "canvas_px", "mixing")},
            "concepts": [concept_view(c, brief_id, run.name) for c in drafted["concepts"]],
        }
        if chosen is not None:
            piece["chosen"] = chosen
            piece["recipe"] = json.loads((run / f"recipe-{chosen + 1}.json").read_text(encoding="utf-8"))
    return piece


@app.get("/api/pieces/{brief_id}/wall")
def wall_photo(brief_id: str) -> FileResponse:
    folder = brief_folder(brief_id)
    record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
    path = Path(record["wall_photo"]) if record.get("wall_photo") else None
    if path is None or path.parent != folder or not path.is_file():
        raise HTTPException(404, "This piece has no wall photo.")
    return FileResponse(path)


class Mockup(BaseModel):
    """How the piece hangs on the wall photo: a measured line (photo pixels and its length) and the canvas's center."""
    line: tuple[tuple[float, float], tuple[float, float]]
    length_cm: float
    center: tuple[float, float]


@app.get("/api/pieces/{brief_id}/mockup")
def get_mockup(brief_id: str) -> dict:
    path = brief_folder(brief_id) / "mockup.json"
    return {"mockup": json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None}


@app.put("/api/pieces/{brief_id}/mockup")
def save_mockup(brief_id: str, body: Mockup) -> dict:
    if not 1 <= body.length_cm <= 5000:
        raise HTTPException(422, "Give the length in cm, between 1 and 5000.")
    write(brief_folder(brief_id) / "mockup.json", body.model_dump())
    return {"mockup": body.model_dump()}


# --- Check-ins ---------------------------------------------------------------

def run_folder_for(brief_id: str, run: str) -> Path:
    run_folder = brief_folder(brief_id) / run
    if not RUN_ID.match(run) or not (run_folder / "concepts.json").is_file():
        raise HTTPException(404, "No such set of concepts. Make them again.")
    return run_folder


def checkin_folder(run_folder: Path, concept: int) -> Path:
    return run_folder / "checkins" / f"concept-{concept + 1}"


def point(value: str, what: str) -> tuple[float, float]:
    try:
        x, y = (float(v) for v in value.split(","))
    except ValueError as error:
        raise HTTPException(422, f"The {what} should be a point X,Y in photo pixels.") from error
    return x, y


def checkin_view(record: dict, folder: Path, brief_id: str, run: str, concept: int) -> dict:
    """A stored check-in as the web app shows it: no server paths, image URLs instead."""
    base = f"/api/checkins/{brief_id}/{run}/{concept}/{folder.name}"
    return {
        "id": folder.name,
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
    run_folder = run_folder_for(brief_id, run)
    drafted = json.loads((run_folder / "concepts.json").read_text(encoding="utf-8"))
    if not 0 <= concept < len(drafted["concepts"]):
        raise HTTPException(422, "No such concept.")
    piece = json.loads((run_folder.parent / "brief.json").read_text(encoding="utf-8"))["brief"]["piece"]
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
    recipe_path = run_folder / f"recipe-{concept + 1}.json"
    if recipe_path.is_file():
        recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
        spec["bands"] = [{**b, "mix": {**b["mix"], "hex": r["mix_hex"]}} for b, r in zip(spec["bands"], recipe["bands"])]
        inventory = without(PLACEHOLDER_INVENTORY, recipe["mixing"]["without"])

    # Muse's band layout when the concept has one, else the spec's drawn geometry at the preview's seed.
    plan_map = run_folder / spec["layout"]["map"] if "layout" in spec else None
    folder = checkin_folder(run_folder, concept) / f"{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:4]}"
    folder.mkdir(parents=True)
    photo_path = save(photo, folder, "photo", "image")
    write(folder / "plan-concept.json", spec)

    def work(phase: Callable[[str], None]) -> dict:
        phase("Finding the canvas…" if corners_px is None else "Straightening the photo…")
        result = asyncio.run(checkins.check_in(
            photo_path, folder / "plan-concept.json", (piece["width_cm"], piece["height_cm"]), white_px, folder,
            corners=corners_px, ground=ground_px, inventory=inventory, seed=seed, plan_map=plan_map,
        ))
        return checkin_view(asdict(result), folder, brief_id, run, concept)

    return start(work)


@app.get("/api/checkins")
def list_checkins(brief_id: str, run: str, concept: int) -> dict:
    """Every check-in on one concept, oldest first: for the history and the drift over time."""
    folder = checkin_folder(run_folder_for(brief_id, run), concept)
    records = []
    for path in sorted(folder.glob("*/checkin.json")):
        records.append(checkin_view(json.loads(path.read_text(encoding="utf-8")), path.parent, brief_id, run, concept))
    return {"checkins": records}


@app.get("/api/checkins/{brief_id}/{run}/{concept}/{checkin_id}/{image}")
def checkin_image(brief_id: str, run: str, concept: int, checkin_id: str, image: str) -> FileResponse:
    if image not in CHECKIN_IMAGES or not CHECKIN_ID.match(checkin_id):
        raise HTTPException(404, "No such image.")
    path = checkin_folder(run_folder_for(brief_id, run), concept) / checkin_id / image
    if not path.is_file():
        raise HTTPException(404, "No such image.")
    return FileResponse(path, media_type="image/png")
