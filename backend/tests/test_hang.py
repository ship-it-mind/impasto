"""Muse Image's photo of the painting hung on the wall, with Muse's answer made up, so no model is called."""

from pathlib import Path

import cv2
import numpy as np
import pytest

from impasto import concepts, wall


def test_answer_comes_back_at_the_mockups_size(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    flat, painting = tmp_path / "flat.png", tmp_path / "painting.png"
    cv2.imwrite(str(flat), np.full((1536, 2048, 3), 200, np.uint8))
    cv2.imwrite(str(painting), np.full((600, 500, 3), 90, np.uint8))
    seen = {}

    def paint_one(prompt: str, references: list[Path]) -> np.ndarray:
        seen["references"] = references
        return np.full((1376, 1824, 3), 120, np.uint8)  # Muse answers at a size of its own

    monkeypatch.setattr(concepts, "paint_one", paint_one)
    hung = wall.hang(flat, painting)
    assert hung.shape == (1536, 2048, 3)
    assert seen["references"] == [flat, painting]
