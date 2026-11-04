// §1 with Yara's own phone clips (portrait), four ways to fit them in a landscape frame.
// The clips are cut by scripts/intro-clips.sh into public/intro/. Same narration as the other intros.
import React from 'react'
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, Easing, staticFile, useCurrentFrame } from 'remotion'
import { Fade, Say, ease } from './kit'
import { INTRO_LEN, INTRO_SAY } from './intros'

const BG = '#1a1614'
// Length of each clip in frames, so it can loop instead of stopping.
const LEN: Record<string, number> = { 'brush-cat': 300, 'brush-gold': 300, 'brush-purple': 300, 'knife-white': 180, 'knife-purple': 285, ridges: 234, texture: 141, mix: 213, 'blank-live': 90, wall: 375 }
const STILLS = new Set(['blank-1', 'blank-2', 'tube', 'textured', 'wall-photo'])
const LAND = new Set(['blank-1', 'blank-2', 'blank-live'])

// One clip or photo, filling its box. `pos` is the CSS object-position.
const Media: React.FC<{ src: string; pos?: string; rate?: number; style?: React.CSSProperties }> = ({ src, pos = '50% 50%', rate = 1, style }) => {
  const st: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, ...style }
  if (STILLS.has(src)) return <Img src={staticFile(`intro/${src}.jpg`)} style={st} />
  return (
    <Loop durationInFrames={Math.floor(LEN[src] / rate)}>
      <OffthreadVideo src={staticFile(`intro/${src}.mp4`)} playbackRate={rate} muted style={st} />
    </Loop>
  )
}

const Frame: React.FC<{ children: React.ReactNode; dim?: boolean }> = ({ children, dim }) => (
  <AbsoluteFill style={{ background: BG }}>
    <Fade len={INTRO_LEN} inF={14} outF={14}>
      {children}
      {dim && <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,.55) 100%)' }} />}
      <Say lines={INTRO_SAY} dark />
    </Fade>
  </AbsoluteFill>
)

// The shots in order, cut on the words. Used by the one-at-a-time and full-frame versions.
type Shot = { a: number; b: number; src: string; rate?: number; pos?: string }
const SHOTS: Shot[] = [
  { a: 0, b: 172, src: 'brush-cat', pos: '50% 45%' },
  { a: 172, b: 248, src: 'blank-live' },
  { a: 248, b: 300, src: 'wall', rate: 1.5, pos: '50% 32%' },
  { a: 300, b: 362, src: 'knife-white', pos: '50% 60%' },
  { a: 362, b: 420, src: 'knife-purple', pos: '50% 70%' },
  { a: 420, b: 474, src: 'ridges' },
  { a: 474, b: 600, src: 'mix', rate: 1.6, pos: '50% 45%' },
]

// ─── a. Tall panels side by side ───────────────────────────────────────────
// Each line brings in its own set of panels, wiped up from the bottom; the set leaves together.
const PH = 790, PW = 444, PT = 52, GAP = 28
const COL = [0, 1, 2].map(i => (1920 - (3 * PW + 2 * GAP)) / 2 + i * (PW + GAP))
type Panel = { a: number; end: number; src: string; x: number; w?: number; rate?: number; pos?: string; cut?: number; then?: string }
const PANELS: Panel[] = [
  { a: 0, end: 172, src: 'brush-cat', x: COL[1], pos: '50% 40%' },
  { a: 30, end: 172, src: 'brush-gold', x: COL[0] },
  { a: 58, end: 172, src: 'brush-purple', x: COL[2] },
  { a: 172, end: 300, src: 'blank-live', x: 197, w: 1053 },
  { a: 240, end: 300, src: 'wall', x: 1278, rate: 1.5, pos: '50% 30%' },
  { a: 300, end: 474, src: 'knife-white', x: COL[0], pos: '50% 60%' },
  { a: 360, end: 474, src: 'knife-purple', x: COL[1], pos: '50% 70%' },
  { a: 420, end: 474, src: 'ridges', x: COL[2] },
  { a: 474, end: 600, src: 'tube', x: COL[0], pos: '50% 50%' },
  { a: 474, end: 600, src: 'mix', x: COL[1], rate: 1.6, pos: '50% 45%' },
  { a: 500, end: 600, src: 'textured', x: COL[2], pos: '50% 50%' },
]
export const IntroPanels: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <Frame>
      {PANELS.map((p, i) => {
        if (f < p.a || f >= p.end) return null
        const inn = ease(f, p.a, p.a + 18)
        const out = p.end === 600 ? 0 : ease(f, p.end - 8, p.end)
        return (
          <div key={i} style={{ position: 'absolute', left: p.x, top: PT, width: p.w ?? PW, height: PH, borderRadius: 18, overflow: 'hidden',
            clipPath: `inset(${(1 - inn) * 100}% 0 0 0 round 18px)`, transform: `translateY(${(1 - inn) * 40}px)`, opacity: 1 - out,
            boxShadow: '0 30px 60px -30px rgba(0,0,0,.8)' }}>
            <Sequence from={p.a} layout="none">
              <Media src={p.cut && f >= p.cut ? p.then! : p.src} rate={p.rate} pos={p.pos} />
            </Sequence>
          </div>
        )
      })}
    </Frame>
  )
}

