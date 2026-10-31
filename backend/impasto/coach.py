"""Spark at the easel: a look at a photo of one guide step, and answers to the painter's questions.

Both work from the plan as it stands: the recipe's numbers, the guide's stages and
what the check-ins have measured. Spark does not judge exact color from a step's
photo, since the light in it shifts every color: the mix check and the whole-canvas
check-in measure color, and Spark passes on what they found.
"""

from __future__ import annotations

import base64
import json
import mimetypes

from impasto.guide import MODEL, composition, paste_method, places
from impasto.meta import client

REVIEW_PROMPT = """You are looking over a palette-knife / impasto painter's shoulder at one step of one painting.
The first image is their photo of the canvas now. The second is how the canvas should look once this step is done.

The plan:
{plan}

The step to check: {title}
What it asks for:
{instructions}
{note}
First, does the photo show this painting? The second image's bands and their edges should line up with what's painted so far. If the layout plainly differs, such as other shapes or colors no band has, it may be another canvas or the wrong photo: the verdict is "unclear", the headline says what doesn't match, and to_fix is empty. Don't review it.

If it does, compare the photo with the step, and write for someone standing at the easel: short, direct, concrete.
Say where on the canvas you mean, by band name or position.
Look at what this step is about: where things sit, the edges, the coverage, the height and evenness of the relief, and marks or mud that shouldn't be there.
Work from later steps not being done is expected, never a fault. An unfinished step is not a fault either: say what's left.
Don't judge exact color: the light in the photo shifts it, and it's measured elsewhere. Do say so if a color is plainly in the wrong place.
Only mention what you can actually see. Pencil lines and white paste on a white canvas can be faint: if you can't make out what you need, the verdict is "unclear", and say what photo would settle it.

Write:
- verdict: "on_track", "needs_work" or "unclear".
- headline: one sentence, the main thing.
- looks_right: 0-2 short things that are right, only if they're worth saying.
- to_fix: 0-3 short instructions, most important first, each one thing to do. Empty if nothing needs fixing.
"""

REVIEW_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "step_review",
        "schema": {
            "type": "object",
            "properties": {
                "verdict": {"type": "string", "enum": ["on_track", "needs_work", "unclear"]},
                "headline": {"type": "string"},
                "looks_right": {"type": "array", "items": {"type": "string"}},
                "to_fix": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["verdict", "headline", "looks_right", "to_fix"],
            "additionalProperties": False,
        },
    },
}

CHAT_PROMPT = """You help a palette-knife / impasto painter with one painting, while they paint it. They are at the
easel with paint on their hands: answer the question first, in a few short sentences, and give steps only if they're
needed. Write plain text with no markdown. If the guide's wording didn't help, say it another way rather than repeating it.

Every amount and mix below is computed: use them as they are, and don't make up other numbers. Don't judge exact color
from a photo, since the light shifts it; point to the Color mixes or Whole canvas check, which measure it.
If you don't know something about this painting, say so. If they want the painting itself changed, that's the chat
on the Concepts screen.

The plan:
{plan}

What the check-ins have found so far:
{found}
{section}"""

# How much of the chat Spark gets back each time.
MAX_HISTORY = 12


def plan_text(concept: dict, recipe: dict, guide: dict, width_cm: float, height_cm: float) -> str:
    """The whole plan, as Spark needs it to talk about any part of it."""
    bands = recipe["bands"]
    lines = [
        f'"{concept["title"]}": {concept["idea"]}',
        f"Canvas: {width_cm:g} × {height_cm:g} cm. Composition: {composition(concept)}.",
        f"Modeling paste: {paste_method(recipe['mixing']['paste_in_mix'])}",
        f"Tubes on hand: {', '.join(recipe['mixing']['tubes'])}.",
        "Bands:",
    ]
    lines += [
        f"- {band['name']}: {band['card']['recipe_line']}. Mixes to {band['mix_hex']}. {band['level']} relief, "
        f"{round(band['area_cm2'])} cm², {round(band['paint_g'])} g paint and {round(band['paste_g'])} g paste."
        for band in bands
    ]
    if where := places(concept):
        lines.append(where.strip())
    lines.append("The steps, in order:")
    for number, step in enumerate(guide["steps"], start=1):
        wait = f" Then let it dry {step['wait']}." if step["wait"] else ""
        lines.append(f"{number}. {step['title']}: {' '.join(step['do'])}{wait}")
    return "\n".join(lines)


def picture(data: bytes, name: str) -> dict:
    media_type = mimetypes.guess_type(name)[0] or "image/jpeg"
    return {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{base64.b64encode(data).decode('ascii')}"}}


def review(step: dict, plan: str, photo: tuple[str, bytes], expected: tuple[str, bytes], note: str = "") -> dict:
    """Spark's look at one photo of this step, against how the canvas should look after it."""
    instructions = "\n".join(f"- {line}" for line in [*step["do"], *step["tips"]])
    prompt = REVIEW_PROMPT.format(plan=plan, title=step["title"], instructions=instructions, note=f"{note}\n" if note else "")
    response = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": [{"type": "text", "text": prompt}, picture(photo[1], photo[0]), picture(expected[1], expected[0])]}],
        response_format=REVIEW_SCHEMA,
    )
    return json.loads(response.choices[0].message.content)


def answer(plan: str, found: str, section: str, history: list[dict], question: str, photo: tuple[str, bytes] | None) -> str:
    """Spark's answer to one question, given the chat so far."""
    system = CHAT_PROMPT.format(plan=plan, found=found, section=section)
    messages: list[dict] = [{"role": "system", "content": system}]
    for turn in history[-MAX_HISTORY:]:
        messages += [{"role": "user", "content": turn["question"]}, {"role": "assistant", "content": turn["answer"]}]
    content: list[dict] = [{"type": "text", "text": question}]
    if photo:
        content.append(picture(photo[1], photo[0]))
    messages.append({"role": "user", "content": content})
    response = client().chat.completions.create(model=MODEL, messages=messages)
    return response.choices[0].message.content.strip()


def findings(steps: list[dict], step_checks: list[dict], mix_checks: list[dict], canvas_checks: list[dict]) -> str:
    """The latest result from each part of the check-ins, in a few lines for Spark."""
    lines = []
    if canvas_checks:
        latest = canvas_checks[-1]
        lines.append(f"Whole canvas, {latest['taken_at']}: " + " ".join(latest["summary"]))
    latest_step = {check["step"]: check for check in step_checks}
    lines += [
        f"{step['title']}, {latest_step[step['id']]['taken_at']}: {latest_step[step['id']]['review']['headline']}"
        for step in steps if step["id"] in latest_step
    ]
    latest_mix = {result["name"]: (check["taken_at"], result) for check in mix_checks for result in check["results"]}
    lines += [
        f"Mix of {name}, {taken_at}: ΔE {result['delta_e']} from the plan" + (f", {result['drift']}" if result["drift"] else "") + f". {' '.join(result['advice'])}"
        for name, (taken_at, result) in latest_mix.items()
    ]
    return "\n".join(lines) or "Nothing yet."
