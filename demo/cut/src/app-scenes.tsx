// §4 and the check-ins as designed scenes instead of screen recordings. Every number, word and
// picture here is the example piece's saved result (example/piece.json and example/images/),
// the run behind the film: the brief, the plan, the recipe, the steps and the check-ins.
import React, { useEffect, useState } from 'react'
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { App, C, SANS, SERIF, ease } from './kit'

const CARD: React.CSSProperties = { position: 'absolute', borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 70px -30px rgba(60,40,30,.45), 0 0 0 1px rgba(60,40,30,.06)' }
const LABEL: React.CSSProperties = { fontFamily: SANS, fontSize: 22, fontWeight: 600, letterSpacing: 2.4, textTransform: 'uppercase', color: C.soft }
const rise = (f: number, a: number, d = 18) => ({ opacity: ease(f, a, a + d * 0.7), transform: `translateY(${(1 - ease(f, a, a + d)) * 24}px)` })
const count = (f: number, a: number, b: number, to: number) => Math.round(interpolate(f, [a, b], [0, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
const kg = (g: number) => `${(g / 1000).toFixed(2)} kg`

// ─── The plan's bands, for "how the canvas should look after" each step ─────
type Sketch = { w: number; h: number; order: number[]; bands: { name: string; hex: string; fills: string[] }[] }
function useSketch() {
  const [s, set] = useState<Sketch | null>(null)
  const [h] = useState(() => delayRender('sketch'))
  useEffect(() => { fetch(staticFile('hook/sketch.json')).then(r => r.json()).then(d => { set(d); continueRender(h) }) }, [h])
  return s
}
// The canvas with `done` bands painted from the plan's picture, the rest as pencil lines. `fresh` fades in.
const CanvasAt: React.FC<{ s: Sketch; id: string; done: number[]; fresh?: number; freshO?: number; w: number; lines?: boolean }> = ({ s, id, done, fresh, freshO = 1, w, lines = true }) => {
  const h = w * s.h / s.w
  const all = fresh === undefined ? done : [...done, fresh]
  return (
    <svg viewBox={`0 0 ${s.w} ${s.h}`} width={w} height={h} style={{ display: 'block' }}>
      <rect width={s.w} height={s.h} fill="#f6f3ee" />
      {lines && s.bands.map((b, k) => b.fills.map((d, i) => <path key={`${k}-${i}`} d={d} fill="none" stroke="rgba(60,50,45,.35)" strokeWidth={2.2} />))}
      <defs>
        {all.map(k => <clipPath key={k} id={`${id}-${k}`}>{s.bands[k].fills.map((d, i) => <path key={i} d={d} />)}</clipPath>)}
      </defs>
      {all.map(k => <image key={k} href={staticFile('app/plan.png')} width={s.w} height={s.h} clipPath={`url(#${id}-${k})`} preserveAspectRatio="none" opacity={k === fresh ? freshO : 1} />)}
    </svg>
  )
}

// ─── Idea ───────────────────────────────────────────────────────────────────
const TRANSCRIPT = 'This is the wall of my office room. I wanna paint this exact reference I shared with you, can you help with that?'
// Her wall photo is 1536 × 2048 and about 300 cm across (Spark's read of it). The canvas: 115 × 135 cm, centred where Spark put it.
const WALL = { cm: 300, cx: 0.5, cy: 0.42, w: 115, h: 135 }
const OnWall: React.FC<{ W: number; fill: number; box: number; dims?: number }> = ({ W, fill, box, dims = 0 }) => {
  const H = W * 2048 / 1536, px = W / WALL.cm
  const cw = WALL.w * px, ch = WALL.h * px, x = WALL.cx * W - cw / 2, y = WALL.cy * H - ch / 2
  const dim: React.CSSProperties = { position: 'absolute', fontFamily: SANS, fontSize: 22, fontWeight: 600, color: C.ink, background: 'rgba(255,255,255,.9)', padding: '4px 10px', borderRadius: 8, opacity: dims, whiteSpace: 'nowrap' }
  return (
    <div style={{ position: 'relative', width: W, height: H }}>
      <Img src={staticFile('app/wall.jpg')} style={{ width: W, height: H, display: 'block' }} />
      <div style={{ position: 'absolute', left: x, top: y, width: cw, height: ch, opacity: box, border: `${3 * (1 - fill)}px solid #5aa9d6`, background: `rgba(120,190,230,${0.45 * (1 - fill)})`,
        boxShadow: fill > 0 ? `0 ${18 * fill}px ${30 * fill}px -12px rgba(0,0,0,${0.45 * fill})` : 'none' }}>
        <Img src={staticFile('app/plan.png')} style={{ width: '100%', height: '100%', display: 'block', opacity: fill }} />
      </div>
      <div style={{ ...dim, left: x + cw / 2, top: y - 40, transform: 'translateX(-50%)' }}>{WALL.w} cm</div>
      <div style={{ ...dim, left: x + cw + 12, top: y + ch / 2 - 16 }}>{WALL.h} cm</div>
    </div>
  )
}
export const IDEA_SAY: [number, number, string][] = [
  [10, 140, "Here's how it works. It starts with the idea. Yara says it out loud: this wall, and a painting she loves."],
  [150, 290, 'Impasto turns what she said into a brief, and sizes the canvas to the wall.'],
]
const Row: React.FC<{ k: string; children: React.ReactNode; a: number }> = ({ k, children, a }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, padding: '14px 0', borderTop: '1px solid rgba(31,26,23,.1)', fontFamily: SANS, fontSize: 30, ...rise(f, a, 14) }}>
      <span style={{ color: C.soft }}>{k}</span><span style={{ color: C.ink }}>{children}</span>
    </div>
  )
}
export const IdeaScene: React.FC = () => {
  const f = useCurrentFrame()
  const brief = ease(f, 140, 166)
  const words = TRANSCRIPT.split(' ')
  const shown = Math.round(interpolate(f, [62, 128], [0, words.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const WW = interpolate(brief, [0, 1], [480, 530])
  return (
    <App stop={0} len={300} say={IDEA_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        {/* Her wall, then sized */}
        <div style={{ ...CARD, left: interpolate(brief, [0, 1], [190, 230]), top: 160, ...rise(f, 6) }}>
          <OnWall W={WW} fill={0} box={ease(f, 190, 206)} dims={ease(f, 206, 220)} />
        </div>
        <div style={{ position: 'absolute', left: interpolate(brief, [0, 1], [190, 230]), top: 160 + WW * 4 / 3 + 16, ...LABEL, opacity: ease(f, 14, 26) }}>Her wall</div>
        {/* The picture to paint */}
        <div style={{ ...CARD, left: 700, top: 160, width: 480, height: 640, opacity: ease(f, 26, 38) * (1 - brief), transform: `translateY(${(1 - ease(f, 26, 44)) * 24}px)` }}>
          <Img src={staticFile('app/to-paint.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div style={{ position: 'absolute', left: 700, top: 816, ...LABEL, opacity: ease(f, 34, 46) * (1 - brief) }}>The picture to paint</div>
        {/* What she said */}
        <div style={{ position: 'absolute', left: 1250, top: 180, width: 520, opacity: 1 - brief, ...(brief === 0 ? rise(f, 46) : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
            <div style={{ width: 64, height: 64, borderRadius: 64, background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 44 }}>
              {Array.from({ length: 22 }, (_, i) => <div key={i} style={{ width: 6, borderRadius: 3, background: C.plum, height: f > 50 && f < 132 ? 8 + 30 * Math.abs(Math.sin(f / 4 + i * 1.7)) * Math.abs(Math.sin(i * 0.9 + f / 11)) : 8 }} />)}
            </div>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 1.25, color: C.ink, letterSpacing: -0.5 }}>
            “{words.slice(0, shown).join(' ')}{shown >= words.length ? '”' : ''}
          </div>
        </div>
        {/* The brief */}
        <div style={{ position: 'absolute', left: 860, top: 190, width: 860, opacity: brief, transform: `translateX(${(1 - brief) * 40}px)` }}>
          <div style={{ ...LABEL, marginBottom: 14 }}>The brief</div>
          <div style={{ fontFamily: SERIF, fontSize: 56, lineHeight: 1.12, color: C.ink, letterSpacing: -1, marginBottom: 30 }}>Exact copy of the shared reference for the office wall.</div>
          <Row k="Size" a={176}>115 × 135 cm, portrait</Row>
          <Row k="Room" a={184}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>office room <span style={{ width: 26, height: 26, borderRadius: 26, background: '#EDEAE3', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} /><span style={{ color: C.soft, fontSize: 24 }}>wall color from the photo</span></span></Row>
          <Row k="Colors" a={192}><span style={{ color: C.soft }}>From the picture</span></Row>
          <Row k="Mood & style" a={200}><span style={{ color: C.soft }}>From the picture</span></Row>
        </div>
      </AbsoluteFill>
    </App>
  )
}

// ─── See it ─────────────────────────────────────────────────────────────────
export const SEE_SAY: [number, number, string][] = [[6, 145, 'Then she sees it: a photo of her wall, with the painting hung at its real size.']]
export const SeeScene: React.FC = () => {
  const f = useCurrentFrame()
  const W = 585
  return (
    <App stop={1} len={150} say={SEE_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        <div style={{ ...CARD, left: (1920 - W) / 2, top: 140, transform: `scale(${1.04 - 0.04 * ease(f, 0, 60)})` }}>
          <OnWall W={W} fill={ease(f, 18, 52)} box={1} dims={ease(f, 52, 66)} />
        </div>
      </AbsoluteFill>
    </App>
  )
}

// ─── Colors ─────────────────────────────────────────────────────────────────
// The recipe for this piece: target color, grams of paint and paste, and the parts to mix.
const BANDS: { name: string; hex: string; paint: number; paste: number; level: string; parts: [string, number][] }[] = [
  { name: 'Warm Linen Beige', hex: '#d2bda8', paint: 1040, paste: 2432, level: 'medium', parts: [['Modeling Paste', 35], ['Yellow Ochre', 13], ['Quinacridone Magenta', 3], ['Ultramarine Blue', 3]] },
  { name: 'Dusty Rose', hex: '#ab887e', paint: 836, paste: 1954, level: 'heavy', parts: [['Modeling Paste', 19], ['Cadmium Red', 3], ['Mars Black', 7]] },
  { name: 'Deep Burgundy Brown', hex: '#391e20', paint: 552, paste: 1291, level: 'heavy', parts: [['Modeling Paste', 6], ['Quinacridone Magenta', 2], ['Ultramarine Blue', 1]] },
  { name: 'Sage Grey', hex: '#a2957d', paint: 273, paste: 638, level: 'medium', parts: [['Modeling Paste', 22], ['Sap Green', 1], ['Burnt Sienna', 3], ['Mars Black', 8]] },
  { name: 'Muted Plum', hex: '#694445', paint: 153, paste: 357, level: 'medium', parts: [['Modeling Paste', 4], ['Quinacridone Magenta', 1], ['Mars Black', 1]] },
  { name: 'Olive Taupe', hex: '#968972', paint: 123, paste: 288, level: 'medium', parts: [['Modeling Paste', 20], ['Burnt Sienna', 3], ['Mars Black', 8]] },
]
const TOTAL = { paint: 2976, paste: 6959 }
const TUBES = ['Mars Black', 'Yellow Ochre', 'Quinacridone Magenta', 'Ultramarine Blue', 'Cadmium Red', 'Burnt Sienna', 'Sap Green', 'Modeling Paste']
const TUBE_HEX: Record<string, string> = { 'Modeling Paste': '#f1ede4', 'Yellow Ochre': '#c8952e', 'Quinacridone Magenta': '#8d2558', 'Ultramarine Blue': '#28398e', 'Mars Black': '#1f1d1c', 'Cadmium Red': '#c3302a', 'Burnt Sienna': '#8a482a', 'Sap Green': '#4b5b26' }
export const COLORS_SAY: [number, number, string][] = [[8, 320, 'Then the colors: every one she needs, how much to make, and how to mix it from the tubes she has.']]
export const ColorsScene: React.FC = () => {
  const f = useCurrentFrame()
  const SW = 248, GAP = 20, X0 = (1920 - (6 * SW + 5 * GAP)) / 2
  const pick = ease(f, 236, 252)
  const r = BANDS[0], partsTotal = r.parts.reduce((a, [, n]) => a + n, 0)
  return (
    <App stop={2} len={330} say={COLORS_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        {BANDS.map((b, i) => {
          const a = 14 + i * 9
          return (
            <div key={b.name} style={{ position: 'absolute', left: X0 + i * (SW + GAP), top: 150, width: SW, ...rise(f, a),
              filter: i > 0 ? `saturate(${1 - 0.5 * pick}) opacity(${1 - 0.45 * pick})` : 'none' }}>
              <div style={{ height: 170, borderRadius: 18, background: b.hex, boxShadow: `0 20px 40px -24px ${b.hex}, inset 0 0 0 1px rgba(0,0,0,.08)`, outline: i === 0 ? `${4 * pick}px solid ${C.ink}` : 'none', outlineOffset: 5 }} />
              <div style={{ fontFamily: SANS, fontSize: 26, fontWeight: 600, color: C.ink, marginTop: 14, lineHeight: 1.15 }}>{b.name}</div>
              <div style={{ fontFamily: SANS, fontSize: 21, color: C.soft, marginTop: 4 }}>{b.level} relief</div>
              <div style={{ fontFamily: SANS, fontSize: 24, color: C.ink, marginTop: 12, opacity: ease(f, 96 + i * 6, 110 + i * 6), fontVariantNumeric: 'tabular-nums' }}>
                {count(f, 96 + i * 6, 140 + i * 6, b.paint).toLocaleString('en')} g paint<br />
                <span style={{ color: C.soft }}>{count(f, 96 + i * 6, 140 + i * 6, b.paste).toLocaleString('en')} g paste</span>
              </div>
            </div>
          )
        })}
        {/* Totals */}
        <div style={{ position: 'absolute', left: X0, top: 520, display: 'flex', gap: 40, alignItems: 'baseline', fontFamily: SANS, ...rise(f, 150) }}>
          <span style={{ fontFamily: SERIF, fontSize: 52, color: C.ink, letterSpacing: -1 }}>{kg(count(f, 150, 200, TOTAL.paint))} <span style={{ fontSize: 30, fontFamily: SANS, color: C.soft }}>paint to mix</span></span>
          <span style={{ fontFamily: SERIF, fontSize: 52, color: C.ink, letterSpacing: -1 }}>{kg(count(f, 150, 200, TOTAL.paste))} <span style={{ fontSize: 30, fontFamily: SANS, color: C.soft }}>modeling paste</span></span>
        </div>
        {/* The tubes she has */}
        <div style={{ position: 'absolute', left: X0, top: 620, display: 'flex', gap: 12, flexWrap: 'wrap', width: 6 * SW + 5 * GAP, opacity: 1 - pick }}>
          {TUBES.map((t, i) => {
            const a = 196 + i * 4
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 10px', borderRadius: 999, background: '#fff', boxShadow: '0 0 0 1px rgba(31,26,23,.1)', fontFamily: SANS, fontSize: 24, color: C.ink, ...rise(f, a, 12) }}>
                <span style={{ width: 30, height: 30, borderRadius: 30, background: TUBE_HEX[t], boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />{t}
                <span style={{ width: 28, height: 28, borderRadius: 28, background: ease(f, a + 10, a + 16) > 0.5 ? '#6f8a5e' : 'rgba(31,26,23,.12)', color: '#fff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
              </div>
            )
          })}
        </div>
        {/* How to mix the first band from them */}
        <div style={{ position: 'absolute', left: X0, top: 620, width: 6 * SW + 5 * GAP, opacity: pick, transform: `translateY(${(1 - pick) * 20}px)` }}>
          <div style={{ fontFamily: SANS, fontSize: 28, color: C.ink, marginBottom: 14 }}><b>Mix {r.name}</b> <span style={{ color: C.soft }}>· {r.parts.map(([n, p]) => `${p} ${n}`).join(' : ')}</span></div>
          <div style={{ display: 'flex', height: 70, borderRadius: 14, overflow: 'hidden', border: '1.5px solid rgba(31,26,23,.18)' }}>
            {r.parts.map(([n, p], i) => (
              <div key={n} style={{ width: `${(p / partsTotal) * 100 * ease(f, 250 + i * 8, 270 + i * 8)}%`, background: TUBE_HEX[n], display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: n === 'Modeling Paste' ? C.ink : '#fff', fontFamily: SANS, fontSize: 24, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>{p}</div>
            ))}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 22, color: C.soft, marginTop: 10, opacity: ease(f, 280, 292) }}>Parts by weight, from the tubes she has.</div>
        </div>
      </AbsoluteFill>
    </App>
  )
}

// ─── Steps ──────────────────────────────────────────────────────────────────
// The eight steps in her guide; `band` is the band each one lays.
const STEPS: { title: string; band: number | null }[] = [
  { title: 'Prepare the canvas and mark the bands', band: null },
  { title: 'Lay Muted Plum', band: 4 }, { title: 'Lay Olive Taupe', band: 5 }, { title: 'Lay Sage Grey', band: 3 },
  { title: 'Lay Warm Linen Beige', band: 0 }, { title: 'Lay Deep Burgundy Brown', band: 2 }, { title: 'Lay Dusty Rose', band: 1 },
  { title: 'Let it dry and finish', band: null },
]
const doneBy = (i: number) => STEPS.slice(0, i + 1).map(s => s.band).filter((b): b is number => b !== null)
export const STEPS_SAY: [number, number, string][] = [[8, 320, 'Then the steps: every stage in order, with a picture of how the canvas should look after it.']]
export const StepsScene: React.FC = () => {
  const f = useCurrentFrame()
  const s = useSketch()
  if (!s) return null
  const T0 = 30, D = 34
  const at = Math.max(0, Math.min(STEPS.length - 1, Math.floor((f - T0) / D)))
  const local = f - T0 - at * D
  const cur = STEPS[at]
  const prev = doneBy(at).filter(b => b !== cur.band)
  return (
    <App stop={3} len={330} say={STEPS_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        <div style={{ ...CARD, left: 210, top: 160, ...rise(f, 4) }}>
          <CanvasAt s={s} id="big" w={600} done={prev} fresh={cur.band ?? undefined} freshO={ease(local, 0, 16)} />
        </div>
        <div style={{ position: 'absolute', left: 210, top: 160 + 600 * s.h / s.w + 14, ...LABEL, opacity: ease(f, 10, 22) }}>After step {at + 1}</div>
        <div style={{ position: 'absolute', left: 900, top: 150, width: 820 }}>
          {STEPS.map((st, i) => {
            const on = i === at && f >= T0, past = i < at
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, height: 88, padding: '0 18px', borderRadius: 18, background: on ? '#fff' : 'transparent',
                boxShadow: on ? '0 16px 36px -22px rgba(60,40,30,.5), 0 0 0 1px rgba(60,40,30,.06)' : 'none', ...rise(f, 6 + i * 4, 14) }}>
                <div style={{ width: 46, height: 46, borderRadius: 46, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontSize: 22, fontWeight: 700,
                  background: on ? C.ink : past ? C.plum : 'rgba(31,26,23,.08)', color: on || past ? '#fff' : C.soft }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ flex: 1, fontFamily: SANS, fontSize: 30, fontWeight: on ? 600 : 500, color: on || past ? C.ink : C.soft }}>{st.title}</div>
                <div style={{ borderRadius: 6, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,.1)', opacity: past || on ? 1 : 0.45 }}>
                  <CanvasAt s={s} id={`t${i}`} w={60} done={doneBy(i)} lines={false} />
                </div>
              </div>
            )
          })}
        </div>
      </AbsoluteFill>
    </App>
  )
}

// ─── Check-ins: the bowl ────────────────────────────────────────────────────
// Saved check of the bowl against Deep Burgundy Brown's recipe: read at (723, 531) of the 1280 × 1208 photo.
export const BOWL_SAY: [number, number, string][] = [
  [8, 120, 'And she checks in. A photo of the paint in the bowl is measured against the recipe.'],
  [128, 262, "This is her plum mix, photographed while she painted. It's too dark, and Impasto says how to fix it."],
]
const Swatch: React.FC<{ hex: string; label: string; a: number }> = ({ hex, label, a }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ ...rise(f, a, 14) }}>
      <div style={{ width: 220, height: 150, borderRadius: 16, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
      <div style={{ fontFamily: SANS, fontSize: 24, color: C.soft, marginTop: 10 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 22, color: C.soft, opacity: 0.8 }}>{hex}</div>
    </div>
  )
}
export const BowlScene: React.FC = () => {
  const f = useCurrentFrame()
  const W = 660, H = W * 1208 / 1280, px = 723 / 1280 * W, py = 531 / 1208 * H
  const ring = ease(f, 30, 46)
  return (
    <App stop={4} len={270} say={BOWL_SAY} tag="Saved result">
      <AbsoluteFill style={{ background: C.paper }}>
        <div style={{ ...CARD, left: 190, top: 170, width: W, height: H, ...rise(f, 4) }}>
          <Img src={staticFile('app/bowl.jpg')} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', left: px, top: py, width: 70, height: 70, marginLeft: -35, marginTop: -35, borderRadius: 70, border: '5px solid #fff', boxShadow: '0 0 0 2px rgba(0,0,0,.35), 0 6px 20px rgba(0,0,0,.4)', opacity: ring, transform: `scale(${1.6 - 0.6 * ring})` }} />
        </div>
        <div style={{ position: 'absolute', left: 940, top: 200, width: 800 }}>
          <div style={{ ...LABEL, ...rise(f, 40, 14) }}>Checked against</div>
          <div style={{ fontFamily: SERIF, fontSize: 60, color: C.ink, letterSpacing: -1, marginTop: 6, ...rise(f, 44, 14) }}>Deep Burgundy Brown</div>
          <div style={{ display: 'flex', gap: 28, marginTop: 30 }}>
            <Swatch hex="#b37bb4" label="The recipe's mix" a={58} />
            <Swatch hex="#6d445d" label="In the bowl" a={70} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30, ...rise(f, 92, 14) }}>
            <span style={{ padding: '8px 18px', borderRadius: 999, background: '#c9604f', color: '#fff', fontFamily: SANS, fontSize: 26, fontWeight: 650 }}>Doesn't match</span>
            <span style={{ fontFamily: SANS, fontSize: 28, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>ΔE {(interpolate(f, [92, 118], [0, 25.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })).toFixed(1)} · darker and duller</span>
          </div>
          <div style={{ marginTop: 30, padding: '22px 26px', borderRadius: 18, background: '#fff', boxShadow: '0 0 0 1px rgba(31,26,23,.08), 0 16px 36px -24px rgba(60,40,30,.5)', ...rise(f, 150, 16) }}>
            <div style={{ fontFamily: SANS, fontSize: 30, color: C.ink, lineHeight: 1.3 }}>Mix in about <b>1 part Titanium White</b> to 2 parts of it.</div>
            <div style={{ display: 'flex', height: 34, borderRadius: 10, overflow: 'hidden', marginTop: 16, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }}>
              <div style={{ width: `${33.3 * ease(f, 168, 184)}%`, background: '#f7f6f1' }} />
              <div style={{ width: `${66.7 * ease(f, 176, 192)}%`, background: '#6d445d' }} />
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </App>
  )
}

// ─── Check-ins: the canvas at a step ────────────────────────────────────────
export const STEP_SAY: [number, number, string][] = [
  [8, 170, 'A photo of the canvas is compared with how that step should look.'],
  [178, 322, 'Burgundy needs work. Dusty Rose is on track.'],
]
const REVIEWS = [
  { photo: 'app/step-burgundy.jpg', step: 6, title: 'Lay Deep Burgundy Brown', verdict: 'Needs work', tone: '#c98a3a',
    headline: 'Burgundy center band is in place but its right side sits on bare canvas where beige should be.' },
  { photo: 'app/step-rose.jpg', step: 7, title: 'Lay Dusty Rose', verdict: 'On track', tone: '#6f8a5e',
    headline: 'Dusty Rose band is in place upper-middle with correct overlap over burgundy.' },
]
export const StepCheckScene: React.FC = () => {
  const f = useCurrentFrame()
  const s = useSketch()
  if (!s) return null
  return (
    <App stop={4} len={330} say={STEP_SAY} tag="Saved result">
      <AbsoluteFill style={{ background: C.paper }}>
        {REVIEWS.map((r, i) => {
          const a = i === 0 ? 0 : 170, end = i === 0 ? 170 : 330
          if (f < a - 2 || f > end) return null
          const o = Math.min(ease(f, a, a + 16), i === 0 ? 1 - ease(f, end - 12, end) : 1)
          const l = f - a
          return (
            <AbsoluteFill key={i} style={{ opacity: o }}>
              <div style={{ position: 'absolute', left: 170, top: 148, ...LABEL }}>Step {String(r.step).padStart(2, '0')} · {r.title}</div>
              <div style={{ ...CARD, left: 170, top: 196, width: 480, height: 640, ...rise(l, 4) }}>
                <Img src={staticFile(r.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ position: 'absolute', left: 170, top: 850, ...LABEL, fontSize: 19 }}>Her canvas</div>
              <div style={{ ...CARD, left: 680, top: 196, ...rise(l, 14) }}>
                <CanvasAt s={s} id={`r${i}`} w={545} done={doneBy(r.step - 1)} lines />
              </div>
              <div style={{ position: 'absolute', left: 680, top: 850, ...LABEL, fontSize: 19 }}>How it should look</div>
              <div style={{ position: 'absolute', left: 1270, top: 220, width: 470 }}>
                <span style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 999, background: r.tone, color: '#fff', fontFamily: SANS, fontSize: 30, fontWeight: 650, ...rise(l, 34, 14) }}>{r.verdict}</span>
                <div style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 1.2, color: C.ink, marginTop: 26, letterSpacing: -0.5, ...rise(l, 44, 16) }}>{r.headline}</div>
              </div>
            </AbsoluteFill>
          )
        })}
      </AbsoluteFill>
    </App>
  )
}

// All five in a row, to preview (the "make it warmer" change isn't here: it isn't in the example's saved results).
const ALL: [React.FC, number][] = [[IdeaScene, 300], [SeeScene, 150], [ColorsScene, 330], [StepsScene, 330], [BowlScene, 270], [StepCheckScene, 330]]
export const APP_ALL_LEN = ALL.reduce((a, [, n]) => a + n, 0)
export const AppScenes: React.FC = () => {
  let at = 0
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {ALL.map(([S, n], i) => { const from = at; at += n; return <Sequence key={i} from={from} durationInFrames={n}><S /></Sequence> })}
    </AbsoluteFill>
  )
}
