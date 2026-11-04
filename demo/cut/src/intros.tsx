// Five ways to show §1 without panning over a still photo. Each is 20 s, with the same narration.
import React, { useEffect, useState } from 'react'
import { AbsoluteFill, Img, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { C, Fade, SANS, SERIF, Say, ease } from './kit'

export const INTRO_LEN = 600
export const INTRO_SAY: [number, number, string][] = [
  [8, 165, "Hi, I'm Sultan. I've been building Impasto, a co-pilot for painters, to help my wife, Yara."],
  [175, 292, "About a year ago, Yara started painting, and it's become the thing she loves most."],
  [305, 470, 'She paints impasto: thick paint, laid on with a knife, so it stands up off the canvas.'],
  [478, 590, 'Every color is mixed by hand.'],
]
const Frame: React.FC<{ bg?: string; dark?: boolean; children: React.ReactNode }> = ({ bg = C.paper, dark = false, children }) => (
  <AbsoluteFill style={{ background: bg }}>
    <Fade len={INTRO_LEN} inF={14} outF={14}>{children}<Say lines={INTRO_SAY} dark={dark} bottom={dark ? 86 : 40} /></Fade>
  </AbsoluteFill>
)
const pic = (p: string) => staticFile(`photos/${p}.jpg`)

// ─── 1. Clips Yara films ────────────────────────────────────────────────────
// Slots for real footage, timed to the lines, each saying what to film.
const SHOTS: [number, number, string, string][] = [
  [0, 172, 'Yara at the easel, from behind', 'The canvas and her hands in shot, not her face. A knife in hand, the first strokes.'],
  [172, 300, 'Her paintings at home', 'A slow walk past the two finished paintings, hung or leaning on the wall.'],
  [300, 474, 'The knife laying paste', 'Close up, side light. The knife pulls thick paste across the canvas and leaves a ridge.'],
  [474, 600, 'Mixing in the bowl', 'From above. Tube color folded into white paste until it turns even.'],
]
export const IntroClips: React.FC = () => {
  const f = useCurrentFrame()
  const shot = SHOTS.find(([a, b]) => f >= a && f < b)!
  const [a, , title, note] = shot
  return (
    <Frame bg="#2a2421" dark>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 120 }}>
        <div key={a} style={{ width: 1300, height: 640, borderRadius: 28, border: '3px dashed rgba(255,255,255,.28)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 22, opacity: ease(f, a, a + 10) }}>
          <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,.5)', letterSpacing: 3, textTransform: 'uppercase' }}>Shot {SHOTS.indexOf(shot) + 1} of 4 · {Math.round((shot[1] - shot[0]) / 30)} s · Yara films this</div>
          <div style={{ fontFamily: SERIF, fontSize: 68, color: '#fff' }}>{title}</div>
          <div style={{ fontFamily: SANS, fontSize: 30, color: 'rgba(255,255,255,.7)', maxWidth: 900, textAlign: 'center', lineHeight: 1.35 }}>{note}</div>
        </div>
      </AbsoluteFill>
    </Frame>
  )
}

