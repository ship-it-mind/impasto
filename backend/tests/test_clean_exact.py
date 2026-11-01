"""Cleaning a picture to paint as it is, with Muse Image's answer made up, so no model is called."""

from pathlib import Path

import cv2
import numpy as np
import pytest
from openai import APIConnectionError

from impasto import exact

SIZE = (100, 120)  # width, height
CUT = np.full((SIZE[1], SIZE[0], 3), 50, np.uint8)
CLEANED = np.full((SIZE[1], SIZE[0], 3), 200, np.uint8)


def test_the_clean_version_is_used(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    sent = []

    def paint_one(prompt: str, references: list[Path]) -> np.ndarray:
        sent.extend(path.exists() for path in references)
        return CLEANED

    monkeypatch.setattr(exact, "paint_one", paint_one)
    image, note = exact.clean(CUT, SIZE, tmp_path)
    assert sent == [True]
    assert (image == 200).all()
    assert note == exact.CLEANED_NOTE
    assert list(tmp_path.iterdir()) == []  # nothing left to be kept with the run


@pytest.mark.parametrize("error", [RuntimeError("no image"), APIConnectionError(request=None)])
def test_a_failed_clean_falls_back_to_the_picture_with_a_note(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, error: Exception) -> None:
    def paint_one(prompt: str, references: list[Path]) -> np.ndarray:
        raise error

    monkeypatch.setattr(exact, "paint_one", paint_one)
    image, note = exact.clean(CUT, SIZE, tmp_path)
    assert image is CUT
    assert note == exact.NOT_CLEANED_NOTE
    assert list(tmp_path.iterdir()) == []


def test_the_plan_is_read_off_the_clean_version(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    photo = tmp_path / "exact.jpg"
    cv2.imwrite(str(photo), np.full((600, 500, 3), 50, np.uint8))
    planned = {}

    def plan_picture(image: np.ndarray, size: tuple[int, int], folder: Path, image_name: str, map_name: str, notes: list[str | None]) -> dict:
        planned.update(image=image, notes=notes)
        return {"layout": {"prompt": "words"}}

    monkeypatch.setattr(exact, "paint_one", lambda prompt, references: np.full((600, 500, 3), 200, np.uint8))
    monkeypatch.setattr(exact, "plan_picture", plan_picture)
    phases: list[str] = []
    brief = {"piece": {"width_cm": 100, "height_cm": 120}}
    exact.draft(brief, photo, tmp_path, [(10.0, 10.0), (490.0, 10.0), (490.0, 590.0), (10.0, 590.0)], phases.append)
    assert (planned["image"] == 200).all()
    assert exact.CLEANED_NOTE in planned["notes"]
    assert phases == ["Cleaning the picture with Muse Image…", "Reading the colors off the picture…"]
