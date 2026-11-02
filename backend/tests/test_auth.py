"""Accounts, that only the invited get one, and that one user can't reach another's pieces, pictures or jobs."""

import re
import sqlite3
import time
import uuid

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from impasto import api as api_module
from impasto import auth, store
from impasto.api import app

PASSWORD = "correct horse battery"
INVITE = "test-invite"
PUBLIC_ROUTES = {"/api/auth/me", "/api/auth/signup", "/api/auth/signin", "/api/auth/signout"}


@pytest.fixture(autouse=True)
def empty_database():
    with store.connect() as db:
        for table in ("images", "pieces", "sessions", "users"):
            db.execute(f"DELETE FROM {table}")
    auth.failed_signins.clear()
    auth.signups.clear()
    api_module.jobs.clear()


def client() -> TestClient:
    return TestClient(app)


def details(email: str, password: str = PASSWORD, invite: str = INVITE) -> dict:
    return {"email": email, "password": password, "invite": invite}


def signed_up(email: str) -> TestClient:
    browser = client()
    assert browser.post("/api/auth/signup", json=details(email)).status_code == 200
    return browser


def user_id(browser: TestClient) -> str:
    return browser.get("/api/auth/me").json()["user"]["id"]


def seeded_piece(owner: str) -> dict:
    """A piece with a concept run, a check-in and a check, made without asking a model."""
    piece, run = uuid.uuid4().hex, f"concepts-{uuid.uuid4().hex[:8]}"
    checkin, check = f"20261101T120000Z-{uuid.uuid4().hex[:4]}", f"20261101T120001Z-{uuid.uuid4().hex[:4]}"
    record = {"transcript": "A piece", "wall_photo": "wall.jpg", "warnings": [], "answers": [],
              "brief": {"summary": "A piece", "piece": {"width_cm": 100, "height_cm": 80}, "room": {"wall_width_cm": None}}}
    store.add_piece(piece, owner, record, {"wall.jpg": b"wall"})
    drafted = {"style": {}, "canvas_px": [100, 80], "mixing": {"without": [], "paste_in_mix": False},
               "concepts": [{"title": "One", "bands": [{"name": "A", "hex": "#123456", "relief": "thin"}],
                             "layout": {"image": "concept-1-muse.png", "map": "concept-1-layout.png", "shares": [1.0]}}]}
    store.save_run(piece, run, drafted, {"concept-1-muse.png": b"painting", "concept-1-layout.png": b"map"})
    store.save_checkin(piece, checkin, run, 0, {"taken_at": "x", "coverage": 0, "bands": [], "summary": "", "warnings": []}, {"progress.png": b"secret-progress"})
    store.save_check(piece, check, run, 0, "mix", {"taken_at": "x", "paste_in_mix": False}, {"photo.jpg": b"secret-photo"})
    return {"piece": piece, "run": run, "checkin": checkin, "check": check}


def test_every_route_but_signing_in_needs_a_user():
    paths = app.openapi()["paths"]
    assert len(paths) > 25
    assert PUBLIC_ROUTES <= set(paths)
    anonymous = client()
    for template, methods in paths.items():
        if template in PUBLIC_ROUTES:
            continue
        path = re.sub(r"{[^}]+}", "1", template)
        for method in methods:
            assert anonymous.request(method, path).status_code == 401, f"{method} {path}"


def test_sign_up_starts_a_session_in_a_protected_cookie():
    browser = client()
    answer = browser.post("/api/auth/signup", json=details("  Painter@Example.COM "))
    assert answer.status_code == 200
    assert answer.json()["user"]["email"] == "painter@example.com"
    cookie = answer.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "max-age=" in cookie and "secure" not in cookie
    assert browser.get("/api/auth/me").json()["user"]["email"] == "painter@example.com"
    assert browser.get("/api/pieces").status_code == 200


def test_the_cookie_is_secure_on_https():
    answer = TestClient(app, base_url="https://impasto.test").post("/api/auth/signup", json=details("a@example.com"))
    assert "secure" in answer.headers["set-cookie"].lower()


def test_neither_the_password_nor_the_session_is_stored_as_is():
    browser = signed_up("a@example.com")
    token = browser.cookies[auth.COOKIE]
    with store.connect() as db:
        stored = db.execute("SELECT password_hash FROM users").fetchone()[0]
        session = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
    assert stored.startswith("$argon2id$") and PASSWORD not in stored
    assert session != token


