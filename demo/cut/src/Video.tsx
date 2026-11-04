import React from 'react'
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { App, C, Fade, Photo, SANS, SERIF, Say, Screen, Stops, Tag, Wordmark, YaraSlot, ease } from './kit'
import { HookSketch } from './hooks'
import { IntroFull } from './intro-clips'
import { EasyChatAll } from './easy'
import { HoodMeasured } from './hood'

// Yara's clips, cut by scripts/yara-clips.sh, with her words as subtitles (frames within each clip).
export const YARA = { intro: 'yara/yara-1.mp4' as string | null, last: 'yara/yara-2.mp4' as string | null }
const YARA_SAY_1: [number, number, string][] = [
  [5, 162, 'I find so many paintings I love and think, I want to make something like that for my home.'],
  [164, 327, 'But then come all the questions: what size, what material, how do I get the colors right?'],
  [337, 487, "And even when I start, things don't always turn out how I imagined."],
]
const YARA_SAY_2: [number, number, string][] = [
  [0, 154, "I genuinely love painting. It's my kind of meditation, my chance to slow down."],
  [170, 354, 'But I used to overthink everything: the colors, the materials, the fear of messing up.'],
  [377, 518, 'Now I can just enjoy creating, knowing I have guidance when I need it,'],
  [527, 632, "and make something I'm actually proud to hang in my house."],
]

// Every scene's length in frames, in order. Start frames follow from them. 30 fps.
const LEN = {
  hook: 270, intro: 600, yara: 498, easy: 540,
  idea: 360, change: 240, see: 150, colors: 330, steps: 330, bowl: 270, step: 330,
  hood: 590, back: 120, last: 645, end: 75,
}
type Key = keyof typeof LEN
const T = {} as Record<Key, readonly [number, number]>
let at = 0
for (const k of Object.keys(LEN) as Key[]) { T[k] = [at, LEN[k]]; at += LEN[k] }
export const TOTAL = at
const S: React.FC<{ t: readonly [number, number]; children: React.ReactNode }> = ({ t, children }) => (
  <Sequence from={t[0]} durationInFrames={t[1]}>{children}</Sequence>
)


// A strip of numbers from the run.
const Stat: React.FC<{ at: number; items: [string, string][] }> = ({ at, items }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', right: 120, top: 190, display: 'flex', gap: 12, opacity: ease(f, at, at + 14), transform: `translateY(${(1 - ease(f, at, at + 20)) * 12}px)` }}>
      {items.map(([v, k]) => (
        <div key={k} style={{ background: C.ink, color: '#fff', borderRadius: 16, padding: '14px 22px', fontFamily: SANS, boxShadow: '0 16px 30px -14px rgba(0,0,0,.5)' }}>
          <div style={{ fontSize: 38, fontWeight: 650, letterSpacing: -0.5 }}>{v}</div>
          <div style={{ fontSize: 20, opacity: 0.7 }}>{k}</div>
        </div>
      ))}
    </div>
  )
}


// 4. The idea: the box as she filled it, then the brief Impasto read from it.
// `brief` is which recording of the brief: 'fix' with the app's "From the picture" rows, 'hide' with those rows hidden.
export const IDEA_SAY: [number, number, string][] = [
  [10, 140, "Here's how it works. It starts with the idea. Yara says it out loud: this wall, and a painting she loves."],
  [150, 290, 'Impasto turns what she said into a brief, and sizes the canvas to the wall.'],
]
export const Idea: React.FC<{ brief: 'fix' | 'hide' }> = ({ brief }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    <App stop={0} len={300} say={IDEA_SAY}>
      <Sequence durationInFrames={145}><Screen src="clips/01a-box.mp4" start={1} rate={1.5} len={145} zoom={[1, 1.04]} focus={[50, 20]} /></Sequence>
      <Sequence from={145}><Screen src={`clips/01-brief-${brief}.mp4`} rate={1.6} len={155} /></Sequence>
    </App>
  </AbsoluteFill>
)

