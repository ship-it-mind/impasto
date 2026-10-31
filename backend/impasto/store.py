"""Everything the app keeps, in one SQLite file: accounts, pieces, concept runs, recipes, check-ins and their pictures.

Records are the pipeline's JSON as is. A recipe is kept per concept and per mixing
settings, so going back to one never asks a model for it again.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

BACKEND = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("IMPASTO_DB", BACKEND / "output" / "impasto.db"))
# Where pieces lived before the database. Read once, to import them, and never changed.
OLD_FOLDERS = BACKEND / "output" / "api"
VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,  -- trimmed and lowercased
    password_hash TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS spent (  -- model use so far, against the caps in impasto.auth
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    credits INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pieces (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),  -- empty only for pieces from before accounts, until the first sign-up
    record TEXT NOT NULL,
    mockup TEXT,
    run TEXT,            -- the concepts on show
    chosen INTEGER,      -- the concept picked to paint, by its index in the run
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    piece TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
    record TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
    run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    concept INTEGER NOT NULL,
    without_tubes TEXT NOT NULL,
    paste_in_mix INTEGER NOT NULL,
    record TEXT NOT NULL,
    used_at REAL NOT NULL,
    PRIMARY KEY (run, concept, without_tubes, paste_in_mix)
);
CREATE TABLE IF NOT EXISTS guides (
    run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    concept INTEGER NOT NULL,
    without_tubes TEXT NOT NULL,
    paste_in_mix INTEGER NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (run, concept, without_tubes, paste_in_mix)
);
CREATE TABLE IF NOT EXISTS supplies (
    piece TEXT PRIMARY KEY REFERENCES pieces(id) ON DELETE CASCADE,
    record TEXT NOT NULL  -- what the painter already has for this piece
);
CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY,
    run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    concept INTEGER NOT NULL,
    record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS checkins_by_concept ON checkins (run, concept, id);
CREATE TABLE IF NOT EXISTS checks (  -- a photo of one guide step, or of mixes in the bowl
    id TEXT PRIMARY KEY,
    run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    concept INTEGER NOT NULL,
    kind TEXT NOT NULL,  -- step or mix
    record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS checks_by_concept ON checks (run, concept, id);
CREATE TABLE IF NOT EXISTS questions (  -- the check-ins chat
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    concept INTEGER NOT NULL,
    record TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
    owner TEXT NOT NULL,  -- the piece, run or check-in id
    name TEXT NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (owner, name)
);
"""

log = logging.getLogger("impasto.store")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """A connection for one transaction: API requests and jobs run on different threads."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if not any(column["name"] == "user_id" for column in db.execute("PRAGMA table_info(pieces)")):
            db.execute("ALTER TABLE pieces ADD COLUMN user_id TEXT REFERENCES users(id)")
        db.execute("CREATE INDEX IF NOT EXISTS pieces_by_user ON pieces (user_id, updated_at)")
    if version < 1:
        import_folders(OLD_FOLDERS)
    if version < VERSION:
        with connect() as db:
            db.execute(f"PRAGMA user_version = {VERSION}")


def dumps(record: dict) -> str:
    return json.dumps(record, ensure_ascii=False)


def tubes_key(without: list[str]) -> str:
    return dumps(sorted(without))


def put_images(db: sqlite3.Connection, owner: str, images: dict[str, bytes]) -> None:
    db.executemany(
        "INSERT OR REPLACE INTO images (owner, name, data) VALUES (?, ?, ?)",
        [(owner, name, data) for name, data in images.items()],
    )


def touch(db: sqlite3.Connection, piece_id: str, now: float | None = None) -> None:
    db.execute("UPDATE pieces SET updated_at = ? WHERE id = ?", (now or time.time(), piece_id))


def image(owner: str, name: str) -> bytes | None:
    with connect() as db:
        row = db.execute("SELECT data FROM images WHERE owner = ? AND name = ?", (owner, name)).fetchone()
    return row["data"] if row else None


# --- Accounts ----------------------------------------------------------------

def add_user(user_id: str, email: str, password_hash: str) -> bool:
    """A new account, or False if the email has one. The first account gets the pieces made before there were accounts."""
    try:
        with connect() as db:
            db.execute(
                "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (user_id, email, password_hash, time.time()),
            )
            if db.execute("SELECT count(*) FROM users").fetchone()[0] == 1:
                db.execute("UPDATE pieces SET user_id = ? WHERE user_id IS NULL", (user_id,))
    except sqlite3.IntegrityError:
        return False
    return True


def user_by_email(email: str) -> dict | None:
    with connect() as db:
        row = db.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def add_session(token_hash: str, user_id: str, expires_at: float) -> None:
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (time.time(),))
        db.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash, user_id, expires_at))


def session_user(token_hash: str) -> dict | None:
    """Whose session this is, while it lasts."""
    with connect() as db:
        row = db.execute(
            "SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id "
            "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
            (token_hash, time.time()),
        ).fetchone()
    return dict(row) if row else None


def end_session(token_hash: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def spend(user_id: str, credits: int, account_limit: int, total_limit: int) -> str | None:
    """Spend credits if both caps allow it. If not, nothing is spent, and which cap stopped it: account or total."""
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")  # two jobs starting together can't both take the last credits
        row = db.execute("SELECT credits FROM spent WHERE user_id = ?", (user_id,)).fetchone()
        if (row["credits"] if row else 0) + credits > account_limit:
            return "account"
        if db.execute("SELECT coalesce(sum(credits), 0) FROM spent").fetchone()[0] + credits > total_limit:
            return "total"
        db.execute(
            "INSERT INTO spent (user_id, credits) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET credits = credits + excluded.credits",
            (user_id, credits),
        )
    return None


# --- Pieces ------------------------------------------------------------------

def piece_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "record": json.loads(row["record"]), "mockup": json.loads(row["mockup"]) if row["mockup"] else None,
        "run": row["run"], "chosen": row["chosen"], "updated_at": row["updated_at"],
    }


def piece(piece_id: str, user_id: str) -> dict | None:
    """A piece, if it's this user's."""
    with connect() as db:
        row = db.execute("SELECT * FROM pieces WHERE id = ? AND user_id = ?", (piece_id, user_id)).fetchone()
    return piece_row(row) if row else None


def pieces(user_id: str) -> list[dict]:
    """Every piece of this user's, latest first."""
    with connect() as db:
        return [piece_row(row) for row in db.execute("SELECT * FROM pieces WHERE user_id = ? ORDER BY updated_at DESC", (user_id,))]


