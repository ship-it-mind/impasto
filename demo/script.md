# Impasto demo: script

3 minutes at most. Sultan narrates, and Yara speaks on camera. Live app on screen, cut with Yara's real photos and code-built animated graphics (type, diagrams). No generated scenes. Photos are in `demo/photos/` (kept out of git).

Format follows the Crossbeam demo (Built with Opus 4.6): hook line → who I am → the real person, in her own words → "I thought this would be easy" → simple on top → under the hood → proof → callback, then the last word goes to the real person.

Spine: one painting from idea to finished canvas, then two more she made with Impasto.

Status: second draft, telling the whole way from idea to canvas, not only mixing. **[confirm]** marks Yara's lines to check again. **[run]** marks numbers that come from the recorded example piece, still to record.

## First cut (2026-11-04)

`demo/cut/` is a Remotion project that renders the whole 3:00 to `demo/cut/out/impasto-demo.mp4` (`npm install`, then `npm run render`). Its `public/` folder holds copies of the photos and footage, and git ignores it, like `out/`.

- **Narration** is the user's cloned ElevenLabs voice (voice `NhYAwE75KjPavWcOGOQC`, Eleven v4; the earlier Multilingual v2 takes are kept in `demo/voiceover/el-v2/`), made line by line by `demo/cut/scripts/elevenlabs.py` from the script's wording and cached in `demo/voiceover/el/` (git-ignored). `scripts/voiceover.py --el` trims and levels it into `public/vo/`; every scene, subtitle and the music's turns are timed to its words. The film is 2:59.97. The key lives in `~/.config/elevenlabs/key`, outside the repo.
- **Yara's two parts** (§2 and §8) are placeholder cards for now. To add her clips, put them in `demo/cut/public/` and name them in `YARA` at the top of `src/Video.tsx`.
- **The idea scene** (box, dictation, brief) comes from the user's own recording of the live app on 2026-11-05, `demo/video/new-video/`, cut by `demo/cut/scripts/idea-clip.sh`. It's a fresh run with the same wall, reference and words, so the brief reads "Paint the shared reference exactly as-is for the office wall." and Colors and Mood & style show "From the picture". The rest of the app footage is unchanged.
- **App footage** comes from the example piece, recorded again locally with `make example`. That version says "What do you want to paint?", not "client", and shows no email or example banner. Two shots come from the cropped screen recording, `demo/video/recording-cropped.mp4`, because the example doesn't save them: the "make it warmer" change (0:39–0:48, cropped past the "Client's wall" toggle) and the plum bowl check (a still at 1:40.85).
- **Lines changed** so they match this run, where she asked for an exact copy of a painting she loved:
  - §3: "It learns from her own paintings" became "It works from the pictures she gives it, and it measures."
  - §4: "paints three concepts, steered by her own paintings" became "Yara says it out loud: this wall, and a painting she loves. Impasto turns what she said into a brief, and sizes the canvas to the wall."
  - §5: "Muse Image paints it, in her style" became "Muse Image paints it."
  - §6: The check-ins are labeled "Saved result", and the narration says the photos were taken while she painted, not that she checked in at the time.
  - §7: "It started as an idea in her head" became "It started as a picture she loved and an empty wall."

## 0. Hook (≈ 0:00–0:09), chosen 2026-11-04

`HookSketch` in `demo/cut/src/hooks.tsx`, picked from seven. The plan's own pencil lines draw themselves on a blank canvas, the bands fill with flat color in the order she paints them, then it dissolves into the plan's painting ("The plan") and then into her real finished canvas, straightened to the same frame ("Her canvas"). Then the Impasto wordmark.

> "Every painting starts in your head.
> Getting it onto the canvas is the hard part."

The hook is a second longer than before, so §5 (under the hood) is a second shorter to keep the film at 3:00.

## 1. Yara (≈ 0:09–0:29), locked

`IntroFull` in `demo/cut/src/intro-clips.tsx`, chosen 2026-11-04 from ten versions. Yara's own phone clips, full frame, cut on the words. They're cut from `demo/cut/intro/` (git-ignored) by `scripts/intro-clips.sh`. WhatsApp shrank them to 720p, so they're soft at full frame; the originals, sent as a Document, would make them sharp with one rerun of the script.

> *(Her fine brush on the gold band of the purple painting.)*
> "Hi, I'm Sultan. I've been building Impasto, a co-pilot for painters, to help my wife, Yara.
> *(The blank canvas and her supplies, the cat walking past; then the purple and gold painting finished, on the wall.)*
> About a year ago, Yara started painting, and it's become the thing she loves most."
> *(The knife laying white paste, the knife on the purple, the dark ridges up close.)*
> "She paints impasto: thick paint, laid on with a knife, so it stands up off the canvas.
> *(Black, red and white squeezed into the pink palette, then stirred, sped up.)*
> Every color is mixed by hand."