@pytest.mark.parametrize("email, password", [
    ("not-an-email", PASSWORD),
    ("a@b", PASSWORD),
    ("a@example.com", "short"),
    ("a@example.com", "x" * (auth.MAX_PASSWORD_CHARS + 1)),
    ("x" * 300 + "@example.com", PASSWORD),
])
def test_sign_up_refuses_bad_details(email, password):
    answer = client().post("/api/auth/signup", json=details(email, password))
    assert answer.status_code == 422
    assert isinstance(answer.json()["detail"], str)


def test_an_email_has_one_account_whatever_its_case():
    signed_up("a@example.com")
    answer = client().post("/api/auth/signup", json=details("A@EXAMPLE.com"))
    assert answer.status_code == 409


@pytest.mark.parametrize("invite", ["", "wrong", "test-invite-and-more"])
def test_sign_up_takes_the_invite_code(invite):
    answer = client().post("/api/auth/signup", json=details("a@example.com", invite=invite))
    assert answer.status_code == 403
    assert "set-cookie" not in answer.headers
    assert store.user_by_email("a@example.com") is None


def test_without_a_code_set_nobody_can_sign_up(monkeypatch):
    monkeypatch.delenv("IMPASTO_INVITE_CODE")
    assert client().post("/api/auth/signup", json=details("a@example.com", invite="")).status_code == 403
    assert client().post("/api/auth/signup", json=details("a@example.com", invite="anything")).status_code == 403


def test_the_invite_code_cant_be_guessed_by_trying():
    browser = client()
    for i in range(auth.signups.limit):
        assert browser.post("/api/auth/signup", json=details("a@example.com", invite=f"guess-{i}")).status_code == 403
    assert browser.post("/api/auth/signup", json=details("a@example.com")).status_code == 429


def test_without_the_code_it_doesnt_say_who_has_an_account():
    signed_up("a@example.com")
    assert client().post("/api/auth/signup", json=details("a@example.com", invite="wrong")).status_code == 403


def test_sign_in_with_the_right_password():
    signed_up("a@example.com")
    browser = client()
    assert browser.post("/api/auth/signin", json={"email": "A@example.com", "password": PASSWORD}).status_code == 200
    assert browser.get("/api/auth/me").json()["user"]["email"] == "a@example.com"


def test_a_wrong_password_and_an_unknown_email_get_the_same_answer():
    signed_up("a@example.com")
    wrong = client().post("/api/auth/signin", json={"email": "a@example.com", "password": "wrong password"})
    unknown = client().post("/api/auth/signin", json={"email": "nobody@example.com", "password": PASSWORD})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert "set-cookie" not in wrong.headers


def test_too_many_wrong_passwords_stop_even_the_right_one():
    signed_up("a@example.com")
    browser = client()
    for _ in range(auth.failed_signins.limit):
        assert browser.post("/api/auth/signin", json={"email": "a@example.com", "password": "wrong password"}).status_code == 401
    assert browser.post("/api/auth/signin", json={"email": "a@example.com", "password": PASSWORD}).status_code == 429


def test_sign_in_succeeding_forgets_the_failures():
    signed_up("a@example.com")
    browser = client()
    for _ in range(auth.failed_signins.limit - 1):
        browser.post("/api/auth/signin", json={"email": "a@example.com", "password": "wrong password"})
    assert browser.post("/api/auth/signin", json={"email": "a@example.com", "password": PASSWORD}).status_code == 200
    assert browser.post("/api/auth/signin", json={"email": "a@example.com", "password": "wrong password"}).status_code == 401


def test_too_many_sign_ups_are_refused():
    browser = client()
    for i in range(auth.signups.limit):
        assert browser.post("/api/auth/signup", json=details(f"a{i}@example.com")).status_code == 200
    assert browser.post("/api/auth/signup", json=details("more@example.com")).status_code == 429


def test_sign_out_ends_the_session_itself():
    browser = signed_up("a@example.com")
    token = browser.cookies[auth.COOKIE]
    assert browser.post("/api/auth/signout").status_code == 200
    assert browser.get("/api/auth/me").json()["user"] is None
    assert browser.get("/api/pieces").status_code == 401
    stolen = client()
    stolen.cookies.set(auth.COOKIE, token)
    assert stolen.get("/api/pieces").status_code == 401


