# Impasto demo: script

3 minutes at most. Sultan narrates, and Yara speaks on camera. Live app on screen, cut with Yara's real photos and code-built animated graphics (type, diagrams). No generated scenes. Photos are in `demo/photos/` (kept out of git).

Format follows the Crossbeam demo (Built with Opus 4.6): hook line → who I am → the real person, in her own words → "I thought this would be easy" → simple on top → under the hood → proof → callback, then the last word goes to the real person.

Spine: one painting from idea to finished canvas, then two more she made with Impasto.

Status: full first draft. Yara's lines are confirmed as true for her. **[run]** marks numbers that come from the recorded example piece, still to record.

## 0. Hook (≈ 0:00–0:08)

> *(Animated type on a plain background, one line at a time. Then the Impasto wordmark.)*
> "Everyone thinks the hard part of painting is the painting.
> It's actually turning the idea in your head into something real."

## 1. Yara (≈ 0:08–0:28), locked

> *(Photo `stages` 00: the blank canvas, slow push in.)*
> "Hi, I'm Sultan. I've been building Impasto, a co-pilot for painters, to help my wife, Yara.
> About a year ago, Yara started painting, and it's become the thing she loves most."
> *(Photo `stages` 05: close-up of the ridges, slow pan.)*
> "She paints impasto: thick paint, laid on with a knife, so it stands up off the canvas. Every color is mixed by hand."

## 2. Yara, on camera (≈ 0:28–0:40)

> *(Yara, chest up, phone or webcam. Big name card: "Yara / painter".)*
> **Yara:** "I always see the painting in my head first. 
> But once I start mixing, I'm guessing. Which colors, how much of each, and will it even look right on the wall?"

She can say it in her own way; the three guesses (colors, amounts, the wall) are what sections 4 and 5 answer.

## 3. "I thought this would be easy" (≈ 0:40–1:02)

> *(Close-ups of her ridges, `stages` photos.)*
> **Sultan:** "I thought AI could do this easily. A model looks at a painting and names its colors. I was wrong."
> *(Animated type over the photo: `"sage" → 0 masks`, `"cream" → 0 masks`.)*
> "Ask a model to find 'sage' or 'cream' in her painting, and it finds nothing.
> Ask it to paint something new, and you get generic texture, nothing like hers.
> And every knife ridge casts a shadow that changes the color you measure."
> *(Hard cut to black, then type: "So Impasto doesn't guess.")*
> "So Impasto doesn't guess. It learns from her own paintings, and it measures."

Visual: the real Day 1 results from `backend/spikes/output/image/`, `text-only.webp` beside `with-refs.webp`, labeled "Day 1 test". No reruns.

## 4. On top, it's simple (≈ 1:02–1:32)

> *(Screen recording of the live app, in a soft frame.)*
> **Sultan:** "Here's how it works for Yara. She says the idea out loud."
> *(Brief box filling from dictation.)* **[run]**: what she said.
> "Impasto turns it into a brief, and paints three concepts, steered by her own paintings."
> *(Concepts screen.)*
> "She takes a photo of her wall, and there it is, hung at its real size."
> *(Wall view, Make it look real.)*
> "Then the part she used to guess: every color, in grams, mixed from the tubes she already has."
> *(Recipe screen, a big number on screen.)* **[run]**: e.g. "N colors · N g of paste".

## 5. Under the hood (≈ 1:32–1:57)

> *(Animated diagram on a plain background, one node per sentence.)*
> **Sultan:** "On top, it's simple. Underneath, four Meta models work together.
> Muse Voice Transcribe turns what she says into text.
> Muse Spark turns that into a brief, and later writes every step of how to paint it.
> Muse Image paints the concept, steered by her past work.
> SAM finds each color band, and each band's area becomes grams of paint and paste."

## 6. Proof: a check-in (≈ 1:57–2:22)

A real check-in, recorded now, using one of her plum bowl photos (`mixes` 01, 05 or 06). It doesn't claim she used check-ins on this painting.

> *(The bowl photo, then the check-in screen.)*
> **Sultan:** "Does it hold up off the screen? This is her plum mix, from while she was painting.
> Impasto finds the paint in the bowl, corrects for the light using anything white in the shot, and checks it against the recipe."
> *(The result big on screen, labeled "saved result".)* **[run]**: e.g. "add N g of …".

## 7. Finished, and the callback (≈ 2:22–2:48)

> *(Photo `stages` 12, slow push in.)*
> **Sultan:** "It started as an idea in her head. Now it's real."
> *(The two other paintings, `others` 00 and 01, one after the other.)*
> "And two more she's made with Impasto."
> *(Impasto wordmark.)*

## 8. Yara's last word (≈ 2:48–3:00)

> *(Yara on camera, or her voice over the finished canvas.)*
> **Yara:** "I still mix every color by hand. I just don't have to guess anymore."

## Rules

- Yara paints for love of it. No clients or commissions.
- Saved model results are labeled as saved.
- Don't mention how long a painting takes her.
- Yara's lines are drafted for her. She checks each one is true for her and can say it her own way.
