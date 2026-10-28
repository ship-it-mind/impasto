"""HTTP API for the web app: brief → concepts → recipe, wrapping the pipeline modules.

    uv run uvicorn impasto.api:app --port 8000

Model calls take 5–30 s, so they run as background jobs: a POST returns a job
id, and the web app polls GET /api/jobs/{id} for the phase and the result.
Each browser session (the X-Impasto-Session header) may make at most
IMPASTO_MAX_MODEL_CALLS model calls (default 20), so a stuck retry loop can't
spend the hackathon credits. Everything lives in memory and in output/api/;
nothing is kept per user.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Annotated, Callable

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from impasto import brief as briefs
from impasto import concepts
from impasto.color import rgb_to_hex
from impasto.mixing import PLACEHOLDER_INVENTORY, Mixer, without
from impasto.presets import DEFAULT_PRESET, PRESETS
from impasto.recipe_cards import band_brief, write_cards
from impasto.voice import transcribe
from impasto.volume import Materials, estimate

OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "api"
MAX_MODEL_CALLS = int(os.environ.get("IMPASTO_MAX_MODEL_CALLS", "20"))
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_REFERENCES = 6
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
BRIEF_ID = re.compile(r"^[0-9a-f]{32}$")
RUN_ID = re.compile(r"^concepts-[0-9a-f]{8}$")

log = logging.getLogger("impasto.api")
app = FastAPI(title="Impasto")
pool = ThreadPoolExecutor(max_workers=4)
lock = threading.Lock()
jobs: dict[str, dict] = {}
calls: dict[str, int] = {}

Session = Annotated[str, Header(alias="X-Impasto-Session", min_length=8, max_length=64)]


# --- Spend cap ---------------------------------------------------------------

def spend(session: str, n: int) -> None:
    """Count n model calls against the session, or refuse before any are made."""
    with lock:
        used = calls.get(session, 0)
        if used + n > MAX_MODEL_CALLS:
            raise HTTPException(429, f"This session has used its {MAX_MODEL_CALLS} model calls. Reload the page to start a new one.")
        calls[session] = used + n


@app.get("/api/session")
def session_info(session: Session) -> dict:
    used = calls.get(session, 0)
    return {"model_calls_used": used, "model_calls_left": MAX_MODEL_CALLS - used}


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

def save(upload: UploadFile, folder: Path, name: str, kind: str) -> Path:
    suffix = Path(upload.filename or "").suffix.lower()
    if kind == "image" and suffix not in IMAGE_SUFFIXES:
        raise HTTPException(415, f"{upload.filename}: use a JPG, PNG or WebP photo.")
    if kind == "audio" and not (upload.content_type or "").startswith(("audio/", "video/")):
        raise HTTPException(415, f"{upload.filename}: that doesn't look like a voice note.")
    data = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"{upload.filename} is over 25 MB.")
    path = folder / f"{name}{suffix or '.bin'}"
    path.write_bytes(data)
    return path


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
    return {"id": folder.name, "transcript": record["transcript"], "brief": record["brief"], "warnings": record["warnings"]}


@app.post("/api/brief")
def new_brief(
    session: Session,
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
    spend(session, 2 if audio_path else 1)

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
def answer_brief(brief_id: str, body: Answer, session: Session) -> dict:
    folder = brief_folder(brief_id)
    record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
    question = record["brief"]["clarifying_question"]
    if not question:
        raise HTTPException(409, "This brief has no open question.")
    if not body.answer.strip():
        raise HTTPException(422, "Type the answer first.")
    spend(session, 1)
    record["answers"].append({"question": question, "answer": body.answer.strip()[:500]})
    return start(lambda phase: read(record, folder, phase))


# --- Concepts ----------------------------------------------------------------

@app.post("/api/concepts")
def new_concepts(
    session: Session,
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
    spend(session, 1)

    def work(phase: Callable[[str], None]) -> dict:
        phase("Drafting 3 concepts…")
        drafted = concepts.draft(record["brief"], preset, refs)
        phase("Mixing each band from the tubes on hand…")
        concepts.mix(drafted, without_tubes, paste_in_mix)
        write(run_folder / "concepts.json", drafted)
        return {"run": run_folder.name, **{key: drafted[key] for key in ("style", "canvas_px", "concepts", "mixing")}}

    return start(work)


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
def new_recipe(body: RecipeRequest, session: Session) -> dict:
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
    spend(session, 1)

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
