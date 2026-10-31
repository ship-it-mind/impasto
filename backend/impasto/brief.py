"""Client brief: a voice note or typed brief (+ a wall photo) → structured brief.

    uv run python -m impasto.brief --audio spikes/inputs/brief.ogg [--wall wall.jpg]
    uv run python -m impasto.brief --text spikes/inputs/brief.txt
    uv run python -m impasto.brief --answer "100 by 70 cm" output/brief/brief

Muse Voice Transcribe turns the note into a transcript; Muse Spark reads it
(and the wall photo, if given) into brief.json, which the concept generator
consumes. Spark only records what the client said or the photo shows. If the
piece size is missing it asks one clarifying question; answer it with
--answer on the same folder, which re-reads the brief without asking again.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from impasto.meta import client, data_url
from impasto.voice import transcribe

MODEL = "muse-spark-1.3"
OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "output" / "brief"

PROMPT = """You are the studio assistant of a palette-knife / impasto painter. A client has
described the piece they want. Turn it into a structured brief for the painter.

Rules:
- Record only what the client said{photo_rule}. Do not invent sizes or colors.
  Use null or an empty list when something was not mentioned.
- Spoken numbers become digits: "one twenty by eighty centimeters" is width 120, height 80;
  "two meters eighty" is 280 cm. Width is the horizontal side.
- palette.colors: every color the client wants, with an approximate hex for that color as a
  painter would mix it (muted if the client wants muted). palette.avoid: colors they ruled out.
- style: what they said about texture, shapes, composition or a past piece they liked, in short phrases.
- paint_as_is: true only if they explicitly ask for a picture to be painted as it is, as an exact copy or match
  ("paint this exactly", "copy this picture", "exactly like the photo"). Otherwise false, also when a picture is
  only inspiration or a style to follow ("something like this", "in this style").
- summary: one sentence a painter could read at a glance.
- clarifying_question: {question_rule}
{wall_fit_rule}
Client brief:
{transcript}
"""

QUESTION_RULE = (
    "if the piece's width or height is missing (and cannot be read from what they said), "
    "one short, friendly question asking for the size. Otherwise null. Never ask about anything else."
)
NO_QUESTION_RULE = "null. The client has already answered a follow-up question."
PHOTO_RULE = (
    " or what the wall photo clearly shows. From the photo, fill in room.wall_color_hex, "
    "room.lighting and room.notes (furniture, style, what hangs nearby); do not estimate "
    "the wall's size for room.wall_width_cm from the photo"
)
WALL_FIT_RULE = """- wall_fit: your own recommendation from the wall photo, and the one place you may estimate sizes:
  - visible_width_cm: how wide the wall is across the whole width of the photo, at the wall's distance,
    judged from things of known size (a door is about 200 cm tall, a sofa about 200 cm wide, a socket 8 cm).
  - width_cm, height_cm: the painting that would suit this wall best, in multiples of 5 cm. Keep to any shape
    the client asked for. Over furniture, about two thirds of its width usually looks right.
  - center_x, center_y: where the painting's center should hang, from 0 at the photo's top left to 1 at its bottom right.
  - reason: one short sentence saying why this size, naming what you judged the scale from.
