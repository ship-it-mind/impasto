# Impasto Studio Co-pilot

A studio co-pilot for palette-knife / impasto painters. It goes from what you want to paint to a concept hanging on your wall, then paint recipes in grams, the steps to paint it, and photo check-ins while you paint.

Built for the Meta Global AI Developer Hackathon (Indie Developer track, theme: *Build for Your World*).

## Try it

**Live demo:** https://impasto.projectrunning.com. Sign-up is invite-only so outsiders can't spend the model credits; the invite link is in the submission.

**On your computer**, with no key and no sign-in. Needs [uv](https://docs.astral.sh/uv/) and Node 22+:

```sh
git clone https://github.com/ship-it-mind/impasto.git && cd impasto
make install
make example   # then open http://localhost:8000
```

If port 8000 is taken, use another: `PORT=8001 make example`.

To make pieces of your own, you need a Meta Model API key (and ffmpeg for dictation):

```sh
cp .env.example .env   # put your key in MODEL_API_KEY
make run               # http://localhost:8000
```

## The example piece

A real painting, recorded from the first brief to the last check-in. It opens first, every screen can be looked through, and nothing on it calls a model.

- **Brief:** what she wanted to paint, her wall photo, and the size recommended for it.
- **Concepts:** the painting hanging on her wall at that size.
- **Recipe:** grams of each color and of modeling paste, and what to buy.
- **Paint:** the steps in order, each with how the canvas should look after it.
- **Check-ins:** her photos of each step and of the mixes in the bowl, with what the app said about them, and a question she asked.

## Meta models used

| Model | Job in the app |
|---|---|
| Muse Spark | Turns what the painter wants into a brief, reads the painting's color bands, writes the mixing recipes and the steps to paint it, looks over photos of each step, and answers questions |
| SAM 3.1 | One mask per color band, for the area of each; finds the canvas in check-in photos and in a picture to paint as it is |
| Muse Image | Paints each concept from Spark's composition and colors, steered by reference photos, and cleans a picture to paint as it is |
| Muse Voice Transcribe | Turns dictation into text in the brief box |

## Built during the hackathon

All code in this repository was written during the hackathon (Oct 26 – Nov 4, 2026). The commit history is the record.

More on each screen, the model decisions, accounts, tests and deploying: [DETAILS.md](DETAILS.md).

## Credits

- Paint mixing is predicted with [Mixbox](https://github.com/scrtwpns/mixbox) by Šárka Sochorová and Ondřej Jamriška (Secret Weapons), licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) for non-commercial use.
- The SAM stream adapter is adapted from Meta's [meta-model-cookbook](https://github.com/meta-models/meta-model-cookbook) (MIT).

## Team

Ahmed Sultan, building solo.

Thanks to Yara, who paints impasto as a hobby, for trying each step on her own paintings and saying what was wrong.