// ─── 2. The bands lift off the canvas ───────────────────────────────────────
// Her finished canvas, cut along the plan's band map, assembled band by band; then tilted,
// with each band lifted to show it stands up; then the recipe for each.
type Sketch = { w: number; h: number; order: number[]; bands: { name: string; hex: string; fills: string[] }[] }
const RECIPES: Record<string, string> = {
  'Warm Linen Beige': '13 Yellow Ochre : 3 Ultramarine : 3 Magenta : 35 paste',
  'Dusty Rose': '7 Mars Black : 3 Cadmium Red : 19 paste',
  'Deep Burgundy Brown': '2 Magenta : 1 Ultramarine : 6 paste',
  'Sage Grey': '8 Mars Black : 3 Burnt Sienna : 1 Sap Green : 22 paste',
  'Muted Plum': '1 Mars Black : 1 Magenta : 4 paste',
  'Olive Taupe': '8 Mars Black : 3 Burnt Sienna : 20 paste',
}
function useSketch() {
  const [s, set] = useState<Sketch | null>(null)
  const [h] = useState(() => delayRender('sketch'))
  useEffect(() => { fetch(staticFile('hook/sketch.json')).then(r => r.json()).then(d => { set(d); continueRender(h) }) }, [h])
  return s
}
export const IntroLift: React.FC = () => {
  const f = useCurrentFrame()
  const s = useSketch()
  if (!s) return null
  const W = 560, H = W * s.h / s.w
  const tilt = ease(f, 300, 352) * (1 - ease(f, 556, 596))
  const list = ease(f, 470, 500)
  return (
    <Frame>
      <div style={{ position: 'absolute', left: interpolate(list, [0, 1], [960, 600]) - W / 2, top: 470 - H / 2, width: W, height: H, perspective: 2400 }}>
        <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateX(${tilt * 56}deg) rotateZ(${tilt * -34}deg)` }}>
          <div style={{ position: 'absolute', inset: 0, background: '#efe9dd', borderRadius: 3, boxShadow: `0 ${30 + 30 * tilt}px 70px -30px rgba(50,30,20,.5)` }} />
          {s.order.map((k, slot) => {
            const land = 26 + slot * 34
            const drop = 1 - ease(f, land, land + 22)
            const lift = ease(f, 330 + slot * 12, 380 + slot * 12) * (1 - ease(f, 548, 590))
            const z = drop * 500 + lift * (slot + 1) * 52
            return (
              <svg key={k} viewBox={`0 0 ${s.w} ${s.h}`} width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: f < land - 2 ? 0 : 1,
                transform: `translateZ(${z}px)`, filter: `drop-shadow(0 ${4 + 14 * lift}px ${6 + 14 * lift}px rgba(40,20,15,${0.25 + 0.2 * lift}))` }}>
                <defs><clipPath id={`b${k}`}>{s.bands[k].fills.map((d, i) => <path key={i} d={d} />)}</clipPath></defs>
                <image href={staticFile('hook/finished-straight.jpg')} width={s.w} height={s.h} clipPath={`url(#b${k})`} preserveAspectRatio="none" />
              </svg>
            )
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1230, top: 230, display: 'flex', flexDirection: 'column', gap: 22, opacity: list * (1 - ease(f, 556, 590)) }}>
        {s.order.map((k, slot) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: ease(f, 480 + slot * 8, 494 + slot * 8), transform: `translateX(${(1 - ease(f, 480 + slot * 8, 500 + slot * 8)) * 30}px)` }}>
            <div style={{ width: 54, height: 54, borderRadius: 12, background: s.bands[k].hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }} />
            <div style={{ fontFamily: SANS }}>
              <div style={{ fontSize: 28, fontWeight: 650, color: C.ink }}>{s.bands[k].name}</div>
              <div style={{ fontSize: 22, color: C.soft }}>{RECIPES[s.bands[k].name]}</div>
            </div>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ─── 3. A photo wall that rearranges ────────────────────────────────────────
// Her photos as cards. Each line pulls a different set of them forward.
const CARDS = [
  ...['stage-07', 'stage-00', 'stage-02', 'stage-03', 'stage-04', 'stage-05', 'stage-06', 'stage-13', 'stage-08', 'stage-09', 'stage-10', 'stage-11', 'stage-12', 'stage-01'],
  'other-00', 'other-01', 'mix-00', 'mix-01', 'mix-02', 'mix-03', 'mix-04', 'mix-05', 'stage-12', 'other-00', 'other-01', 'mix-01', 'stage-06', 'mix-05',
]
const COLS = 7, CW = 240, CH = 214, GX = (1920 - COLS * CW) / 2 + CW / 2, GY = 120
type Rect = [number, number, number, number] // center x, center y, width, height
const grid = (i: number): Rect => [GX + (i % COLS) * CW, GY + Math.floor(i / COLS) * CH, CW - 18, CH - 18]
const row = (n: number, w: number, h: number, y = 480, gap = 34): Rect[] => Array.from({ length: n }, (_, i) => [960 + (i - (n - 1) / 2) * (w + gap), y, w, h])
const FEATURE: { at: number; ids: number[]; rects: Rect[] }[] = [
  { at: 175, ids: [12, 14, 15], rects: row(3, 450, 580, 450) },
  { at: 305, ids: [5, 6, 7, 8], rects: row(4, 390, 500, 450) },
  { at: 478, ids: [16, 17, 18, 19, 20, 21], rects: [...row(3, 320, 280, 300, 30), ...row(3, 320, 280, 610, 30)] },
]
const mixR = (a: Rect, b: Rect, k: number): Rect => a.map((v, i) => v + (b[i] - v) * k) as Rect
export const IntroWall: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <Frame>
      {CARDS.map((p, i) => {
        const base = grid(i)
        const inK = ease(f, 6 + (i % 7) * 3 + Math.floor(i / 7) * 5, 26 + (i % 7) * 3 + Math.floor(i / 7) * 5)
        let r = base, dim = 1, z = 0
        for (let j = 0; j < FEATURE.length; j++) {
          const ph = FEATURE[j], next = FEATURE[j + 1]
          const on = ease(f, ph.at, ph.at + 22) * (next ? 1 - ease(f, next.at - 6, next.at + 16) : 1 - ease(f, 572, 596))
          const slot = ph.ids.indexOf(i)
          if (slot >= 0) { r = mixR(r, ph.rects[slot], on); z = on > 0.01 ? 10 : z }
          else dim -= 0.8 * on
        }
        return (
          <div key={i} style={{ position: 'absolute', left: r[0] - r[2] / 2, top: r[1] - r[3] / 2 + (1 - inK) * 40, width: r[2], height: r[3], zIndex: z, borderRadius: 10, overflow: 'hidden',
            opacity: inK * Math.max(0.12, dim), boxShadow: z ? '0 30px 60px -26px rgba(40,25,15,.55)' : '0 8px 20px -14px rgba(40,25,15,.4)', background: '#ddd' }}>
            <Img src={pic(p)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )
      })}
    </Frame>
  )
}

