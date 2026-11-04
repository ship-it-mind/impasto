import React from 'react'
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { App, C, Fade, Photo, SANS, SERIF, Say, Screen, Stops, Tag, Wordmark, YaraSlot, ease } from './kit'
import { HookSketch } from './hooks'
import { IntroFull, type Shot } from './intro-clips'
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
// Timed to the voiceover (scripts/voiceover.py → public/vo/): each scene runs as long as its line, plus a breath.
const LEN = {
  hook: 270, intro: 635, yara: 498, easy: 525,
  idea: 440, change: 190, see: 150, colors: 240, steps: 225, bowl: 245, step: 262,
  hood: 700, back: 170, last: 645, end: 90,
}
type Key = keyof typeof LEN
const T = {} as Record<Key, readonly [number, number]>
let at = 0
for (const k of Object.keys(LEN) as Key[]) { T[k] = [at, LEN[k]]; at += LEN[k] }
export const TOTAL = at
const S: React.FC<{ t: readonly [number, number]; children: React.ReactNode }> = ({ t, children }) => (
  <Sequence from={t[0]} durationInFrames={t[1]}>{children}</Sequence>
)
// The user's voiceover for a scene, starting `at` frames in.
const Voice: React.FC<{ part: string; at: number }> = ({ part, at }) => (
  <Sequence from={at} layout="none"><Audio src={staticFile(`vo/${part}.wav`)} /></Sequence>
)