def add_piece(piece_id: str, user_id: str, record: dict, images: dict[str, bytes]) -> None:
    now = time.time()
    with connect() as db:
        db.execute(
            "INSERT INTO pieces (id, user_id, record, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (piece_id, user_id, dumps(record), now, now),
        )
        put_images(db, piece_id, images)


def save_piece(piece_id: str, record: dict) -> None:
    with connect() as db:
        db.execute("UPDATE pieces SET record = ? WHERE id = ?", (dumps(record), piece_id))
        touch(db, piece_id)


def save_mockup(piece_id: str, mockup: dict) -> None:
    with connect() as db:
        db.execute("UPDATE pieces SET mockup = ? WHERE id = ?", (dumps(mockup), piece_id))
        touch(db, piece_id)


def choose(piece_id: str, concept: int) -> None:
    with connect() as db:
        db.execute("UPDATE pieces SET chosen = ? WHERE id = ?", (concept, piece_id))
        touch(db, piece_id)


# --- Concept runs ------------------------------------------------------------

def save_run(piece_id: str, run_id: str, record: dict, images: dict[str, bytes]) -> None:
    """A new set of concepts: it goes on show, with none of them chosen yet."""
    now = time.time()
    with connect() as db:
        db.execute("INSERT INTO runs (id, piece, record, created_at) VALUES (?, ?, ?, ?)", (run_id, piece_id, dumps(record), now))
        put_images(db, run_id, images)
        db.execute("UPDATE pieces SET run = ?, chosen = NULL WHERE id = ?", (run_id, piece_id))
        touch(db, piece_id, now)


def add_concept(piece_id: str, run_id: str, concept: dict, images: dict[str, bytes]) -> int:
    """A concept added to a run, as an edit of one of its concepts. Its index in the run, which nothing else changes."""
    with connect() as db:
        row = db.execute("SELECT record FROM runs WHERE id = ? AND piece = ?", (run_id, piece_id)).fetchone()
        record = json.loads(row["record"])
        record["concepts"].append(concept)
        db.execute("UPDATE runs SET record = ? WHERE id = ?", (dumps(record), run_id))
        put_images(db, run_id, images)
        touch(db, piece_id)
    return len(record["concepts"]) - 1


def run(piece_id: str, run_id: str) -> dict | None:
    with connect() as db:
        row = db.execute("SELECT record FROM runs WHERE id = ? AND piece = ?", (run_id, piece_id)).fetchone()
    return json.loads(row["record"]) if row else None


# --- Recipes -----------------------------------------------------------------

def save_recipe(piece_id: str, run_id: str, concept: int, without: list[str], paste_in_mix: bool, record: dict) -> None:
    now = time.time()
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO recipes (run, concept, without_tubes, paste_in_mix, record, used_at) VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, concept, tubes_key(without), paste_in_mix, dumps(record), now),
        )
        touch(db, piece_id, now)


