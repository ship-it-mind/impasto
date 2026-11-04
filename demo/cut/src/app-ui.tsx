// The five stops, shown with the real app: pieces of its screens captured from the example piece
// (scripts/capture-app.mjs → public/app-ui/, at 2x), animated in to match the narration.
import React from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, Easing, staticFile, useCurrentFrame } from 'remotion'
import { App, C, ease } from './kit'
import { BOWL_SAY, COLORS_SAY, IDEA_SAY, SEE_SAY, STEPS_SAY, STEP_SAY } from './app-scenes'

// A captured piece of the app, as a card. Images are 2x, so `w` is the shown width in px.
const Piece: React.FC<{ src: string; x: number; y: number; w: number; a?: number; style?: React.CSSProperties; children?: React.ReactNode; flat?: boolean }> = ({ src, x, y, w, a = 0, style, children, flat }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, borderRadius: 18, overflow: 'hidden', background: '#fbfaf7',
      boxShadow: flat ? 'none' : '0 30px 70px -30px rgba(60,40,30,.45), 0 0 0 1px rgba(60,40,30,.07)',
      opacity: ease(f, a, a + 12), transform: `translateY(${(1 - ease(f, a, a + 20)) * 26}px)`, ...style }}>
      <Img src={staticFile(`app-ui/${src}.png`)} style={{ width: '100%', display: 'block' }} />
      {children}
    </div>
  )
}
// Part of a captured piece: `r` is [x0, y0, x1, y1] as fractions of the image (iw × ih px), shown `w` wide.
const Crop: React.FC<{ src: string; iw: number; ih: number; r: [number, number, number, number]; x: number; y: number; w: number; a?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ src, iw, ih, r, x, y, w, a = 0, style, children }) => {
  const f = useCurrentFrame()
  const [x0, y0, x1, y1] = r, full = w / (x1 - x0), h = full * (ih / iw) * (y1 - y0)
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 18, overflow: 'hidden', background: '#fbfaf7',
      boxShadow: '0 30px 70px -30px rgba(60,40,30,.45), 0 0 0 1px rgba(60,40,30,.07)', opacity: ease(f, a, a + 12), transform: `translateY(${(1 - ease(f, a, a + 20)) * 26}px)`, ...style }}>
      <Img src={staticFile(`app-ui/${src}.png`)} style={{ position: 'absolute', width: full, left: -x0 * full, top: -y0 * full * ih / iw }} />
      {children}
    </div>
  )
}
// Covers part of a piece in its background color, then wipes away left to right: things appearing in the app.
const Wipe: React.FC<{ l: number; t: number; w: number; h: number; a: number; b: number; color?: string }> = ({ l, t, w, h, a, b, color = '#fff' }) => {
  const f = useCurrentFrame()
  const k = interpolate(f, [a, b], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ position: 'absolute', left: `${(l + w * k) * 100}%`, top: `${t * 100}%`, width: `${w * (1 - k) * 100}%`, height: `${h * 100}%`, background: color }} />
}
// Covers a piece from `from` (a fraction of its height) down, and uncovers it top to bottom.
const Reveal: React.FC<{ from: number; a: number; b: number }> = ({ from, a, b }) => {
  const f = useCurrentFrame()
  const k = interpolate(f, [a, b], [from, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ position: 'absolute', left: 0, right: 0, top: `${k * 100}%`, bottom: 0, background: 'linear-gradient(180deg, rgba(251,250,247,0), #fbfaf7 40px)' }} />
}
const Pop: React.FC<{ l: number; t: number; w: number; h: number; at: number; color?: string }> = ({ l, t, w, h, at, color = '#fff' }) => {
  const f = useCurrentFrame()
  return <div style={{ position: 'absolute', left: `${l * 100}%`, top: `${t * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, background: color, opacity: 1 - ease(f, at, at + 8) }} />
}

// ─── Idea ───────────────────────────────────────────────────────────────────
// The box as she filled it (wall, the picture to paint, her words), then the brief, the size on her wall and the details.
export const UiIdea: React.FC = () => {
  const f = useCurrentFrame()
  const away = ease(f, 140, 160)
  return (
    <App stop={0} len={300} say={IDEA_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        <div style={{ opacity: 1 - away, transform: `translateY(${-away * 60}px)` }}>
          <Piece src="idea-box" x={(1920 - 1240) / 2} y={250} w={1240} a={4} style={{ transform: `scale(${1 + 0.03 * ease(f, 20, 140)})` }}>
            {/* 720 × 256 css box: the wall and the picture pop in, then her words appear line by line. */}
            <Pop l={0.01} t={0.03} w={0.105} h={0.42} at={22} />
            <Pop l={0.115} t={0.03} w={0.105} h={0.42} at={40} />
            <Wipe l={0.01} t={0.47} w={0.98} h={0.105} a={62} b={98} />
            <Wipe l={0.01} t={0.575} w={0.98} h={0.105} a={98} b={118} />
          </Piece>
        </div>
        {f >= 145 && <Sequence from={145} layout="none"><IdeaBrief /></Sequence>}
      </AbsoluteFill>
    </App>
  )
}
const IdeaBrief: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill>
      <Piece src="idea-wall" x={150} y={150} w={540} a={2} style={{ transformOrigin: '50% 30%' }} />
      <Piece src="idea-brief" x={730} y={160} w={1060} a={10} />
      <Piece src="idea-size" x={730} y={290} w={1060} a={34} />
      <Piece src="idea-details" x={750} y={540} w={1020} a={56} flat style={{ background: 'transparent' }} />
      {/* Draw the eye to the canvas sized on her wall. */}
      <div style={{ position: 'absolute', left: 150 + 540 * 0.32, top: 150 + 540 * (1922 / 1440) * 0.224, width: 540 * 0.386, height: 540 * (1922 / 1440) * 0.338, borderRadius: 6,
        boxShadow: `0 0 0 ${4 * ease(f, 70, 84)}px ${C.plum}`, opacity: ease(f, 70, 84) }} />
    </AbsoluteFill>
  )
}

// ─── See it ─────────────────────────────────────────────────────────────────
export const UiSee: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <App stop={1} len={150} say={SEE_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        <Piece src="see-wall" x={300} y={140} w={585} a={0} style={{ transform: `scale(${1 + 0.05 * ease(f, 10, 150)})`, transformOrigin: '50% 45%' }} />
        <Piece src="see-title" x={990} y={250} w={640} a={14} flat style={{ background: 'transparent' }} />
      </AbsoluteFill>
    </App>
  )
}

// ─── Colors ─────────────────────────────────────────────────────────────────
// What she'll need (her tubes, ticked), how much (the totals), then how to mix the first band.
export const UiColors: React.FC = () => {
  const f = useCurrentFrame()
  const mix = ease(f, 196, 216)
  // What she'll need, 1.5x: a window on the list that scrolls down it as it's read.
  const NW = 1020, NH = NW * 1366 / 1360, WIN = 760
  const scroll = interpolate(f, [40, 170], [0, NH - WIN], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin) })
  return (
    <App stop={2} len={330} say={COLORS_SAY}>
      <AbsoluteFill style={{ background: C.paper }}>
        <div style={{ opacity: 1 - mix, transform: `translateX(${-mix * 60}px)` }}>
          <div style={{ position: 'absolute', left: 150, top: 150, width: NW, height: WIN, borderRadius: 18, overflow: 'hidden', background: '#fbfaf7',
            boxShadow: '0 30px 70px -30px rgba(60,40,30,.45), 0 0 0 1px rgba(60,40,30,.07)', opacity: ease(f, 4, 16), transform: `translateY(${(1 - ease(f, 4, 24)) * 26}px)` }}>
            <Img src={staticFile('app-ui/colors-need.png')} style={{ width: NW, display: 'block', transform: `translateY(${-scroll}px)` }} />
          </div>
          {/* How much: the two totals, 2x */}
          <Crop src="colors-summary" iw={784} ih={1316} r={[0, 0.67, 1, 1]} x={1220} y={300} w={560} a={100}>
            <div style={{ position: 'absolute', left: '3%', top: '58%', width: '94%', height: '36%', borderRadius: 12, boxShadow: `0 0 0 ${4 * ease(f, 118, 132)}px ${C.plum}`, opacity: ease(f, 118, 132) }} />
          </Crop>
        </div>
        {/* How to mix the first band, 1.85x */}
        <Piece src="colors-mix" x={(1920 - 1258) / 2} y={150} w={1258} a={200} />
      </AbsoluteFill>
    </App>
  )
}

// ─── Steps ──────────────────────────────────────────────────────────────────
// The eight steps as the app shows them, each with its picture, moving up one at a time.
const STEP_AT = [20, 56, 92, 128, 164, 200, 236, 272]
export const UiSteps: React.FC = () => {
  const f = useCurrentFrame()
  const W = 1400, H = W * 958 / 1888, GAP = 140, CY = 520
  const idx = interpolate(f, STEP_AT, STEP_AT.map((_, i) => i), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  return (
    <App stop={3} len={330} say={STEPS_SAY}>
      <AbsoluteFill style={{ background: C.paper, overflow: 'hidden' }}>
        {STEP_AT.map((_, i) => {
          const d = i - idx, ad = Math.min(Math.abs(d), 1.5)
          const y = CY - H / 2 + d * (H + GAP)
          if (y > 1100 || y < -H - 100) return null
          return (
            <div key={i} style={{ position: 'absolute', left: (1920 - W) / 2, top: y, width: W, transform: `scale(${1 - 0.06 * ad})`, opacity: 1 - 0.55 * Math.min(ad, 1),
              borderRadius: 20, overflow: 'hidden', background: '#fbfaf7', boxShadow: `0 30px 70px -30px rgba(60,40,30,${0.5 - 0.3 * Math.min(ad, 1)}), 0 0 0 1px rgba(60,40,30,.07)` }}>
              <Img src={staticFile(`app-ui/step-${String(i + 1).padStart(2, '0')}.png`)} style={{ width: '100%', display: 'block' }} />
            </div>
          )
        })}
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.paper} 0, rgba(243,238,231,0) 150px, rgba(243,238,231,0) 840px, ${C.paper} 960px)` }} />
      </AbsoluteFill>
    </App>
  )
}

