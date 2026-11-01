"""Finding the painting in a picture to paint as it is, with SAM's answer made up, so no model is called."""

import asyncio
from pathlib import Path

import numpy as np
import pytest

from impasto import exact

SIZE = (1000, 800)  # width, height


def box(left: int, top: int, right: int, bottom: int) -> np.ndarray:
    mask = np.zeros((SIZE[1], SIZE[0]), dtype=bool)
    mask[top:bottom, left:right] = True
    return mask


def find(monkeypatch: pytest.MonkeyPatch, masks: dict[str, np.ndarray]) -> list[tuple[float, float]] | None:
    async def segment(_path: Path, _prompt: str) -> dict[str, np.ndarray]:
        return masks

    monkeypatch.setattr(exact, "segment", segment)
    monkeypatch.setattr(exact, "masks_by_object", lambda result, _size: result)
    return asyncio.run(exact.find_painting(Path("picture.jpg"), SIZE))


def test_corners_leave_out_whats_around_the_painting(monkeypatch: pytest.MonkeyPatch) -> None:
    corners = find(monkeypatch, {"0": box(300, 100, 800, 700)})
    assert corners is not None
    assert np.allclose(corners, [(300, 100), (799, 100), (799, 699), (300, 699)], atol=2)


def test_takes_the_biggest_painting_not_all_of_them(monkeypatch: pytest.MonkeyPatch) -> None:
    corners = find(monkeypatch, {"0": box(20, 20, 120, 120), "1": box(300, 100, 800, 700)})
    assert corners is not None
    assert min(x for x, _ in corners) == pytest.approx(300, abs=2)


@pytest.mark.parametrize("masks", [
    {},  # nothing found
    {"0": box(0, 0, 1000, 800)},  # it fills the picture
    {"0": box(10, 10, 110, 110)},  # too small to be the painting
])
def test_no_corners_when_theres_nothing_to_cut_away(monkeypatch: pytest.MonkeyPatch, masks: dict[str, np.ndarray]) -> None:
    assert find(monkeypatch, masks) is None