def recipe(run_id: str, concept: int, without: list[str], paste_in_mix: bool) -> dict | None:
    """The recipe already made for these settings, if any. Asking for it makes it the concept's latest."""
    where = (run_id, concept, tubes_key(without), paste_in_mix)
    with connect() as db:
        row = db.execute(
            "SELECT record FROM recipes WHERE run = ? AND concept = ? AND without_tubes = ? AND paste_in_mix = ?", where,
        ).fetchone()
        if row:
            db.execute(
                "UPDATE recipes SET used_at = ? WHERE run = ? AND concept = ? AND without_tubes = ? AND paste_in_mix = ?",
                (time.time(), *where),
            )
    return json.loads(row["record"]) if row else None


def latest_recipe(run_id: str, concept: int) -> dict | None:
    """The recipe last used for this concept, whatever its settings."""
    with connect() as db:
        row = db.execute(
            "SELECT record FROM recipes WHERE run = ? AND concept = ? ORDER BY used_at DESC LIMIT 1", (run_id, concept),
        ).fetchone()
    return json.loads(row["record"]) if row else None


# --- Painting guides and supplies --------------------------------------------

def save_guide(piece_id: str, run_id: str, concept: int, without: list[str], paste_in_mix: bool, record: dict) -> None:
    with connect() as db:
        db.execute(
            "INSERT OR REPLACE INTO guides (run, concept, without_tubes, paste_in_mix, record) VALUES (?, ?, ?, ?, ?)",
            (run_id, concept, tubes_key(without), paste_in_mix, dumps(record)),
        )
        touch(db, piece_id)


def guide(run_id: str, concept: int, without: list[str], paste_in_mix: bool) -> dict | None:
    with connect() as db:
        row = db.execute(
            "SELECT record FROM guides WHERE run = ? AND concept = ? AND without_tubes = ? AND paste_in_mix = ?",
            (run_id, concept, tubes_key(without), paste_in_mix),
        ).fetchone()
    return json.loads(row["record"]) if row else None


def save_supplies(piece_id: str, have: dict) -> None:
    with connect() as db:
        db.execute("INSERT OR REPLACE INTO supplies (piece, record) VALUES (?, ?)", (piece_id, dumps(have)))


def supplies(piece_id: str) -> dict:
    with connect() as db:
        row = db.execute("SELECT record FROM supplies WHERE piece = ?", (piece_id,)).fetchone()
    return json.loads(row["record"]) if row else {}


# --- Check-ins ---------------------------------------------------------------

def save_checkin(piece_id: str, checkin_id: str, run_id: str, concept: int, record: dict, images: dict[str, bytes]) -> None:
    with connect() as db:
        db.execute("INSERT INTO checkins (id, run, concept, record) VALUES (?, ?, ?, ?)", (checkin_id, run_id, concept, dumps(record)))
        put_images(db, checkin_id, images)
        touch(db, piece_id)


def checkins(run_id: str, concept: int) -> list[tuple[str, dict]]:
    """Every check-in on one concept as (id, record), oldest first: ids start with the time."""
    with connect() as db:
        rows = db.execute("SELECT id, record FROM checkins WHERE run = ? AND concept = ? ORDER BY id", (run_id, concept)).fetchall()
    return [(row["id"], json.loads(row["record"])) for row in rows]


def has_checkin(checkin_id: str, run_id: str, concept: int) -> bool:
    with connect() as db:
        return db.execute("SELECT 1 FROM checkins WHERE id = ? AND run = ? AND concept = ?", (checkin_id, run_id, concept)).fetchone() is not None


def checkin_count(run_id: str, concept: int) -> int:
    with connect() as db:
        return db.execute("SELECT count(*) FROM checkins WHERE run = ? AND concept = ?", (run_id, concept)).fetchone()[0]


def save_check(piece_id: str, check_id: str, run_id: str, concept: int, kind: str, record: dict, images: dict[str, bytes]) -> None:
    with connect() as db:
        db.execute(
            "INSERT INTO checks (id, run, concept, kind, record) VALUES (?, ?, ?, ?, ?)",
            (check_id, run_id, concept, kind, dumps(record)),
        )
        put_images(db, check_id, images)
        touch(db, piece_id)


def checks(run_id: str, concept: int, kind: str) -> list[tuple[str, dict]]:
    """Every check of this kind on one concept as (id, record), oldest first: ids start with the time."""
    with connect() as db:
        rows = db.execute(
            "SELECT id, record FROM checks WHERE run = ? AND concept = ? AND kind = ? ORDER BY id", (run_id, concept, kind),
        ).fetchall()
    return [(row["id"], json.loads(row["record"])) for row in rows]