// ─── 4. Quick cuts on the words ─────────────────────────────────────────────
// A hard cut to a new still on each key word. Nothing moves inside a shot.
const CUTS: [number, string, string | null][] = [
  [0, 'stage-07', null], [92, 'stage-00', null], [172, 'other-01', null], [236, 'other-00', null],
  [302, 'stage-06', 'Thick paint'], [356, 'stage-05', 'Laid on with a knife'], [412, 'stage-13', 'Off the canvas'],
  [474, 'mix-05', 'Mixed'], [512, 'mix-02', 'by'], [550, 'mix-00', 'hand'],
]
export const IntroCuts: React.FC = () => {
  const f = useCurrentFrame()
  let c = CUTS[0]
  for (const x of CUTS) if (f >= x[0]) c = x
  return (
    <Frame bg={C.black} dark>
      <Img src={pic(c[1])} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.6) 100%)' }} />
      {c[2] && <div style={{ position: 'absolute', left: 90, top: 80, fontFamily: SERIF, fontSize: 120, color: '#fff', letterSpacing: -2, textShadow: '0 2px 30px rgba(0,0,0,.45)' }}>{c[2]}</div>}
      {/* Every photo is mounted once so the cuts never wait on a load. */}
      {CUTS.map(([, p]) => <Img key={p} src={pic(p)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />)}
    </Frame>
  )
}

// ─── 5. Her photos inside the type ──────────────────────────────────────────
// Big words, filled with her photos, sliding through one after another.
const WORDS: [number, number, string, string, number][] = [
  [0, 96, 'Impasto', 'stage-08', 300], [96, 172, 'for Yara.', 'other-01', 280],
  [172, 300, 'She paints.', 'other-00', 270],
  [300, 384, 'Thick paint.', 'stage-06', 270], [384, 474, 'With a knife.', 'stage-05', 250],
  [474, 600, 'By hand.', 'mix-05', 300],
]
export const IntroType: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <Frame bg={C.black} dark>
      {WORDS.map(([a, b, word, p, size]) => {
        if (f < a - 2 || f > b + 16) return null
        const x = (1 - ease(f, a, a + 18)) * 260 - ease(f, b - 2, b + 14) * 260
        const o = Math.min(ease(f, a, a + 12), 1 - ease(f, b - 2, b + 10))
        return (
          <AbsoluteFill key={word} style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: 110 }}>
            <div style={{ transform: `translateX(${x}px)`, opacity: o, fontFamily: SERIF, fontWeight: 800, fontSize: size, letterSpacing: -size * 0.035, lineHeight: 1,
              backgroundImage: `url(${pic(p)})`, backgroundSize: 'cover', backgroundPosition: 'center', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: 'drop-shadow(0 0 1px rgba(255,255,255,.25))', whiteSpace: 'nowrap' }}>{word}</div>
          </AbsoluteFill>
        )
      })}
      {WORDS.map(([, , w, p]) => <Img key={w} src={pic(p)} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />)}
    </Frame>
  )
}
