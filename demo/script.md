# Impasto demo: script

3 minutes at most. Sultan narrates, and Yara speaks on camera. Live app on screen, cut with Yara's real photos and code-built animated graphics (type, diagrams). No generated scenes. Photos are in `demo/photos/` (kept out of git).

Format follows the Crossbeam demo (Built with Opus 4.6): hook line → who I am → the real person, in her own words → "I thought this would be easy" → simple on top → under the hood → proof → callback, then the last word goes to the real person.

Spine: one painting from idea to finished canvas, then two more she made with Impasto.

Status: second draft, telling the whole way from idea to canvas, not only mixing. **[confirm]** marks Yara's lines to check again. **[run]** marks numbers that come from the recorded example piece, still to record.

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

## 2. Yara, on camera (≈ 0:28–0:42)

> *(Yara, chest up, phone or webcam. Big name card: "Yara / painter".)*
> **Yara:** "I always see the painting in my head first. But getting it onto the canvas is a lot of guessing. **[confirm]**
> Will it look right on the wall? Which colors do I need, and how do I mix them? Where do I start? And halfway through, am I still on track?" **[confirm]**

She can say it in her own way. Her questions are the stops section 4 walks through, in the same order.

## 3. "I thought this would be easy" (≈ 0:42–1:00)

> *(Close-ups of her ridges, `stages` photos.)*
> **Sultan:** "I thought AI could do this easily. Models write ideas, paint pictures, name colors. I was wrong."
> *(Day 1 test: `text-only.webp` beside `with-refs.webp`.)*
> "Ask one to paint her idea, and you get generic texture, nothing like hers."
> *(Animated type over a ridge photo: `"sage" → nothing found`, `"cream" → nothing found`.)*
> "Ask it to find 'sage' or 'cream' in her painting, and it finds nothing.
> And every knife ridge casts a shadow that changes the color it sees."
> *(Hard cut to black, then type: "So Impasto doesn't guess.")*
> "So Impasto doesn't guess. It learns from her own paintings, and it measures."

Visual: the real Day 1 results from `backend/spikes/output/image/`, labeled "Day 1 test". No reruns.

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

## 5. Under the hood (≈ 1:45–2:05)

> *(Animated diagram on a plain background, one node per sentence.)*
> **Sultan:** "Underneath, four Meta models work together.
> Muse Voice Transcribe hears the idea. Muse Spark plans it, from the brief to every step.
> Muse Image paints it, in her style. And SAM finds each color band, so its area becomes grams of paint."

## 6. Check-ins: still on track (≈ 2:05–2:25)

A real check-in, recorded now, using one of her plum bowl photos (`mixes` 01, 05 or 06). It doesn't claim she used check-ins on this painting.

> *(The five-stop strip lights its last stop, then the bowl photo and the check-in screen.)*
> **Sultan:** "And while she paints, she checks in. A photo of a step, and it's compared with how that step should look.
> This is her plum mix, from while she was painting. Impasto finds the paint in the bowl and checks it against the recipe."
> *(The result big on screen, labeled "saved result".)* **[run]**: e.g. "add N g of …".

## 7. Finished, and the callback (≈ 2:25–2:48)

> *(Photo `stages` 12, slow push in.)*
> **Sultan:** "It started as an idea in her head. Now it's real."
> *(The two other paintings, `others` 00 and 01, one after the other.)*
> "And two more she's made with Impasto."
> *(Impasto wordmark.)*

## 8. Yara's last word (≈ 2:48–3:00)

> *(Yara on camera, or her voice over the finished canvas.)*
> **Yara:** "I still do all the painting myself. But now I know where I'm going, from the first idea to the last layer." **[confirm]**

## Rules

- Yara paints for love of it. No clients or commissions.
- Saved model results are labeled as saved.
- Don't mention how long a painting takes her.
- Yara's lines are drafted for her. She checks each one is true for her and can say it her own way.
