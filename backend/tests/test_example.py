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


def test_a_piece_goes_to_the_repo_and_comes_back_as_the_example(example, tmp_path, monkeypatch):
    """Exported by its owner, loaded into another database by the next start: the same piece, nobody's, with its pictures."""
    import io
    import zipfile

    from impasto import example as examples
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", "")
    piece = example["piece"]
    assert example["other"].get(f"/api/pieces/{piece}/export").status_code == 404
    answer = example["owner"].get(f"/api/pieces/{piece}/export")
    assert answer.status_code == 200 and answer.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(answer.content)) as archive:
        examples.write({name: archive.read(name) for name in archive.namelist()}, tmp_path)
    with pytest.raises(ValueError):
        examples.write({"../outside.txt": b"x"}, tmp_path)

    with store.connect() as db:
        db.execute("DELETE FROM pieces")
        db.execute("DELETE FROM images")
        db.execute("DELETE FROM users")
    assert examples.load(tmp_path) == piece
    assert examples.load(tmp_path) == piece  # loading again adds nothing
    monkeypatch.setattr(api_module, "EXAMPLE_PIECE", piece)
    judge = signed_up("judge@example.com")  # the first account, which gets pieces from before accounts, but not this one
    assert store.any_piece(piece)["mockup"] is None and store.piece(piece, user_id(judge)) is None
    assert [p["id"] for p in judge.get("/api/pieces").json()["pieces"]] == [piece]
    assert judge.get(f"/api/concepts/{piece}/{example['run']}/concept-1-muse.png").content == b"painting"
    assert judge.get(f"/api/checkins/{piece}/{example['run']}/0/{example['checkin']}/progress.png").content == b"secret-progress"
    assert judge.get("/api/checks", params={"brief_id": piece, "run": example["run"], "concept": 0}).json()["mixes"]
    assert judge.get(f"/api/pieces/{piece}").json()["recipe"] == RECIPE


@pytest.fixture
def fresh_clone(example, monkeypatch):
    """Run as a judge runs a fresh clone: no model key and no invite code, so nobody can sign up or pay for a call."""
    other = user_id(example["other"])  # asked before: example only, everyone is the guest
    monkeypatch.delenv("IMPASTO_INVITE_CODE")
    monkeypatch.setenv("MODEL_API_KEY", "")
    return {**example, "other_id": other}


def test_a_fresh_clone_shows_the_example_without_signing_in(fresh_clone):
    from tests.test_auth import client
    guest, piece, run = client(), fresh_clone["piece"], fresh_clone["run"]
    ids = {"brief_id": piece, "run": run, "concept": 0}
    assert guest.get("/api/auth/me").json()["user"]["guest"] is True
    assert [p["id"] for p in guest.get("/api/pieces").json()["pieces"]] == [piece]
    assert guest.get(f"/api/pieces/{piece}").json()["recipe"] == RECIPE
    assert guest.get(f"/api/concepts/{piece}/{run}/concept-1-muse.png").content == b"painting"
    assert result(guest, guest.post("/api/recipe", json={**ids, "shares": [1.0]})) == RECIPE
    assert result(guest, guest.post("/api/guide", json=ids)) == GUIDE


def test_a_fresh_clone_starts_nothing_and_reaches_no_one_elses_piece(fresh_clone):
    from tests.test_auth import client
    guest = client()
    other = seeded_piece(fresh_clone["other_id"])["piece"]
    assert guest.get(f"/api/pieces/{other}").status_code == 404
    audio = {"audio": ("a.m4a", b"x", "audio/mp4")}
    for path, options in [("/api/brief", {"data": {"text": "A sea"}}), ("/api/transcribe", {"files": audio}),
                          ("/api/images/painting", {"files": {"picture": ("p.jpg", b"x", "image/jpeg")}})]:
        answer = guest.post(path, **options)
        assert answer.status_code == 403 and "README" in answer.json()["detail"], path
    assert guest.post("/api/questions", json={"brief_id": fresh_clone["piece"], "run": fresh_clone["run"], "concept": 0, "question": "Why?"}).status_code == 403
    assert api_module.jobs == {}


@pytest.mark.parametrize("key, invite", [("a-key", ""), ("", "a-code")])
def test_with_a_key_or_an_invite_code_everyone_signs_in(example, monkeypatch, key, invite):
    from tests.test_auth import client
    monkeypatch.setenv("MODEL_API_KEY", key)
    monkeypatch.setenv("IMPASTO_INVITE_CODE", invite)
    assert client().get("/api/auth/me").json() == {"user": None}
    assert client().get("/api/pieces").status_code == 401


def test_asked_for_by_the_makefile_example_mode_ignores_a_model_key(example, monkeypatch):
    from tests.test_auth import client
    monkeypatch.setenv("MODEL_API_KEY", "a-key")
    monkeypatch.setenv("IMPASTO_MODE", "example")
    assert client().get("/api/auth/me").json()["user"]["guest"] is True
    assert client().post("/api/brief", data={"text": "A sea"}).status_code == 403


def here():
    from fastapi.testclient import TestClient
    return TestClient(api_module.app, client=("127.0.0.1", 50000))


def test_local_mode_needs_no_sign_in_and_keeps_its_own_pieces(example, monkeypatch):
    from impasto import auth
    monkeypatch.setenv("IMPASTO_MODE", "local")
    me = here().get("/api/auth/me").json()["user"]
    assert me["local"] is True
    mine = seeded_piece(auth.LOCAL["id"])["piece"]
    listed = [(p["id"], p["example"]) for p in here().get("/api/pieces").json()["pieces"]]
    assert listed == [(example["piece"], True), (mine, False)]
    # Still nobody changes the example.
    assert here().put(f"/api/pieces/{example['piece']}/supplies", json={"have": {}}).status_code == 403


def test_local_mode_only_answers_this_computer(example, monkeypatch):
    from tests.test_auth import client
    monkeypatch.setenv("IMPASTO_MODE", "local")
    assert client().get("/api/pieces").status_code == 403
    assert client().get("/api/auth/me").status_code == 403