"""
# A recommended painting smaller than this means the estimate went wrong.
MIN_CM = 5

NULLABLE_STRING = {"type": ["string", "null"]}
NULLABLE_NUMBER = {"type": ["number", "null"]}


def strict_object(properties: dict) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


BRIEF_PROPERTIES = {
    "summary": {"type": "string"},
    "piece": strict_object({
        "width_cm": NULLABLE_NUMBER,
        "height_cm": NULLABLE_NUMBER,
        "orientation": {"type": "string", "enum": ["landscape", "portrait", "square", "unspecified"]},
    }),
    "mood": {"type": "array", "items": {"type": "string"}},
    "palette": strict_object({
        "temperature": {"type": "string", "enum": ["warm", "cool", "neutral", "mixed", "unspecified"]},
        "intensity": {"type": "string", "enum": ["muted", "bright", "mixed", "unspecified"]},
        "colors": {
            "type": "array",
            "items": strict_object({"name": {"type": "string"}, "approx_hex": {"type": "string"}}),
        },
        "avoid": {"type": "array", "items": {"type": "string"}},
    }),
    "style": {"type": "array", "items": {"type": "string"}},
    "paint_as_is": {"type": "boolean"},
    "room": strict_object({
        "name": NULLABLE_STRING,
        "placement": NULLABLE_STRING,
        "wall_width_cm": NULLABLE_NUMBER,
        "wall_color_hex": NULLABLE_STRING,
        "lighting": NULLABLE_STRING,
        "notes": NULLABLE_STRING,
    }),
    "clarifying_question": NULLABLE_STRING,
}
WALL_FIT = strict_object({
    "visible_width_cm": {"type": "number"},
    "width_cm": {"type": "number"},
    "height_cm": {"type": "number"},
    "center_x": {"type": "number"},
    "center_y": {"type": "number"},
    "reason": {"type": "string"},
})


def brief_schema(wall: bool) -> dict:
    properties = {**BRIEF_PROPERTIES, "wall_fit": WALL_FIT} if wall else BRIEF_PROPERTIES
    return {"type": "json_schema", "json_schema": {"name": "client_brief", "schema": strict_object(properties)}}


def usable_fit(fit: dict | None) -> dict | None:
    """Spark's recommendation for the wall, or None if it isn't a size that could hang on what the photo shows."""
    if not fit or min(fit["width_cm"], fit["height_cm"]) < MIN_CM or max(fit["width_cm"], fit["height_cm"]) > fit["visible_width_cm"] * 2:
        return None
    if not (0 <= fit["center_x"] <= 1 and 0 <= fit["center_y"] <= 1):
        return None
    return fit


def set_size(brief: dict, width: float, height: float) -> dict:
    """The brief with the size the painter settled on, which answers any question about it."""
    orientation = "square" if width == height else "landscape" if width > height else "portrait"
    return {**brief, "piece": {"width_cm": width, "height_cm": height, "orientation": orientation}, "clarifying_question": None}


def with_answers(transcript: str, answers: list[dict]) -> str:
    lines = [transcript]
    for qa in answers:
        lines += ["", f"Follow-up question: {qa['question']}", f"Client's answer: {qa['answer']}"]
    return "\n".join(lines)


def structure(transcript: str, wall: Path | None = None, answers: list[dict] = ()) -> dict:
    prompt = PROMPT.format(
        photo_rule=PHOTO_RULE if wall else "",
        question_rule=NO_QUESTION_RULE if answers else QUESTION_RULE,
        wall_fit_rule=WALL_FIT_RULE if wall else "",
        transcript=with_answers(transcript, answers),
    )
    content: list[dict] = [{"type": "text", "text": prompt}]
    if wall:
        content.append({"type": "image_url", "image_url": {"url": data_url(wall)}})
    response = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": content}],
        response_format=brief_schema(bool(wall)),
    )
    brief = json.loads(response.choices[0].message.content)
    if wall:
        brief["wall_fit"] = usable_fit(brief["wall_fit"])

    piece = brief["piece"]
    if piece["width_cm"] and piece["height_cm"]:
        # The size decides orientation, whatever word the client used.
        width, height = piece["width_cm"], piece["height_cm"]
        piece["orientation"] = "square" if width == height else "landscape" if width > height else "portrait"
    if answers:
        # At most one question per brief.
        brief["clarifying_question"] = None
    return brief


def warnings(brief: dict) -> list[str]:
    found = []
    piece, room = brief["piece"], brief["room"]
    if not (piece["width_cm"] and piece["height_cm"]):
        found.append("Piece size is still missing.")
    elif room["wall_width_cm"] and piece["width_cm"] > room["wall_width_cm"]:
        found.append(f"The piece ({piece['width_cm']:g} cm) is wider than the wall ({room['wall_width_cm']:g} cm).")
    return found


def print_brief(record: dict) -> None:
    brief = record["brief"]
    piece, palette, room = brief["piece"], brief["palette"], brief["room"]
    size = (
        f"{piece['width_cm']:g} × {piece['height_cm']:g} cm"
        if piece["width_cm"] and piece["height_cm"] else "size unknown"
    )
    print(brief["summary"])
    print(f"\nPiece:   {size}, {piece['orientation']}")
    print(f"Mood:    {', '.join(brief['mood']) or '-'}")
    print(f"Palette: {palette['temperature']}, {palette['intensity']}; "
          + ", ".join(f"{c['name']} {c['approx_hex']}" for c in palette["colors"]))
    if palette["avoid"]:
        print(f"Avoid:   {', '.join(palette['avoid'])}")
    print(f"Style:   {', '.join(brief['style']) or '-'}")
    wall_width = f"wall {room['wall_width_cm']:g} cm wide" if room["wall_width_cm"] else None
    print("Room:    " + ", ".join(
        str(value) for value in (
            room["name"], room["placement"], wall_width, room["wall_color_hex"], room["lighting"], room["notes"]
        ) if value
    ))
    for warning in record["warnings"]:
        print(f"⚠️  {warning}")
    if brief["clarifying_question"]:
        print(f"\nQuestion for the client: {brief['clarifying_question']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--audio", type=Path, help="client voice note")
    source.add_argument("--text", type=Path, help="typed brief (.txt)")
    source.add_argument("--answer", nargs=2, metavar=("ANSWER", "FOLDER"),
                        help="the client's answer to the clarifying question in FOLDER/brief.json")
    parser.add_argument("--wall", type=Path, help="photo of the client's wall")
    parser.add_argument("--out", type=Path, help="output folder")
    args = parser.parse_args()

    if args.answer:
        answer, folder = args.answer[0], Path(args.answer[1])
        record = json.loads((folder / "brief.json").read_text(encoding="utf-8"))
        question = record["brief"]["clarifying_question"]
        if not question:
            parser.error(f"{folder / 'brief.json'} has no open question.")
        record["answers"].append({"question": question, "answer": answer})
        wall = Path(record["wall_photo"]) if record["wall_photo"] else None
    else:
        source_path = args.audio or args.text
        folder = args.out or OUTPUT_ROOT / source_path.stem
        transcript = transcribe(args.audio) if args.audio else args.text.read_text(encoding="utf-8").strip()
        wall = args.wall
        record = {
            "source": str(source_path),
            "transcript": transcript,
            "wall_photo": str(wall) if wall else None,
            "answers": [],
        }

    record["brief"] = structure(record["transcript"], wall, record["answers"])
    record["warnings"] = warnings(record["brief"])
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "brief.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print_brief(record)
    print(f"\nWrote {folder / 'brief.json'}")


if __name__ == "__main__":
    main()
