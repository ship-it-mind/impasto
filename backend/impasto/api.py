"""HTTP API for the web app: brief → concepts, wrapping the pipeline modules.

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
from impasto.mixing import PLACEHOLDER_INVENTORY, without
from impasto.presets import DEFAULT_PRESET, PRESETS
from impasto.voice import transcribe

OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "api"
MAX_MODEL_CALLS = int(os.environ.get("IMPASTO_MAX_MODEL_CALLS", "20"))
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_REFERENCES = 6
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
BRIEF_ID = re.compile(r"^[0-9a-f]{32}$")

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
        return {key: drafted[key] for key in ("style", "canvas_px", "concepts", "mixing")}

    return start(work)
