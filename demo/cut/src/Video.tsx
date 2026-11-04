import React from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import { C, Fade, Photo, SANS, SERIF, Say, Screen, Stops, Tag, Wordmark, YaraSlot, ease } from './kit'
import { HookSketch } from './hooks'
import { IntroFull } from './intro-clips'
import { EasyChatAll } from './easy'

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
  idea: 300, change: 240, see: 150, colors: 330, steps: 330, bowl: 270, step: 330,
  hood: 570, done: 690, last: 645,
}
type Key = keyof typeof LEN
const T = {} as Record<Key, readonly [number, number]>
let at = 0
for (const k of Object.keys(LEN) as Key[]) { T[k] = [at, LEN[k]]; at += LEN[k] }
export const TOTAL = at
const S: React.FC<{ t: readonly [number, number]; children: React.ReactNode }> = ({ t, children }) => (
  <Sequence from={t[0]} durationInFrames={t[1]}>{children}</Sequence>
)

// 5. Four models, one node per sentence.
const NODES = [
  { name: 'Muse Voice Transcribe', job: 'hears the idea' },
  { name: 'Muse Spark', job: 'plans it, from the brief to every step' },
  { name: 'Muse Image', job: 'paints it' },
  { name: 'SAM', job: 'finds each band, so its area becomes grams of paint' },
]
const Hood: React.FC = () => {
  const f = useCurrentFrame()
  const at = [70, 190, 320, 430]
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 28, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: C.soft, opacity: ease(f, 0, 14) }}>
        Under the hood · four Meta models
      </div>
      <div style={{ position: 'absolute', top: 330, left: 120, right: 120, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {NODES.map((n, i) => {
          const a = at[i]
          const lit = f >= a
          return (
            <React.Fragment key={n.name}>
              {i > 0 && <div style={{ flex: 1, height: 3, marginTop: 64, background: `linear-gradient(90deg, ${C.plum} ${ease(f, a - 20, a) * 100}%, rgba(31,26,23,.12) 0)`, borderRadius: 3 }} />}
              <div style={{ width: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, opacity: 0.25 + 0.75 * ease(f, a, a + 14) }}>
                <div style={{ width: 130, height: 130, borderRadius: 130, background: lit ? C.ink : 'transparent', border: `3px solid ${lit ? C.ink : 'rgba(31,26,23,.2)'}`,
                  display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: SERIF, fontSize: 54, color: lit ? '#fff' : C.soft, transform: `scale(${0.9 + 0.1 * ease(f, a, a + 18)})` }}>{i + 1}</div>
                <div style={{ fontFamily: SERIF, fontSize: 40, color: C.ink, textAlign: 'center', lineHeight: 1.1 }}>{n.name}</div>
                <div style={{ fontFamily: SANS, fontSize: 26, color: C.soft, textAlign: 'center', lineHeight: 1.3, textWrap: 'balance', opacity: ease(f, a + 8, a + 22) }}>{n.job}</div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

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

const App: React.FC<{ stop: number; len: number; children: React.ReactNode; say: [number, number, string][]; tag?: string }> = ({ stop, len, children, say, tag }) => (
  <Fade len={len} inF={8} outF={8}>
    {children}
    <Stops active={stop} />
    {tag && <Tag x={1920 - 260 - 200} y={146} at={10} dark>{tag}</Tag>}
    <Say lines={say} dark={false} bottom={24} />
  </Fade>
)

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
      <App stop={0} len={300} say={[
        [10, 140, "Here's how it works. It starts with the idea. Yara says it out loud: this wall, and a painting she loves."],
        [150, 290, 'Impasto turns what she said into a brief, and sizes the canvas to the wall.'],
      ]}>
        <Screen src="clips/01-brief.mp4" rate={1.3} len={300} zoom={[1, 1.06]} focus={[40, 30]} />
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

    {/* 5. Under the hood */}
    <S t={T.hood}>
      <Fade len={570} inF={12} outF={12}>
        <Hood />
        <Say dark={false} bottom={110} lines={[
          [10, 64, 'Underneath, four Meta models work together.'],
          [70, 182, 'Muse Voice Transcribe hears the idea. Muse Spark plans it, from the brief to every step.'],
          [320, 420, 'Muse Image paints it.'],
          [430, 558, 'And SAM finds each color band, so its area becomes grams of paint.'],
        ]} />
      </Fade>
    </S>

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

    {/* 7. Finished */}
    <S t={T.done}>
      <Fade len={690} inF={14} outF={1}>
        <Sequence durationInFrames={300}><Photo src="photos/stage-12.jpg" len={300} from={0.9} to={0.96} dim={0.5} whole /></Sequence>
        <Sequence from={300} durationInFrames={150}><Photo src="photos/other-00.jpg" len={150} from={1.02} to={1.08} dim={0.45} /></Sequence>
        <Sequence from={450} durationInFrames={150}><Photo src="photos/other-01.jpg" len={150} from={1.08} to={1.02} dim={0.45} /></Sequence>
        <Say lines={[
          [12, 150, 'It started as a picture she loved and an empty wall.'],
          [160, 290, "Now it's real."],
          [310, 590, "And two more she's made with Impasto."],
        ]} />
        <Sequence from={600}><Wordmark len={90} dark sub="A co-pilot for painters" /></Sequence>
      </Fade>
    </S>

    {/* 8. Yara's last word */}
    <S t={T.last}><YaraSlot file={YARA.last} len={LEN.last} say={YARA_SAY_2} card={false} note="Her last word: she still does all the painting herself." /></S>
  </AbsoluteFill>
)