These clips are from her other paintings, not the one the rest of the film follows.

## 2. Yara, on camera (≈ 0:28–0:42)

> *(Yara, chest up, phone or webcam. Big name card: "Yara / painter".)*
> **Yara:** "I always see the painting in my head first. But getting it onto the canvas is a lot of guessing. **[confirm]**
> Will it look right on the wall? Which colors do I need, and how do I mix them? Where do I start? And halfway through, am I still on track?" **[confirm]**

She can say it in her own way. Her questions are the stops section 4 walks through, in the same order.

## 3. "I thought this would be easy" (≈ 0:46–1:04), chosen 2026-11-04

`EasyChatAll` in `demo/cut/src/easy.tsx`: the whole section as one chat on paper, picked over a pan across a ridge photo.

> *(A prompt types itself, a shortened version of the real Day 1 prompt. Three confident replies come back: an idea, the real Day 1 "words alone" picture, three color chips. On "I was wrong." it all goes grey.)*
> **Sultan:** "I thought AI could do this easily. Models write ideas, paint pictures, name colors. I was wrong."
> *(The chat scrolls on, tagged "Day 1 test". Two of her paintings go in with "Make a new one in the same style, palette and knife texture." The generic texture comes back.)*
> "Ask one to paint her idea, and you get generic texture, nothing like hers."
> *("Find the sage green band and the cream band in her painting." Both: nothing found. Then a close-up of her ridges, the same cream measured in light, `#e5dccb`, and in shadow, `#a39b8b`.)*
> "Ask it to find 'sage' or 'cream' in her painting, and it finds nothing.
> And every knife ridge casts a shadow that changes the color it sees."
> *(Hard cut to black: "So Impasto doesn't guess.")*
> "It works from the pictures she gives it, and it measures."

The Day 1 run and the sage and cream search are the real ones in `backend/spikes/output/`. The Day 1 run had a third reference, a painting she made after the app was done, so the chat leaves it out. The idea text, the color chips and the reply wording are written for the film; the models gave the images and the empty searches, not those words.

## 4. On top, it's simple (≈ 1:00–1:45)

A strip of five stops stays on screen the whole section, lighting up one at a time: **Idea · See it · Colors · Steps · Check-ins**. It shows the app covers the whole way from idea to canvas, not one part of it.

> *(Screen recording of the live app, in a soft frame.)*
> **Sultan:** "Here's how it works. It starts with the idea. Yara says it out loud, and Impasto paints three concepts, steered by her own paintings."
> *(Brief from dictation, then the Concepts screen.)* **[run]**: what she said.
> "She talks to it to change what she doesn't like, the whole thing or one part."
> *(Concepts chat, a tapped segment repainted.)*
> "Then she sees it: a photo of her wall, with the painting hung at its real size."
> *(Wall view, Make it look real.)*
> "Then the colors: every one she needs, how much to make, and how to mix it from the tubes she has."
> *(Recipe screen, ticking what she already has.)* **[run]**: e.g. "N colors · N g of paste".
> "Then the steps: every stage in order, with a picture of how the canvas should look after it."
> *(How to paint it, scrolling through the stages.)*

## 5. Check-ins: still on track, right after the steps (moved 2026-11-04)

A real check-in, recorded now, using one of her plum bowl photos (`mixes` 01, 05 or 06). It doesn't claim she used check-ins on this painting.

> *(The five-stop strip lights its last stop, then the bowl photo and the check-in screen.)*
> **Sultan:** "And while she paints, she checks in. A photo of a step, and it's compared with how that step should look.
> This is her plum mix, from while she was painting. Impasto finds the paint in the bowl and checks it against the recipe."
> *(The result big on screen, labeled "saved result".)* **[run]**: e.g. "add N g of …".

## 6. Under the hood, after the check-ins (chosen 2026-11-05)

`HoodMeasured` in `demo/cut/src/hood.tsx`: each model's real work on this piece, one at a time, then what Impasto measures itself (19.7 s).

