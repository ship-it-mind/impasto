import React from 'react'
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { C, Fade, Photo, SANS, SERIF, Say, Screen, Stops, Tag, Wordmark, YaraSlot, ease } from './kit'
import { HookSketch } from './hooks'

// Yara's clips. Put her files in public/ and name them here, then render again.
export const YARA = { intro: null as string | null, last: null as string | null }

// Every scene, in order, as [start frame, length]. 30 fps, 5400 frames = 3:00.
const T = {
  hook: [0, 270], intro: [270, 600], yara: [870, 420], easy: [1290, 540],
  idea: [1830, 300], change: [2130, 240], see: [2370, 150], colors: [2520, 330], steps: [2850, 330],
  hood: [3180, 570], bowl: [3750, 270], step: [4020, 330], done: [4350, 690], last: [5040, 360],
} as const
const S: React.FC<{ t: readonly [number, number]; children: React.ReactNode }> = ({ t, children }) => (
  <Sequence from={t[0]} durationInFrames={t[1]}>{children}</Sequence>
)

// 3. The "nothing found" type over a ridge photo.
const NothingFound: React.FC = () => {
  const f = useCurrentFrame()
  const row = (a: number, word: string) => (
    <div style={{ display: 'flex', gap: 26, alignItems: 'baseline', opacity: ease(f, a, a + 12), transform: `translateX(${(1 - ease(f, a, a + 18)) * -30}px)` }}>
      <span style={{ fontFamily: SERIF, fontSize: 96, color: '#fff' }}>“{word}”</span>
      <span style={{ fontFamily: SANS, fontSize: 52, color: 'rgba(255,255,255,.6)' }}>→</span>
      <span style={{ fontFamily: SANS, fontSize: 52, fontWeight: 600, color: '#f2b8a8', opacity: ease(f, a + 16, a + 26) }}>nothing found</span>
    </div>
  )
  return (
    <AbsoluteFill>
      <Photo src="photos/stage-06.jpg" len={120} from={1.3} to={1.42} dim={0} />
      <AbsoluteFill style={{ background: 'rgba(15,13,12,.55)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 200, gap: 22, flexDirection: 'column', paddingBottom: 120 }}>
        {row(4, 'sage')}
        {row(26, 'cream')}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const DayOne: React.FC = () => {
  const f = useCurrentFrame()
  const pic = (src: string, label: string, a: number) => (
    <div style={{ opacity: ease(f, a, a + 14), transform: `translateY(${(1 - ease(f, a, a + 20)) * 20}px)`, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
      <Img src={staticFile(src)} style={{ width: 640, height: 640, objectFit: 'cover', borderRadius: 16, boxShadow: '0 30px 60px -25px rgba(0,0,0,.45)' }} />
      <div style={{ fontFamily: SANS, fontSize: 26, color: C.soft }}>{label}</div>
    </div>
  )
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 70, paddingBottom: 150 }}>
        {pic('text-only.webp', 'From the words alone', 0)}
        {pic('with-refs.webp', 'With her paintings as references', 10)}
      </AbsoluteFill>
      <Tag at={4}>Day 1 test</Tag>
    </AbsoluteFill>
  )
}

const DontGuess: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: C.black, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ fontFamily: SERIF, fontSize: 110, color: '#fff', letterSpacing: -2, opacity: ease(f, 4, 16), transform: `scale(${1.03 - 0.03 * ease(f, 4, 40)})`, paddingBottom: 120 }}>
        So Impasto doesn't guess.
      </div>
    </AbsoluteFill>
  )
}

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
      <Fade len={600} inF={16} outF={14}>
        <Sequence durationInFrames={300}><Photo src="photos/stage-00.jpg" len={300} from={1.02} to={1.12} dim={0.55} /></Sequence>
        <Sequence from={300}><Photo src="photos/stage-05.jpg" len={300} from={1.15} to={1.25} x={[2, -2]} dim={0.55} /></Sequence>
        <Say lines={[
          [8, 165, "Hi, I'm Sultan. I've been building Impasto, a co-pilot for painters, to help my wife, Yara."],
          [175, 292, "About a year ago, Yara started painting, and it's become the thing she loves most."],
          [305, 470, 'She paints impasto: thick paint, laid on with a knife, so it stands up off the canvas.'],
          [478, 590, 'Every color is mixed by hand.'],
        ]} />
      </Fade>
    </S>

    {/* 2. Yara, in her own words */}
    <S t={T.yara}><YaraSlot file={YARA.intro} len={420} note="Seeing the painting in her head, and the guessing it takes to get it onto the canvas." /></S>

    {/* 3. "I thought this would be easy" */}
    <S t={T.easy}>
      <Fade len={540} inF={10} outF={10}>
        <Sequence durationInFrames={180}><Photo src="photos/stage-13.jpg" len={180} from={1.35} to={1.5} y={[3, -3]} dim={0.5} /></Sequence>
        <Sequence from={180} durationInFrames={150}><DayOne /></Sequence>
        <Sequence from={330} durationInFrames={120}><NothingFound /></Sequence>
        <Sequence from={450}><DontGuess /></Sequence>
        <Say lines={[
          [6, 110, 'I thought AI could do this easily. Models write ideas, paint pictures, name colors.'],
          [118, 172, 'I was wrong.'],
        ]} />
        <Sequence from={180} durationInFrames={150}><Say dark={false} lines={[[6, 140, 'Ask one to paint her idea, and you get generic texture, nothing like hers.']]} /></Sequence>
        <Sequence from={330} durationInFrames={120}><Say lines={[[4, 58, "Ask it to find “sage” or “cream” in her painting, and it finds nothing."], [62, 112, 'And every knife ridge casts a shadow that changes the color it sees.']]} /></Sequence>
        <Sequence from={450}><Say lines={[[14, 86, 'It works from the pictures she gives it, and it measures.']]} /></Sequence>
      </Fade>
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
    <S t={T.last}><YaraSlot file={YARA.last} len={360} note="Her last word: she still does all the painting herself." /></S>
  </AbsoluteFill>
)