def test_an_expired_session_no_longer_works():
    browser = signed_up("a@example.com")
    with store.connect() as db:
        db.execute("UPDATE sessions SET expires_at = ?", (time.time() - 1,))
    assert browser.get("/api/pieces").status_code == 401


def test_a_made_up_session_gets_nowhere():
    browser = client()
    browser.cookies.set(auth.COOKIE, "made-up")
    assert browser.get("/api/pieces").status_code == 401


def test_a_user_lists_only_their_own_pieces():
    a, b = signed_up("a@example.com"), signed_up("b@example.com")
    mine = seeded_piece(user_id(a))
    seeded_piece(user_id(b))
    assert [p["id"] for p in a.get("/api/pieces").json()["pieces"]] == [mine["piece"]]
    assert len(b.get("/api/pieces").json()["pieces"]) == 1


def test_a_user_can_read_their_own_piece_and_its_pictures():
    a = signed_up("a@example.com")
    s = seeded_piece(user_id(a))
    assert a.get(f"/api/pieces/{s['piece']}").status_code == 200
    answer = a.get(f"/api/pieces/{s['piece']}/wall")
    assert answer.content == b"wall"
    assert answer.headers["cache-control"].startswith("private")
    assert a.get(f"/api/concepts/{s['piece']}/{s['run']}/concept-1-muse.png").content == b"painting"
    assert a.get(f"/api/checkins/{s['piece']}/{s['run']}/0/{s['checkin']}/progress.png").content == b"secret-progress"
    assert a.get(f"/api/checks/{s['piece']}/{s['run']}/0/{s['check']}/photo.jpg").content == b"secret-photo"


def test_another_users_piece_looks_like_it_does_not_exist():
    a, b = signed_up("a@example.com"), signed_up("b@example.com")
    s = seeded_piece(user_id(a))
    piece, run = s["piece"], s["run"]
    ids = {"brief_id": piece, "run": run, "concept": 0}
    photo = {"photo": ("p.jpg", b"x", "image/jpeg")}
    attempts = [
        ("GET", f"/api/pieces/{piece}", {}),
        ("GET", f"/api/pieces/{piece}/wall", {}),
        ("GET", f"/api/pieces/{piece}/mockup", {}),
        ("POST", f"/api/pieces/{piece}/wall/hung", {"files": {"mockup": ("m.png", b"x", "image/png"), "painting": ("p.png", b"x", "image/png")}}),
        ("GET", f"/api/pieces/{piece}/wall/hung/hung-0123456789ab.jpg", {}),
        ("PUT", f"/api/pieces/{piece}/mockup", {"json": {"line": [[0, 0], [1, 1]], "length_cm": 10, "corners": [[0, 0], [1, 0], [1, 1], [0, 1]]}}),
        ("PUT", f"/api/pieces/{piece}/choice", {"json": {"run": run, "concept": 0}}),
        ("GET", f"/api/pieces/{piece}/method", {"params": {"run": run, "concept": 0}}),
        ("GET", f"/api/pieces/{piece}/supplies", {"params": {"run": run, "concept": 0}}),
        ("PUT", f"/api/pieces/{piece}/supplies", {"json": {"have": {}}}),
        ("GET", f"/api/concepts/{piece}/{run}/concept-1-muse.png", {}),
        ("POST", "/api/concepts", {"data": {"brief_id": piece}}),
        ("POST", f"/api/concepts/{piece}/{run}/0/edit", {"json": {"message": "Bluer"}}),
        ("POST", "/api/recipe", {"json": {**ids, "shares": [1.0]}}),
        ("POST", "/api/guide", {"json": ids}),
        ("POST", "/api/checkins", {"data": {**ids, "seed": 1}, "files": photo}),
        ("GET", "/api/checkins", {"params": ids}),
        ("GET", f"/api/checkins/{piece}/{run}/0/{s['checkin']}/progress.png", {}),
        ("POST", "/api/step-checks", {"data": {**ids, "step": "s"}, "files": {**photo, "expected": ("e.jpg", b"x", "image/jpeg")}}),
        ("POST", "/api/mix-checks", {"data": {**ids, "band": 0}, "files": photo}),
        ("GET", "/api/checks", {"params": ids}),
        ("GET", f"/api/checks/{piece}/{run}/0/{s['check']}/photo.jpg", {}),
        ("POST", "/api/questions", {"json": {**ids, "question": "Why?"}}),
    ]
    for method, path, options in attempts:
        answer = b.request(method, path, **options)
        assert answer.status_code == 404, f"{method} {path}: {answer.status_code}"


