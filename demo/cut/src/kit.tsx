import React from 'react'
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

export const C = {
  paper: '#f3eee7',
  paperDeep: '#e9e2d8',
  ink: '#1f1a17',
  soft: '#6f655d',
  plum: '#6d3b4b',
  sage: '#8f927c',
  rose: '#b48c86',
  black: '#0f0d0c',
}
export const SERIF = "'Fraunces Variable', Georgia, serif"
export const SANS = "'Archivo Variable', system-ui, sans-serif"

const out = Easing.bezier(0.16, 1, 0.3, 1)
export const ease = (f: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out })

// Fades a whole scene in and out at its edges.
export const Fade: React.FC<{ len: number; inF?: number; outF?: number; children: React.ReactNode }> = ({ len, inF = 12, outF = 12, children }) => {
  const f = useCurrentFrame()
  const o = Math.min(inF ? ease(f, 0, inF) : 1, outF ? 1 - ease(f, len - outF, len) : 1)
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>
}

// A still photo with a slow push in or pan.
export const Photo: React.FC<{ src: string; len: number; from?: number; to?: number; x?: [number, number]; y?: [number, number]; dim?: number; whole?: boolean }> = ({ src, len, from = 1.04, to = 1.14, x = [0, 0], y = [0, 0], dim = 0, whole = false }) => {
  const f = useCurrentFrame()
  const k = interpolate(f, [0, len], [0, 1], { extrapolateRight: 'clamp' })
  const s = from + (to - from) * k
  return (
    <AbsoluteFill style={{ background: C.black, overflow: 'hidden' }}>
      {whole && <Img src={staticFile(src)} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(.55)', transform: 'scale(1.2)' }} />}
      <Img src={staticFile(src)} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: whole ? 'contain' : 'cover', transform: `scale(${s}) translate(${x[0] + (x[1] - x[0]) * k}%, ${y[0] + (y[1] - y[0]) * k}%)` }} />
      {dim > 0 && <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,${dim}) 100%)` }} />}
    </AbsoluteFill>
  )
}

// Narration, shown as large subtitles. `dark` is for text over photos.
export const Say: React.FC<{ lines: [number, number, string][]; dark?: boolean; bottom?: number }> = ({ lines, dark = true, bottom = 86 }) => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom, pointerEvents: 'none' }}>
      {lines.map(([a, b, t], i) => {
        if (f < a - 2 || f > b + 10) return null
        const o = Math.min(ease(f, a, a + 10), 1 - ease(f, b, b + 10))
        const ty = (1 - ease(f, a, a + 14)) * 14
        return (
          <div key={i} style={{ position: 'absolute', bottom, maxWidth: 1420, textAlign: 'center', opacity: o, transform: `translateY(${ty}px)`,
            fontFamily: SANS, fontSize: dark ? 44 : 40, lineHeight: 1.25, fontWeight: 500, letterSpacing: -0.4, textWrap: 'balance',
            color: dark ? '#fff' : C.ink, textShadow: dark ? '0 2px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.5)' : 'none' }}>
            {t}
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

// A small label, e.g. "Day 1 test" or "Saved result".
export const Tag: React.FC<{ children: React.ReactNode; at?: number; x?: number; y?: number; dark?: boolean }> = ({ children, at = 6, x = 72, y = 64, dark = false }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: ease(f, at, at + 12), padding: '10px 18px', borderRadius: 999,
      background: dark ? 'rgba(15,13,12,.72)' : 'rgba(255,255,255,.86)', color: dark ? '#fff' : C.ink, fontFamily: SANS, fontSize: 24, fontWeight: 600, letterSpacing: 0.2,
      boxShadow: '0 1px 2px rgba(0,0,0,.08)', backdropFilter: 'blur(6px)' }}>{children}</div>
  )
}

// The app on screen, in a soft frame on paper. `zoom` and `focus` push in on part of it.
export const Screen: React.FC<{ src: string; start?: number; rate?: number; still?: boolean; zoom?: [number, number]; focus?: [number, number]; len: number; top?: number }> = ({ src, start = 0, rate = 1, still = false, zoom = [1, 1], focus = [50, 50], len, top = 124 }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const z = interpolate(f, [0, len], zoom, { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) })
  const w = 1400, h = 788
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: 'absolute', left: (1920 - w) / 2, top, width: w, height: h, borderRadius: 22, overflow: 'hidden', background: '#f7f6f2',
        boxShadow: '0 40px 90px -30px rgba(60,40,30,.35), 0 0 0 1px rgba(60,40,30,.08)' }}>
        <div style={{ width: '100%', height: '100%', transform: `scale(${z})`, transformOrigin: `${focus[0]}% ${focus[1]}%` }}>
          {still
            ? <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <OffthreadVideo src={staticFile(src)} startFrom={Math.round(start * fps)} playbackRate={rate} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
      </div>
    </AbsoluteFill>
  )
}

export const STOPS = ['Idea', 'See it', 'Colors', 'Steps', 'Check-ins']

// The five stops from idea to canvas. One lights up at a time.
export const Stops: React.FC<{ active: number }> = ({ active }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', top: 52, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14, fontFamily: SANS }}>
      {STOPS.map((s, i) => {
        const on = i === active, done = i < active
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ width: 54, height: 2, alignSelf: 'center', background: done || on ? C.plum : 'rgba(31,26,23,.16)', borderRadius: 2 }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 999,
              background: on ? C.ink : 'transparent', color: on ? '#fff' : done ? C.ink : C.soft, fontSize: 26, fontWeight: on ? 600 : 500,
              boxShadow: on ? '0 6px 18px -8px rgba(0,0,0,.5)' : 'none', transform: on ? `scale(${1 + 0.04 * (1 - ease(f, 0, 16))})` : 'none' }}>
              <span style={{ width: 10, height: 10, borderRadius: 10, background: on ? '#fff' : done ? C.plum : 'rgba(31,26,23,.25)' }} />
              {s}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export const Wordmark: React.FC<{ len: number; dark?: boolean; sub?: string }> = ({ len, dark = false, sub }) => {
  const f = useCurrentFrame()
  const o = Math.min(ease(f, 0, 18), 1 - ease(f, len - 14, len))
  return (
    <AbsoluteFill style={{ background: dark ? C.black : C.paper, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 18 }}>
      <div style={{ opacity: o, transform: `translateY(${(1 - ease(f, 0, 24)) * 18}px)`, fontFamily: SERIF, fontSize: 168, fontWeight: 560, letterSpacing: -5,
        color: dark ? '#fff' : C.ink, fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>Impasto</div>
      {sub && <div style={{ opacity: o * ease(f, 10, 30), fontFamily: SANS, fontSize: 30, color: dark ? 'rgba(255,255,255,.7)' : C.soft, letterSpacing: 0.3 }}>{sub}</div>}
    </AbsoluteFill>
  )
}

// Where Yara's own clip goes. With no file yet, a card says so.
export const YaraSlot: React.FC<{ file: string | null; len: number; note: string }> = ({ file, len, note }) => {
  const f = useCurrentFrame()
  if (file) return (
    <AbsoluteFill style={{ background: C.black }}>
      <OffthreadVideo src={staticFile(file)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <NameCard />
    </AbsoluteFill>
  )
  return (
    <AbsoluteFill style={{ background: '#2a2421', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 1300, height: 730, borderRadius: 28, border: '3px dashed rgba(255,255,255,.28)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 22, opacity: ease(f, 0, 12) }}>
        <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,.55)', letterSpacing: 3, textTransform: 'uppercase' }}>Yara on camera</div>
        <div style={{ fontFamily: SERIF, fontSize: 60, color: '#fff', textAlign: 'center', maxWidth: 1000, lineHeight: 1.15 }}>{note}</div>
        <div style={{ fontFamily: SANS, fontSize: 26, color: 'rgba(255,255,255,.5)' }}>{Math.round(len / 30)} s slot. Her clip isn't recorded yet.</div>
      </div>
      <NameCard />
    </AbsoluteFill>
  )
}

const NameCard: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: 90, bottom: 90, opacity: Math.min(ease(f, 10, 26), 1 - ease(f, 150, 170)), transform: `translateX(${(1 - ease(f, 10, 30)) * -24}px)` }}>
      <div style={{ fontFamily: SERIF, fontSize: 72, color: '#fff', lineHeight: 1, textShadow: '0 2px 16px rgba(0,0,0,.4)' }}>Yara</div>
      <div style={{ fontFamily: SANS, fontSize: 28, color: 'rgba(255,255,255,.8)', marginTop: 8, letterSpacing: 1 }}>painter</div>
    </div>
  )
}