// The intro's shots and lines, cut on the words of the voiceover.
const INTRO_SHOTS: Shot[] = [
  { a: 0, b: 194, src: 'brush-cat', pos: '50% 45%' },
  { a: 194, b: 260, src: 'blank-live' },
  { a: 260, b: 322, src: 'wall', rate: 1.5, pos: '50% 32%' },
  { a: 322, b: 395, src: 'knife-white', pos: '50% 60%' },
  { a: 395, b: 470, src: 'knife-purple', pos: '50% 70%' },
  { a: 470, b: 550, src: 'ridges' },
  { a: 550, b: 635, src: 'mix', rate: 1.6, pos: '50% 45%' },
]
const INTRO_SAY_VO: [number, number, string][] = [
  [8, 186, "Hi, I'm Sultan. I've been building Impasto, a co-pilot for painters, to help my wife, Yara."],
  [194, 314, "About a year ago, Yara started painting, and it's become the thing she loves most."],
  [322, 540, 'She paints impasto: thick paint, laid on with a knife, so it stands up off the canvas.'],
  [550, 622, 'Every color is mixed by hand.'],
]


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
  const join = ease(f, 98, 122)
  const card = (src: string, label: string, x: number, a: number) => (
    <div style={{ position: 'absolute', left: x + (960 - x - 210) * join, top: 170, width: 420, opacity: ease(f, a, a + 12) * (1 - ease(f, 104, 124)), transform: `translateY(${(1 - ease(f, a, a + 18)) * 24}px) scale(${1 - 0.1 * join})` }}>
      <Img src={staticFile(src)} style={{ width: 420, height: 560, objectFit: 'cover', borderRadius: 18, boxShadow: '0 30px 70px -30px rgba(0,0,0,.7)' }} />
      <div style={{ fontFamily: SANS, fontSize: 24, color: 'rgba(255,255,255,.7)', marginTop: 14, letterSpacing: 2, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
  const W = 520, H = W * 2000 / 1704
  return (
    <AbsoluteFill style={{ background: C.black }}>
      <Fade len={LEN.back} inF={10} outF={10}>
        {card('app/to-paint.jpg', 'A picture she loved', 420, 2)}
        {card('app/wall.jpg', 'An empty wall', 1080, 10)}
        <div style={{ position: 'absolute', left: (1920 - W) / 2, top: 130, width: W, height: H, opacity: ease(f, 112, 132), transform: `scale(${0.94 + 0.06 * ease(f, 112, 150)})` }}>
          <Img src={staticFile('hook/finished-straight.jpg')} style={{ width: W, height: H, borderRadius: 6, boxShadow: '0 40px 90px -30px rgba(0,0,0,.8)' }} />
        </div>
        <Say lines={[[6, 116, 'It started as a picture she loved and an empty wall.'], [123, 162, "Now it's real."]]} />
      </Fade>
    </AbsoluteFill>
  )
}

// The music's level through the film: low under the voiceover, lower under Yara's own voice, up a little at the end.
const MUSIC = { voice: 0.1, yara: 0.05, end: 0.3 }
const musicLevel = (f: number) => {
  const keys: [number, number][] = [[0, MUSIC.voice]]
  for (const k of ['yara', 'last'] as const) keys.push([T[k][0] - 12, MUSIC.voice], [T[k][0] + 8, MUSIC.yara], [T[k][0] + T[k][1] - 8, MUSIC.yara], [T[k][0] + T[k][1] + 12, MUSIC.voice])
  keys.push([T.end[0] - 4, MUSIC.voice], [T.end[0] + 10, MUSIC.end], [TOTAL, MUSIC.end])
  keys.sort((a, b) => a[0] - b[0])
  return interpolate(f, keys.map(k => k[0]), keys.map(k => k[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
}

export const Video: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    {/* Background music, made by scripts/music.py */}
    <Audio src={staticFile('music.wav')} volume={musicLevel} />
    <S t={T.hook}><HookSketch /><Voice part="hook" at={6} /></S>

    {/* 1. Who I am, and Yara */}
    <S t={T.intro}>
      <IntroFull shots={INTRO_SHOTS} say={INTRO_SAY_VO} len={LEN.intro} />
      <Voice part="intro" at={8} />
    </S>

    {/* 2. Yara, in her own words */}
    <S t={T.yara}><YaraSlot file={YARA.intro} len={LEN.yara} say={YARA_SAY_1} note="Seeing the painting in her head, and the guessing it takes to get it onto the canvas." /></S>

    {/* 3. "I thought this would be easy" */}
    <S t={T.easy}>
      <Fade len={LEN.easy} inF={10} outF={10}><EasyChatAll /></Fade>
      <Voice part="easy" at={8} />
    </S>

    {/* 4. On top, it's simple */}
    <S t={T.idea}>
      {/* From the user's recording of the live app (scripts/idea-clip.sh): the box filling, then the brief. */}
      <App stop={0} len={LEN.idea} say={[
        [8, 228, "Here's how it works. It starts with the idea. Yara says out loud: this wall, and the painting she loves."],
        [243, 385, 'Impasto turns what she said into a brief, and sizes the canvas to the wall.'],
      ]}>
        <Screen src="clips/01-idea-live.mp4" len={LEN.idea} zoom={[1, 1.03]} focus={[50, 30]} />
      </App>
      <Voice part="idea" at={8} />
    </S>
    <S t={T.change}>
      <App stop={0} len={LEN.change} say={[[6, 170, "She talks to it to change what she doesn't like, the whole thing or one part."]]}>
        <Screen src="clips/06-change.mp4" rate={1.4} len={LEN.change} />
      </App>
      <Voice part="change" at={6} />
    </S>
    <S t={T.see}>
      <App stop={1} len={LEN.see} say={[[6, 132, 'Then she sees it on her wall, at its real size.']]}>
        <Screen src="clips/02-wall.mp4" len={LEN.see} zoom={[1, 1.05]} focus={[30, 40]} />
      </App>
      <Voice part="see" at={6} />
    </S>
    <S t={T.colors}>
      <App stop={2} len={LEN.colors} say={[[6, 222, 'Then the colors: every one she needs, how much to make, and how to mix it from the tubes she has.']]}>
        <Screen src="clips/03-recipe.mp4" rate={1.35} len={LEN.colors} />
      </App>
      <Voice part="colors" at={6} />
    </S>
    <S t={T.steps}>
      <App stop={3} len={LEN.steps} say={[[6, 203, 'Then the steps: every stage in order, with a picture of how the canvas should look after it.']]}>
        <Screen src="clips/04-paint.mp4" rate={1.6} len={LEN.steps} />
      </App>
      <Voice part="steps" at={6} />
    </S>

    {/* 5. Under the hood: each model's real work on this piece, then what Impasto measures itself */}
    <S t={T.hood}><HoodMeasured /><Voice part="hood" at={8} /></S>

    {/* 6. Check-ins */}
    <S t={T.bowl}>
      <App stop={4} len={LEN.bowl} tag="Saved result" say={[
        [6, 152, 'And she checks in: a photo of her mix, measured against the recipe.'],
        [161, 232, "Too dark, and here's the fix."],
      ]}>
        <Screen src="clips/07-bowl.jpg" still len={LEN.bowl} zoom={[1.02, 1.1]} focus={[62, 50]} />
      </App>
      <Voice part="bowl" at={6} />
    </S>
    <S t={T.step}>
      <App stop={4} len={LEN.step} tag="Saved result" say={[
        [6, 128, 'A photo of the canvas is compared with how that step should look.'],
        [133, 248, 'Burgundy needs work. Dusty Rose is on track.'],
      ]}>
        <Screen src="clips/05-checkin.mp4" start={1.2} rate={1.4} len={LEN.step} />
      </App>
      <Voice part="step" at={6} />
    </S>

    {/* 7. The callback: the picture she loved and her empty wall, then her canvas */}
    <S t={T.back}><Callback /><Voice part="back" at={6} /></S>

    {/* 8. Yara's last word */}
    <S t={T.last}><YaraSlot file={YARA.last} len={LEN.last} say={YARA_SAY_2} card={false} note="Her last word: she still does all the painting herself." /></S>

    {/* The end: the name */}
    <S t={T.end}><Wordmark len={LEN.end} dark sub="A co-pilot for painters" /></S>
  </AbsoluteFill>
)