// 7. "It started as a picture she loved and an empty wall. Now it's real." The two come together into her finished canvas.
const Callback: React.FC = () => {
  const f = useCurrentFrame()
  const join = ease(f, 52, 78)
  const card = (src: string, label: string, x: number, a: number) => (
    <div style={{ position: 'absolute', left: x + (960 - x - 210) * join, top: 170, width: 420, opacity: ease(f, a, a + 12) * (1 - ease(f, 60, 80)), transform: `translateY(${(1 - ease(f, a, a + 18)) * 24}px) scale(${1 - 0.1 * join})` }}>
      <Img src={staticFile(src)} style={{ width: 420, height: 560, objectFit: 'cover', borderRadius: 18, boxShadow: '0 30px 70px -30px rgba(0,0,0,.7)' }} />
      <div style={{ fontFamily: SANS, fontSize: 24, color: 'rgba(255,255,255,.7)', marginTop: 14, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
  const W = 520, H = W * 2000 / 1704
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <Fade len={120} inF={10} outF={10}>
        {card('app/to-paint.jpg', 'A picture she loved', 420, 2)}
        {card('app/wall.jpg', 'An empty wall', 1080, 10)}
        <div style={{ position: 'absolute', left: (1920 - W) / 2, top: 130, width: W, height: H, opacity: ease(f, 62, 84), transform: `scale(${0.94 + 0.06 * ease(f, 62, 100)})` }}>
          <Img src={staticFile('hook/finished-straight.jpg')} style={{ width: W, height: H, borderRadius: 6, boxShadow: '0 40px 90px -30px rgba(0,0,0,.8)' }} />
        </div>
        <Say lines={[[6, 58, 'It started as a picture she loved and an empty wall.'], [70, 116, "Now it's real."]]} />
      </Fade>
    </AbsoluteFill>
  )
}

export const Video: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <S t={T.hook}><HookSketch /></S>

    {/* 1. Who I am, and Yara */}
    <S t={T.intro}>
      <IntroFull />
    </S>

    {/* 2. Yara, in her own words */}
    <S t={T.yara}><YaraSlot file={YARA.intro} len={LEN.yara} say={YARA_SAY_1} note="Seeing the painting in her head, and the guessing it takes to get it onto the canvas." /></S>

    {/* 3. "I thought this would be easy" */}
    <S t={T.easy}>
      <Fade len={540} inF={10} outF={10}><EasyChatAll /></Fade>
    </S>

    {/* 4. On top, it's simple */}
    <S t={T.idea}>
      {/* From the user's recording of the live app (scripts/idea-clip.sh): the box filling, then the brief. */}
      <App stop={0} len={LEN.idea} say={[
        [10, 160, "Here's how it works. It starts with the idea. Yara says it out loud: this wall, and a painting she loves."],
        [172, 350, 'Impasto turns what she said into a brief, and sizes the canvas to the wall.'],
      ]}>
        <Screen src="clips/01-idea-live.mp4" len={LEN.idea} zoom={[1, 1.03]} focus={[50, 30]} />
      </App>
    </S>
    <S t={T.change}>
      <App stop={0} len={240} say={[[8, 230, "She talks to it to change what she doesn't like, the whole thing or one part."]]}>
        <Screen src="clips/06-change.mp4" rate={1.15} len={240} />
      </App>
    </S>
    <S t={T.see}>
      <App stop={1} len={150} say={[[6, 145, 'Then she sees it: a photo of her wall, with the painting hung at its real size.']]}>
        <Screen src="clips/02-wall.mp4" len={150} zoom={[1, 1.05]} focus={[30, 40]} />
      </App>
    </S>
    <S t={T.colors}>
      <App stop={2} len={330} say={[[8, 320, 'Then the colors: every one she needs, how much to make, and how to mix it from the tubes she has.']]}>
        <Screen src="clips/03-recipe.mp4" len={330} />
      </App>
    </S>
    <S t={T.steps}>
      <App stop={3} len={330} say={[[8, 320, 'Then the steps: every stage in order, with a picture of how the canvas should look after it.']]}>
        <Screen src="clips/04-paint.mp4" rate={1.2} len={330} />
      </App>
    </S>

    {/* 5. Under the hood: each model's real work on this piece, then what Impasto measures itself */}
    <S t={T.hood}><HoodMeasured /></S>

    {/* 6. Check-ins */}
    <S t={T.bowl}>
      <App stop={4} len={270} tag="Saved result" say={[
        [8, 120, 'And she checks in. A photo of the paint in the bowl is measured against the recipe.'],
        [128, 262, "This is her plum mix, photographed while she painted. It's too dark, and Impasto says how to fix it."],
      ]}>
        <Screen src="clips/07-bowl.jpg" still len={270} zoom={[1.02, 1.1]} focus={[62, 50]} />
      </App>
    </S>
    <S t={T.step}>
      <App stop={4} len={330} tag="Saved result" say={[
        [8, 170, 'A photo of the canvas is compared with how that step should look.'],
        [178, 322, 'Burgundy needs work. Dusty Rose is on track.'],
      ]}>
        <Screen src="clips/05-checkin.mp4" start={1.2} len={330} />
      </App>
    </S>

    {/* 7. The callback: the picture she loved and her empty wall, then her canvas */}
    <S t={T.back}><Callback /></S>

    {/* 8. Yara's last word */}
    <S t={T.last}><YaraSlot file={YARA.last} len={LEN.last} say={YARA_SAY_2} card={false} note="Her last word: she still does all the painting herself." /></S>

    {/* The end: the name */}
    <S t={T.end}><Wordmark len={LEN.end} dark sub="A co-pilot for painters" /></S>
  </AbsoluteFill>
)
