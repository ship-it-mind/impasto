"""The example piece: a recorded piece every user can look through, that nobody can change and that never calls a model."""

import pytest

from impasto import api as api_module
from impasto import store
from tests.test_auth import empty_database, seeded_piece, signed_up, user_id  # noqa: F401 - the fixture is autouse

RECIPE = {"bands": [], "mixing": {"without": [], "paste_in_mix": False}}
GUIDE = {"steps": []}


@pytest.fixture
def example(monkeypatch):
    """A's piece, made the example, with its recipe and guide recorded; B is any other user, such as a judge."""
    a, b = signed_up("a@example.com"), signed_up("b@example.com")
    s = seeded_piece(user_id(a))
    store.choose(s["piece"], 0)
    store.save_recipe(s["piece"], s["run"], 0, [], False, RECIPE)
    store.save_guide(s["piece"], s["run"], 0, [], False, GUIDE)
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", s["piece"])
    return {**s, "owner": a, "other": b}


def result(browser, answer) -> dict:
    assert answer.status_code == 200, answer.text
    state = browser.get(f"/api/jobs/{answer.json()['job']}").json()
    assert state["status"] == "done", state
    return state["result"]


def test_every_user_sees_the_example_first(example):
    other = example["other"]
    mine = seeded_piece(user_id(other))
    listed = other.get("/api/pieces").json()["pieces"]
    assert [(p["id"], p["example"]) for p in listed] == [(example["piece"], True), (mine["piece"], False)]
    # Its owner sees it once, as the example.
    assert [p["id"] for p in example["owner"].get("/api/pieces").json()["pieces"]] == [example["piece"]]


def test_every_user_can_look_through_the_example(example):
    b, piece, run = example["other"], example["piece"], example["run"]
    ids = {"brief_id": piece, "run": run, "concept": 0}
    opened = b.get(f"/api/pieces/{piece}").json()
    assert opened["example"] is True and opened["recipe"] == RECIPE
    assert b.get(f"/api/pieces/{piece}/wall").content == b"wall"
    assert b.get(f"/api/concepts/{piece}/{run}/concept-1-muse.png").content == b"painting"
    assert b.get(f"/api/checkins/{piece}/{run}/0/{example['checkin']}/progress.png").content == b"secret-progress"
    assert b.get(f"/api/checks/{piece}/{run}/0/{example['check']}/photo.jpg").content == b"secret-photo"
    for path in ("/api/checkins", "/api/checks"):
        assert b.get(path, params=ids).status_code == 200
    assert b.get(f"/api/pieces/{piece}/mockup").status_code == 200


def test_what_was_recorded_comes_back_without_a_model(example):
    b = example["other"]
    ids = {"brief_id": example["piece"], "run": example["run"], "concept": 0}
    assert result(b, b.post("/api/recipe", json={**ids, "shares": [1.0]})) == RECIPE
    assert result(b, b.post("/api/guide", json=ids)) == GUIDE
    # Picking a concept shows its recipe, but the example keeps the choice it was painted from.
    assert b.put(f"/api/pieces/{example['piece']}/choice", json={"run": example["run"], "concept": 0}).json() == {"recipe": RECIPE}
    assert store.any_piece(example["piece"])["chosen"] == 0


@pytest.mark.parametrize("who", ["owner", "other"])
def test_nobody_can_change_the_example_or_call_a_model_on_it(example, who):
    browser, piece, run = example[who], example["piece"], example["run"]
    ids = {"brief_id": piece, "run": run, "concept": 0}
    photo = {"photo": ("p.jpg", b"x", "image/jpeg")}
    attempts = [
        ("POST", f"/api/pieces/{piece}/wall/hung", {"files": {"mockup": ("m.png", b"x", "image/png"), "painting": ("p.png", b"x", "image/png")}}),
        ("PUT", f"/api/pieces/{piece}/mockup", {"json": {"line": [[0, 0], [1, 1]], "length_cm": 10, "corners": [[0, 0], [1, 0], [1, 1], [0, 1]]}}),
        ("PUT", f"/api/pieces/{piece}/supplies", {"json": {"have": {}}}),
        ("POST", "/api/concepts", {"data": {"brief_id": piece}}),
        ("POST", f"/api/concepts/{piece}/{run}/0/edit", {"json": {"message": "Bluer"}}),
        # A recipe and guide that weren't recorded would need a model.
        ("POST", "/api/recipe", {"json": {**ids, "shares": [1.0], "paste_in_mix": True}}),
        ("POST", "/api/guide", {"json": {**ids, "paste_in_mix": True}}),
        ("POST", "/api/checkins", {"data": {**ids, "seed": 1}, "files": photo}),
        ("POST", "/api/step-checks", {"data": {**ids, "step": "s"}, "files": {**photo, "expected": ("e.jpg", b"x", "image/jpeg")}}),
        ("POST", "/api/mix-checks", {"data": {**ids, "band": 0}, "files": photo}),
        ("POST", "/api/questions", {"json": {**ids, "question": "Why?"}}),
    ]
    for method, path, options in attempts:
        answer = browser.request(method, path, **options)
        assert answer.status_code == 403, f"{method} {path}: {answer.status_code}"
        assert "example" in answer.json()["detail"]
    assert api_module.jobs == {}


def test_without_an_example_nothing_changes(example, monkeypatch):
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", "")
    assert example["other"].get(f"/api/pieces/{example['piece']}").status_code == 404
    assert example["other"].get("/api/pieces").json()["pieces"] == []


def test_the_photo_of_it_hung_comes_back_until_it_moves(example, monkeypatch):
    """So the example shows the photo Muse made in the real run. Made up here, with no model."""
    import time

    import cv2
    import numpy as np

    from impasto import wall
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", "")
    a, piece = example["owner"], example["piece"]
    placed = {"line": [[0, 0], [10, 0]], "length_cm": 10, "corners": [[1, 1], [5, 1], [5, 4], [1, 4]]}
    assert a.put(f"/api/pieces/{piece}/mockup", json=placed).status_code == 200
    monkeypatch.setattr(wall, "hang", lambda flat, painting: np.full((60, 80, 3), 120, np.uint8))
    png = ("x.png", cv2.imencode(".png", np.zeros((30, 20, 3), np.uint8))[1].tobytes(), "image/png")
    job = a.post(f"/api/pieces/{piece}/wall/hung", files={"mockup": png, "painting": png}, data={"of": "One"}).json()["job"]
    for _ in range(100):
        if a.get(f"/api/jobs/{job}").json()["status"] != "running":
            break
        time.sleep(0.05)
    url = a.get(f"/api/jobs/{job}").json()["result"]["url"]
    assert a.get(f"/api/pieces/{piece}/mockup").json()["mockup"]["hung"] == {"One": url}
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", piece)
    assert example["other"].get(f"/api/pieces/{piece}/mockup").json()["mockup"]["hung"] == {"One": url}
    assert example["other"].get(url).status_code == 200
    # Moved, the photo no longer shows where it hangs.
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", "")
    a.put(f"/api/pieces/{piece}/mockup", json={**placed, "corners": [[2, 1], [6, 1], [6, 4], [2, 4]]})
    assert "hung" not in a.get(f"/api/pieces/{piece}/mockup").json()["mockup"]