def has_check(check_id: str, run_id: str, concept: int) -> bool:
    with connect() as db:
        return db.execute("SELECT 1 FROM checks WHERE id = ? AND run = ? AND concept = ?", (check_id, run_id, concept)).fetchone() is not None


def save_question(piece_id: str, run_id: str, concept: int, record: dict) -> None:
    with connect() as db:
        db.execute("INSERT INTO questions (run, concept, record) VALUES (?, ?, ?)", (run_id, concept, dumps(record)))
        touch(db, piece_id)


def questions(run_id: str, concept: int) -> list[dict]:
    """The chat on one concept, oldest first."""
    with connect() as db:
        rows = db.execute("SELECT record FROM questions WHERE run = ? AND concept = ? ORDER BY id", (run_id, concept)).fetchall()
    return [json.loads(row["record"]) for row in rows]


# --- The old folders ---------------------------------------------------------

def import_folders(root: Path) -> None:
    """Bring in the pieces kept as folders before the database. The folders themselves are left alone."""
    for path in sorted(root.glob("*/brief.json")):
        try:
            import_piece(path.parent)
        except (OSError, ValueError, KeyError, sqlite3.Error):
            log.exception("Couldn't import %s", path.parent)


def only(folder: Path, pattern: str) -> dict[str, bytes]:
    return {path.name: path.read_bytes() for path in sorted(folder.glob(pattern))}


def import_piece(folder: Path) -> None:
    piece_id = folder.name
    with connect() as db:
        if db.execute("SELECT 1 FROM pieces WHERE id = ?", (piece_id,)).fetchone():
            return
        record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
        wall = Path(record["wall_photo"]).name if record.get("wall_photo") else None
        record["wall_photo"] = wall if wall and (folder / wall).is_file() else None
        made = (folder / "brief.json").stat().st_mtime
        mockup = folder / "mockup.json"
        db.execute(
            "INSERT INTO pieces (id, record, mockup, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (piece_id, dumps(record), mockup.read_text(encoding="utf-8") if mockup.is_file() else None, made, made),
        )
        if record["wall_photo"]:
            put_images(db, piece_id, only(folder, record["wall_photo"]))

        # The run a piece reopened at: the latest with a recipe, and that recipe's concept; else the latest run.
        current, chosen, chosen_at, updated = None, None, 0.0, made
        for run_folder in sorted((r for r in folder.glob("concepts-*") if (r / "concepts.json").is_file()), key=lambda r: r.stat().st_mtime):
            run_id, run_at = run_folder.name, (run_folder / "concepts.json").stat().st_mtime
            db.execute(
                "INSERT INTO runs (id, piece, record, created_at) VALUES (?, ?, ?, ?)",
                (run_id, piece_id, (run_folder / "concepts.json").read_text(encoding="utf-8"), run_at),
            )
            put_images(db, run_id, only(run_folder, "concept-*-*.png") | only(run_folder, "reference-*"))
            updated = max(updated, run_at)
            if chosen is None:
                current = run_id
            for path in run_folder.glob("recipe-*.json"):
                concept, used_at = int(path.stem.split("-")[1]) - 1, path.stat().st_mtime
                recipe_record = json.loads(path.read_text(encoding="utf-8"))
                mixing = recipe_record["mixing"]
                db.execute(
                    "INSERT INTO recipes (run, concept, without_tubes, paste_in_mix, record, used_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (run_id, concept, tubes_key(mixing["without"]), mixing["paste_in_mix"], dumps(recipe_record), used_at),
                )
                updated = max(updated, used_at)
                if used_at >= chosen_at:
                    current, chosen, chosen_at = run_id, concept, used_at
            for path in sorted(run_folder.glob("checkins/concept-*/*/checkin.json")):
                concept = int(path.parent.parent.name.split("-")[1]) - 1
                checkin = json.loads(path.read_text(encoding="utf-8"))
                checkin.pop("photo", None)
                checkin.pop("concept", None)
                db.execute(
                    "INSERT INTO checkins (id, run, concept, record) VALUES (?, ?, ?, ?)",
                    (path.parent.name, run_id, concept, dumps(checkin)),
                )
                put_images(db, path.parent.name, only(path.parent, "photo.*") | only(path.parent, "progress.png") | only(path.parent, "rectified.png"))
                updated = max(updated, path.stat().st_mtime)
        db.execute("UPDATE pieces SET run = ?, chosen = ?, updated_at = ? WHERE id = ?", (current, chosen, updated, piece_id))