> **Sultan:** "Underneath, four Meta models work together.
> Muse Voice Transcribe hears the idea. *(her voice as a waveform, turning into her words)*
> Muse Spark plans it, from the brief to every step. *(the brief card, then the eight steps)*
> SAM 3.1 finds the painting in her picture, and the canvas in every check-in photo. *(the painting's corners drawn on her picture, as SAM found them in the live run)*
> Muse Image cleans the picture, and repaints any part she wants changed. *(her picture wiping into the cleaned one)*
> The rest, Impasto measures itself: band areas become grams, and every color is mixed from her tubes." *(the band map, grams per band, 2.98 kg paint · 6.96 kg paste, one mix)*

SAM comes before Muse Image because that's the app's order: SAM finds the painting, then Muse Image cleans it. The old line "SAM finds each color band" was wrong for this run: the bands are read by Impasto's own code from the cleaned picture's colors.

## 7. The callback (4 s), changed 2026-11-05

The finished section with the two other paintings is cut: Yara's last clip already shows her finished canvas behind her, and the other two paintings never appear anywhere else. In its place, a 4 s callback to the hook: the picture she loved and her empty wall come together into her finished canvas.

> **Sultan:** "It started as a picture she loved and an empty wall. Now it's real."

The Impasto wordmark moved to the very end, after Yara's last word. The film is 2:58.

## 8. Yara's last word (≈ 2:48–3:00)

> *(Yara on camera, or her voice over the finished canvas.)*
> **Yara:** "I still do all the painting myself. But now I know where I'm going, from the first idea to the last layer." **[confirm]**

## Screen recording

`demo/video/WhatsApp Video 2026-11-04 at 4.31.29 PM.mp4`: 2:13, 1920×1080, no sound. Yara's account, one piece from brief to check-ins (piece `7b5c3677…`, "Curved bands in neutral earth tones", 115 × 135 cm, 6 bands). It is the same painting as the `stages` photos. Times are ±2 s.

| Time | What's on screen | Script use |
|---|---|---|
| 0:00–0:12 | Brief: wall photo and one Style reference attached, she dictates "This is the wall of my office room. I wanna paint this exact reference I shared with you, can you help with that?" | §4 Idea. **Live site still says "What did the client ask for?"** |
| 0:12–0:28 | Brief read back ("Exact copy of the shared reference for the office wall"), size asked, the canvas placed on the wall | §4 Idea |
| 0:28–0:34 | "The picture to paint": corners found on the reference photo | §4 Idea |
| 0:36–0:40 | Concepts: the painting hung on her wall at size. Toggle says **"Client's wall"** | §4 See it |
| 0:40–0:48 | One part selected, "make it warmer", Version 2 | §4 change one part |
| 0:52–0:56 | Modeling paste: underneath, or mixed into the color | §4 Colors |
| 0:56–1:12 | What you'll need: ticking what she has. **2.98 kg paint to mix, 6.96 kg modeling paste**, 7 tubes, 15% spare | §4 Colors, fills **[run]** |
| 1:12–1:16 | Mix each band, e.g. Deep Burgundy Brown: 2 Quinacridone Magenta : 1 Ultramarine Blue : 6 paste, 552 g + 1.29 kg paste | §4 Colors |
| 1:16–1:28 | How to paint it: 8 steps, a picture of the canvas after each | §4 Steps |
| 1:28–1:36 | Check-ins list | §6 |
| 1:36–1:40 | Rose paste checked as Olive Taupe, "Doesn't match ΔE 10.9". Looks like the wrong color was picked. **Skip** | — |
| 1:40–1:44 | Plum bowl checked as Deep Burgundy Brown: **"Doesn't match · ΔE 25.2, darker and duller than the mix. Mix in about 1 part Titanium White to 2 parts of it."** | §6, fills **[run]** |
| 1:44–1:56 | Step 06 Deep Burgundy Brown, her canvas photo: **"Needs work: Burgundy center band is in place but its right side sits on bare canvas where beige should be."** | §6 |
| 1:56–2:04 | Step 07 Dusty Rose: **"On track: Dusty Rose band is in place upper-middle with correct overlap over burgundy."** | §6 |
| 2:04–2:13 | Ask a question: she types "should i lay it vertical or ho…". No answer shown | maybe cut |

All check-in results are from Wed 4 Nov, 15:51–15:57, so they're labeled "saved result". The canvas photos are from after she painted, so the film must not say she checked in while painting.

Before using it:
- Done: `demo/video/recording-cropped.mp4` is the recording with its top 108 px cropped off, which removes the browser bar ("Relaunch to update") and her email.
- The brief and concepts parts (0:00–0:48) show "client" in four places: the heading, the placeholder, the "Client's wall" toggle, and older briefs in "Carry on with a piece". The code changed on Nov 2 (`256362f`), so the live deploy is older than that.
- What the recording shows doesn't match the script in §4: she asks for an exact copy of a reference photo, and she gets one picture, not "three concepts, steered by her own paintings". The hook and §7 ("an idea in her head") also don't fit.

## Rules

- Yara paints for love of it. No clients or commissions.
- Saved model results are labeled as saved.
- Don't mention how long a painting takes her.
- Yara's lines are drafted for her. She checks each one is true for her and can say it her own way.