// ─── Check-ins: the bowl ────────────────────────────────────────────────────
// Her bowl photo, the point that was read, and the app's saved result for it.
export const UiBowl: React.FC = () => {
  const f = useCurrentFrame()
  const W = 520, H = W * 1208 / 1280
  const ring = ease(f, 26, 42)
  return (
    <App stop={4} len={270} say={BOWL_SAY} tag="Saved result">
      <AbsoluteFill style={{ background: C.paper }}>
        <div style={{ position: 'absolute', left: 130, top: 210, width: W, height: H, borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 70px -30px rgba(60,40,30,.5)', opacity: ease(f, 0, 12) }}>
          <Img src={staticFile('app/bowl.jpg')} style={{ width: '100%', height: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', left: 723 / 1280 * W - 34, top: 531 / 1208 * H - 34, width: 68, height: 68, borderRadius: 68, border: '5px solid #fff', boxShadow: '0 0 0 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.4)', opacity: ring, transform: `scale(${1.6 - 0.6 * ring})` }} />
        </div>
        {/* The band, its recipe and the verdict, 1.75x */}
        <Crop src="check-bowl" iw={1656} ih={402} r={[0, 0, 0.7, 0.44]} x={690} y={230} w={1100} a={40}>
          <div style={{ position: 'absolute', left: '8%', top: '79%', width: '86%', height: '19%', borderRadius: 8, boxShadow: `0 0 0 ${3 * ease(f, 70, 84)}px ${C.plum}`, opacity: ease(f, 70, 84) }} />
        </Crop>
        {/* How to fix it: the first line of its advice, 2x */}
        <Crop src="check-bowl" iw={1656} ih={402} r={[0.04, 0.47, 0.52, 0.595]} x={690} y={520} w={800} a={140} />
      </AbsoluteFill>
    </App>
  )
}

// ─── Check-ins: a step ──────────────────────────────────────────────────────
// Steps 06 and 07 opened: her photo, how it should look, and what was said about it.
const STEP_PARTS = [
  { k: '06', a: 0, b: 172, vh: 579 },
  { k: '07', a: 172, b: 330, vh: 423 },
]
export const UiStepCheck: React.FC = () => {
  const f = useCurrentFrame()
  const PH = 480
  return (
    <App stop={4} len={330} say={STEP_SAY} tag="Saved result">
      <AbsoluteFill style={{ background: C.paper }}>
        {STEP_PARTS.map(({ k, a, b, vh }) => {
          if (f < a - 2 || f > b) return null
          const out = b === 330 ? 0 : ease(f, b - 12, b)
          const tw = PH * 720 / 912, pw = PH * 720 / 1029
          return (
            <Sequence key={k} from={a} layout="none">
              <div style={{ opacity: 1 - out, transform: `translateY(${-out * 40}px)` }}>
                {/* The step's row, as the app heads it */}
                <Crop src={`check-${k}`} iw={1656} ih={1468} r={[0, 0, 0.97, 0.068]} x={150} y={150} w={1130} a={0} style={{ boxShadow: 'none', background: 'transparent' }} />
                <Piece src={`check-${k}-target`} x={150} y={250} w={tw} a={6} />
                <Piece src={`check-${k}-photo`} x={150 + tw + 28} y={250} w={pw} a={14} />
                <Piece src={`check-${k}-verdict`} x={150 + tw + pw + 70} y={250 + PH / 2 - (1770 - (150 + tw + pw + 70)) * vh / 1620 / 2} w={1770 - (150 + tw + pw + 70)} a={40} />
              </div>
            </Sequence>
          )
        })}
      </AbsoluteFill>
    </App>
  )
}

// All five, in a row, to preview.
const ALL: [React.FC, number][] = [[UiIdea, 300], [UiSee, 150], [UiColors, 330], [UiSteps, 330], [UiBowl, 270], [UiStepCheck, 330]]
export const UI_ALL_LEN = ALL.reduce((a, [, n]) => a + n, 0)
export const UiAll: React.FC = () => {
  let at = 0
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {ALL.map(([S, n], i) => { const from = at; at += n; return <Sequence key={i} from={from} durationInFrames={n}><S /></Sequence> })}
    </AbsoluteFill>
  )
}
