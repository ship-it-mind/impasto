"""Shared helpers for the Day 1 model spikes."""

from __future__ import annotations

import base64
import mimetypes
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI, OpenAI

BASE_URL = "https://api.meta.ai/v1"
REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = Path(__file__).resolve().parent / "output"

load_dotenv(REPO_ROOT / ".env")


def api_key() -> str:
    key = os.environ.get("MODEL_API_KEY")
    if not key:
        raise RuntimeError(f"Set MODEL_API_KEY in {REPO_ROOT / '.env'}.")
    return key


def client() -> OpenAI:
    # The OpenAI SDK does not read MODEL_API_KEY on its own.
    return OpenAI(base_url=BASE_URL, api_key=api_key())


def async_client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=BASE_URL, api_key=api_key())


def data_url(path: Path) -> str:
    media_type, _ = mimetypes.guess_type(path.name)
    if media_type is None:
        raise ValueError(f"Could not infer a media type for {path}.")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def output_dir(spike: str) -> Path:
    path = OUTPUT_ROOT / spike
    path.mkdir(parents=True, exist_ok=True)
    return path


def require_file(path: Path) -> Path:
    if not path.is_file():
        raise FileNotFoundError(path)
    return path
