"""The example piece, kept in the repo so the app shows it wherever it runs, with no database to copy and no model key.

    uv run python -m impasto.example export PIECE_ID   # from this machine's database into example/
    uv run python -m impasto.example unpack piece.zip  # a piece downloaded from the app into example/

To download one from the app, signed in as its owner, open /api/pieces/PIECE_ID/export.

example/piece.json holds the piece's rows as they are in the database, and example/images/OWNER/NAME its pictures.
On start, the app loads it into its database if it isn't there yet. A piece that's already there, like the original on
the live site, is left as it is: the bundle only adds what's missing.
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import sqlite3
import sys
import zipfile
from pathlib import Path

from impasto import store
from impasto.meta import REPO_ROOT

FOLDER = Path(os.environ.get("IMPASTO_EXAMPLE_DIR", REPO_ROOT / "example"))
# Each table a piece has rows in, and the column that ties a row to the piece or one of its runs.
BY_PIECE = {"pieces": "id", "runs": "piece", "supplies": "piece"}
BY_RUN = {"recipes": "run", "guides": "run", "checkins": "run", "checks": "run", "questions": "run"}
# Columns kept as JSON in the database: written out as JSON, so the bundle can be read and diffed.
JSON_COLUMNS = {"record", "mockup"}
# The only names a bundle has: anything else in a zip is refused, so unpacking can't write outside the folder.
BUNDLE_NAME = re.compile(r"^(piece\.json|images/[\w.-]+/[\w.-]+)$")


def bundle(piece_id: str) -> dict[str, bytes]:
    """The piece as files: piece.json, and images/OWNER/NAME for each picture of it, its runs, check-ins and checks."""
    with store.connect() as db:
        def rows(table: str, column: str, values: list[str]) -> list[dict]:
            marks = ",".join("?" * len(values))
            found = db.execute(f"SELECT * FROM {table} WHERE {column} IN ({marks})", values).fetchall() if values else []
            return [{key: json.loads(row[key]) if key in JSON_COLUMNS and row[key] else row[key] for key in row.keys()} for row in found]

        tables = {table: rows(table, column, [piece_id]) for table, column in BY_PIECE.items()}
        if not tables["pieces"]:
            raise ValueError(f"No piece {piece_id} in {store.DB_PATH}.")
        runs = [run["id"] for run in tables["runs"]]
        tables |= {table: rows(table, column, runs) for table, column in BY_RUN.items()}
        for row in tables["pieces"]:
            row["user_id"] = None  # whoever made it, it's nobody's in another database
        for row in tables["questions"]:
            del row["id"]  # numbered by the database it goes into
        owners = [piece_id, *runs, *(row["id"] for row in tables["checkins"]), *(row["id"] for row in tables["checks"])]
        marks = ",".join("?" * len(owners))
        images = db.execute(f"SELECT owner, name, data FROM images WHERE owner IN ({marks})", owners).fetchall()
    files = {"piece.json": json.dumps({"piece": piece_id, "tables": tables}, ensure_ascii=False, indent=1).encode()}
    files |= {f"images/{row['owner']}/{row['name']}": row["data"] for row in images}
    return files


def as_zip(piece_id: str) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as archive:  # the pictures are already compressed
        for name, data in bundle(piece_id).items():
            archive.writestr(name, data)
    return out.getvalue()


def write(files: dict[str, bytes], folder: Path = FOLDER) -> None:
    """Replace the example in the folder with these files, keeping anything else there, like its README."""
    if bad := [name for name in files if not BUNDLE_NAME.match(name) or ".." in name]:
        raise ValueError(f"Not part of a piece: {', '.join(bad[:3])}")
    for old in ("piece.json", "images"):
        path = folder / old
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
    for name, data in files.items():
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def load(folder: Path = FOLDER) -> str | None:
    """Put the example into the database if it isn't there, and say which piece it is. None when there's no example."""
    path = folder / "piece.json"
    if not path.is_file():
        return None
    saved = json.loads(path.read_text(encoding="utf-8"))
    piece_id = saved["piece"]
    store.UNCLAIMED.add(piece_id)
    with store.connect() as db:
        if db.execute("SELECT 1 FROM pieces WHERE id = ?", (piece_id,)).fetchone():
            return piece_id
        for table in ("pieces", *(t for t in BY_PIECE if t != "pieces"), *BY_RUN):
            for row in saved["tables"].get(table, []):
                values = {key: json.dumps(value, ensure_ascii=False) if key in JSON_COLUMNS and value is not None else value for key, value in row.items()}
                db.execute(f"INSERT INTO {table} ({', '.join(values)}) VALUES ({', '.join('?' * len(values))})", list(values.values()))
        images = folder / "images"
        if images.is_dir():
            db.executemany(
                "INSERT OR REPLACE INTO images (owner, name, data) VALUES (?, ?, ?)",
                [(owner.name, picture.name, picture.read_bytes()) for owner in images.iterdir() for picture in owner.iterdir()],
            )
    return piece_id


def main(argv: list[str]) -> None:
    if len(argv) == 2 and argv[0] == "export":
        store.init()
        write(bundle(argv[1]))
    elif len(argv) == 2 and argv[0] == "unpack":
        with zipfile.ZipFile(argv[1]) as archive:
            write({name: archive.read(name) for name in archive.namelist() if not name.endswith("/")})
    else:
        sys.exit(__doc__)
    print(f"The example is in {FOLDER}.")


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (ValueError, sqlite3.Error, zipfile.BadZipFile, OSError) as error:
        sys.exit(str(error))