def test_a_picture_cant_be_reached_through_your_own_piece():
    """Check-in pictures are stored by their own id, so asking through your own run must still check they're in it."""
    a, b = signed_up("a@example.com"), signed_up("b@example.com")
    theirs, mine = seeded_piece(user_id(a)), seeded_piece(user_id(b))
    base = f"{mine['piece']}/{mine['run']}/0"
    assert b.get(f"/api/checkins/{base}/{theirs['checkin']}/progress.png").status_code == 404
    assert b.get(f"/api/checks/{base}/{theirs['check']}/photo.jpg").status_code == 404
    assert b.get(f"/api/checkins/{mine['piece']}/{mine['run']}/1/{mine['checkin']}/progress.png").status_code == 404


def test_the_painting_hung_on_the_wall_is_kept_for_its_piece(monkeypatch):
    """Muse's photo of it hung, made up here, is stored with the piece and only its owner can fetch it."""
    from impasto import wall
    a, b = signed_up("a@example.com"), signed_up("b@example.com")
    piece = seeded_piece(user_id(a))["piece"]
    monkeypatch.setattr(wall, "hang", lambda flat, painting: np.full((60, 80, 3), 120, np.uint8))
    png = lambda h, w: ("x.png", cv2.imencode(".png", np.zeros((h, w, 3), np.uint8))[1].tobytes(), "image/png")  # noqa: E731
    job = a.post(f"/api/pieces/{piece}/wall/hung", files={"mockup": png(60, 80), "painting": png(30, 20)}).json()["job"]
    for _ in range(100):
        state = a.get(f"/api/jobs/{job}").json()
        if state["status"] != "running":
            break
        time.sleep(0.05)
    assert state["status"] == "done", state
    url = state["result"]["url"]
    picture = a.get(url)
    assert picture.status_code == 200 and picture.headers["content-type"] == "image/jpeg"
    assert b.get(url).status_code == 404
    unreadable = {"mockup": ("m.png", b"not a picture", "image/png"), "painting": png(30, 20)}
    assert a.post(f"/api/pieces/{piece}/wall/hung", files=unreadable).status_code == 415


def test_a_job_is_only_visible_to_who_started_it():
    a, b = signed_up("a@example.com"), signed_up("b@example.com")
    job = api_module.finished({"id": user_id(a)}, {"secret": 1})["job"]
    assert b.get(f"/api/jobs/{job}").status_code == 404
    answer = a.get(f"/api/jobs/{job}").json()
    assert answer["result"] == {"secret": 1}
    assert "user" not in answer


def test_the_first_account_gets_the_pieces_from_before_accounts():
    old = uuid.uuid4().hex
    with store.connect() as db:
        db.execute("INSERT INTO pieces (id, record, created_at, updated_at) VALUES (?, ?, 0, 0)",
                   (old, '{"brief": {"summary": "Old"}, "transcript": "t", "warnings": []}'))
    first, second = signed_up("first@example.com"), signed_up("second@example.com")
    assert [p["id"] for p in first.get("/api/pieces").json()["pieces"]] == [old]
    assert second.get("/api/pieces").json()["pieces"] == []


def test_a_database_from_before_accounts_is_brought_up_to_date(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE pieces (id TEXT PRIMARY KEY, record TEXT NOT NULL, mockup TEXT, run TEXT, chosen INTEGER, created_at REAL NOT NULL, updated_at REAL NOT NULL)")
    db.execute("INSERT INTO pieces (id, record, created_at, updated_at) VALUES ('old', '{}', 0, 0)")
    db.execute("PRAGMA user_version = 1")
    db.commit()
    db.close()
    imported = []
    monkeypatch.setattr(store, "DB_PATH", path)
    monkeypatch.setattr(store, "import_folders", imported.append)
    store.init()
    store.init()  # starting again changes nothing
    with store.connect() as migrated:
        assert migrated.execute("PRAGMA user_version").fetchone()[0] == store.VERSION
        assert migrated.execute("SELECT id, user_id FROM pieces").fetchone()[:] == ("old", None)
    assert imported == []  # the folders were imported back when it became version 1