// ─── b. One clip at a time, over a blurred copy of itself ──────────────────
export const IntroBlur: React.FC = () => (
  <Frame>
    {SHOTS.map((s, i) => {
      const land = LAND.has(s.src)
      const H = 800, W = land ? Math.round(H * 4 / 3) : Math.round(H * 9 / 16)
      return (
        <Sequence key={i} from={s.a} durationInFrames={s.b - s.a}>
          <BlurShot s={s} W={W} H={H} />
        </Sequence>
      )
    })}
  </Frame>
)
const BlurShot: React.FC<{ s: Shot; W: number; H: number }> = ({ s, W, H }) => {
  const f = useCurrentFrame()
  const pop = ease(f, 0, 14)
  return (
    <AbsoluteFill>
      <Media src={s.src} rate={s.rate} style={{ filter: 'blur(48px) brightness(.42) saturate(1.2)', transform: 'scale(1.25)' }} />
      <div style={{ position: 'absolute', left: (1920 - W) / 2, top: 40, width: W, height: H, borderRadius: 20, overflow: 'hidden',
        transform: `scale(${0.97 + 0.03 * pop})`, boxShadow: '0 40px 80px -30px rgba(0,0,0,.85)' }}>
        <Media src={s.src} rate={s.rate} pos={s.pos} />
      </div>
    </AbsoluteFill>
  )
}

// ─── c. Full frame ─────────────────────────────────────────────────────────
// Cropped to fill the screen. Softer, because a slice of a portrait clip is blown up.
export const IntroFull: React.FC = () => (
  <Frame dim>
    {SHOTS.map((s, i) => (
      <Sequence key={i} from={s.a} durationInFrames={s.b - s.a}>
        <Media src={s.src} rate={s.rate} pos={s.pos} />
      </Sequence>
    ))}
  </Frame>
)

// ─── d. A strip of clips sliding past ──────────────────────────────────────
// All the clips in a row, playing, drifting left; the one in the middle is big and bright.
const CW = 420, CH = 746, STEP = 470
const STRIP: { src: string; at: number; rate?: number; pos?: string }[] = [
  { src: 'brush-cat', at: 70, pos: '50% 40%' },
  { src: 'blank-live', at: 205, pos: '62% 50%' },
  { src: 'wall', at: 268, rate: 1.2, pos: '50% 30%' },
  { src: 'knife-white', at: 335, pos: '50% 60%' },
  { src: 'knife-purple', at: 392, pos: '50% 70%' },
  { src: 'ridges', at: 448 },
  { src: 'mix', at: 545, rate: 1.6, pos: '50% 45%' },
  { src: 'tube', at: 640 },
]
export const IntroStrip: React.FC = () => {
  const f = useCurrentFrame()
  // Which card is centered, as a smooth index over time.
  const idx = interpolate(f, [0, ...STRIP.map(s => s.at)], [-0.35, ...STRIP.map((_, i) => i)], { extrapolateRight: 'extend', easing: Easing.inOut(Easing.sin) })
  return (
    <Frame>
      {STRIP.map((s, i) => {
        const d = i - idx
        const ad = Math.min(Math.abs(d), 2)
        const cx = 960 + d * STEP
        if (cx < -CW || cx > 1920 + CW) return null
        const k = Math.max(0, 1 - ad)
        const sc = 0.86 + 0.24 * k
        return (
          <div key={i} style={{ position: 'absolute', left: cx - CW / 2, top: 64, width: CW, height: CH, borderRadius: 18, overflow: 'hidden',
            transform: `scale(${sc})`, transformOrigin: '50% 50%', zIndex: Math.round(k * 10),
            filter: `brightness(${0.45 + 0.55 * k}) saturate(${0.6 + 0.4 * k})`, boxShadow: `0 30px 70px -30px rgba(0,0,0,${0.4 + 0.5 * k})` }}>
            <Media src={s.src} rate={s.rate} pos={s.pos} />
          </div>
        )
      })}
    </Frame>
  )
}

// ─── e. Near full frame ────────────────────────────────────────────────────
// Like the full-frame version, but each upright clip is blown up about 2× instead of 2.7×:
// it fills the height and 1440 px of the width, and fades at its sides into a blurred copy of itself.
const NW = 1440
export const IntroNear: React.FC = () => (
  <Frame dim>
    {SHOTS.map((s, i) => {
      const land = LAND.has(s.src)
      const w = land ? 1920 : NW
      const fadeEdge = 'linear-gradient(90deg, transparent 0, #000 140px, #000 calc(100% - 140px), transparent 100%)'
      return (
        <Sequence key={i} from={s.a} durationInFrames={s.b - s.a}>
          {!land && <Media src={s.src} rate={s.rate} pos={s.pos} style={{ filter: 'blur(40px) brightness(.5) saturate(1.1)', transform: 'scale(1.15)' }} />}
          <div style={{ position: 'absolute', top: 0, height: 1080, left: (1920 - w) / 2, width: w, overflow: 'hidden',
            WebkitMaskImage: land ? undefined : fadeEdge, maskImage: land ? undefined : fadeEdge }}>
            <Media src={s.src} rate={s.rate} pos={s.pos} />
          </div>
        </Sequence>
      )
    })}
  </Frame>
)
