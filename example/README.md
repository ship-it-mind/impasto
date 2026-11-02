# The example piece

A real piece, recorded from the first brief to the last check-in, that the app loads on start and shows to every account as the example. It needs no model key: nothing on it calls a model.

`piece.json` holds its rows from the database, and `images/` its pictures. To replace it, from `backend/`:

```sh
uv run python -m impasto.example export PIECE_ID   # from this machine's database
uv run python -m impasto.example unpack piece.zip  # a zip downloaded from /api/pieces/PIECE_ID/export, signed in as its owner
```
