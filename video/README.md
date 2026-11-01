# The demo video

A 2:52 film, built as code with [Remotion](https://www.remotion.dev). The app footage, code, numbers, stand-in voice and music are in place. What's missing is the footage only a real studio can give: anything without a file shows a yellow **REAL FOOTAGE NEEDED** slate saying what to shoot.

## Add a shot

1. Save it as `public/footage/<slot>.mp4` (or `.mov`, or `.jpg`/`.png` for a photo).
2. Run `npm run render`. The film is at `out/impasto-demo.mp4`.

`npm run scan` lists what's still missing. `npm run studio` opens a live preview with a timeline.

A clip that's too long plays from its start and stops when the slot ends, so trim it first. One that's too short plays in slow motion to fill the slot. Sound is kept only where the table says so.

## Shot list

Shoot sideways (landscape), 1080p or better, in daylight from one side.

| Slot | When | Length | What | Sound |
|---|---|---|---|---|
| `knife` | 0:00 | 6 s | The opening shot. Low, from the side, so the ridges catch the light. One slow, confident drag of thick paste. | Keep the scrape |
| `tubes` | 0:14 | 2.8 s | Paint tubes on the table, a few picked up and put down. | None |
| `pot` | 0:17 | 2.8 s | A mix almost gone, knife scraping the last of it, a band half done. | None |
| `stage-marks` | 1:27 | 3.8 s | The canvas with its pencil lines. Same camera position for all three stages. | None |
| `stage-paste` | 1:31 | 3.8 s | The canvas with white paste on, before any color. Side light. | None |
| `stage-color` | 1:35 | 3.9 s | The canvas part-painted, with the same bands done as the plan picture beside it. | None |
| `mixing` | 1:39 | 3.5 s | Paint being mixed in the bowl, then a phone taking a picture of it, with a white rag or paper in shot. | Half |
| `whole-canvas` | 1:52 | 8 s | **Screen recording on the live site:** Check-ins, Whole canvas, upload a real photo of this canvas. It makes a SAM call, so it wasn't recorded for you. | None |
| `timelapse` | 2:00 | any | Fixed camera, whole canvas, across the days. Sped up to fill 16 s. No voice over it. | None |
| `wife-line` | 2:16 | 8 s | Your wife, in her own words, one honest sentence about using it. Unscripted. | Keep |
| `reveal-wall` | 2:30 | 9 s | **The shot the film is built on.** The finished canvas on that wall, from exactly where the wall photo was taken, with the cabinet on the left and the doorway on the right. Hold still. | None |
| `reveal-detail` | 2:37 | 3 s | Slow push or pan across the finished ridges, side light. | Some |

Line up `reveal-wall` by opening `public/stills/wall.jpg` on the phone and matching it. The mockup dissolves straight into this shot, so the closer the better.

## Your voice

The narration is a stand-in computer voice, so timing can be judged. Record each line in `src/vo.json` as `public/vo/01.wav`, `02.wav` and so on; each take replaces its line when it exists. `npm run scan` warns if a take is too long for its place. If you change the words, change them in `src/vo.json` too, because the captions come from it.

## Music

`public/music/bed.wav` is a quiet bed made by `scripts/make_bed.py` from sine waves, so there's nothing to license. To use your own, save it as `public/footage/music.mp3`.

## What's real in the app footage

`capture/record.mjs` drives the real app in a browser and records it. It ran on a copy of the database with a key that can't spend anything, and it blocks every model call.

- **Saved model results.** Where Muse Spark's or Muse Image's work appears, it's the saved result of the real Oct 31 run with the same request, and the film says so on screen. The recording stops before the button that would call the model, then cuts to that result.
- **The bowl reading is live.** That check makes no model call. It's a new reading of a real photo of the paint.
- **Speed.** Clips that play faster than real time show their speed in the corner.

To record again, start the app on a database copy as the top of `capture/record.mjs` says, then run `node capture/record.mjs [clip ...]`.

## Check before submitting

- No yellow slates are left, and `npm run scan` reports 12/12 and 12/12.
- `reveal-wall` really is the Plum Hollow plan shown in the film. If the canvas was painted from another plan, the app scenes need recording again on that piece.
- The two references seen in the brief scene are yours to show.
- Export is 1080p. Upload it, then open the link in a private window.
