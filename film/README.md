# The film

A 3-minute motion-graphics film about Impasto, made entirely in code with [Remotion](https://www.remotion.dev) and WebGL. No footage needs shooting.

Everything on screen comes from the real run of the Plum Hollow piece: the request, the paintings, the band map, the recipes, the guide, the bowl reading and the app recordings. `scripts/extract.py` pulls them from `backend/output/impasto.db` read-only, and `scripts/scan.mjs` takes the commit log and code excerpts straight from the repo. The score (`audio/make_track.py`) is synthesised from nothing, so there's nothing to license.

`./render-final.sh` makes `out/impasto-film.mp4`. It needs a GPU, ffmpeg and uv, and takes about 15 minutes: it renders at 480 fps, then averages down to 60 for real motion blur. `public/captures` holds recordings made by `video/capture/record.mjs`. Stills, recordings and renders are git-ignored.
