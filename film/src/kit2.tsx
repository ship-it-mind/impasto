import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useVideoConfig } from 'remotion'
import { CORAL, INK, MONO, PAPER, SANS, SERIF, cubicOut, expoIn, expoInOut, expoOut, lerp, range, smooth } from './core'

export const still = (n: string) => staticFile(`stills/${n}`)
export const sans = (wght = 900, wdth = 100): CSSProperties => ({ fontFamily: SANS, fontWeight: wght, fontStretch: `${wdth}%`, fontVariationSettings: `"wght" ${wght}, "wdth" ${wdth}` })
export const serif = (wght = 500, soft = 60): CSSProperties => ({ fontFamily: SERIF, fontWeight: wght, fontVariationSettings: `"opsz" 144, "SOFT" ${soft}, "WONK" 1` })

// Words rise out of their own baseline, one after another, and leave the same way.
export function Rise({ b, at, out = 1e9, text, size, style, gap = 0.08, tone = PAPER, left, top, center, lineHeight = 1.06 }: {
  b: number; at: number; out?: number; text: string; size: number; style?: CSSProperties; gap?: number; tone?: string; left?: number; top?: number; center?: boolean; lineHeight?: number
}) {
  if (b < at || b > out + 1.4) return null
  const words = text.split(' ')
  return (
    <div style={{ position: left === undefined && !center ? 'relative' : 'absolute', left: center ? 0 : left, right: center ? 0 : undefined, top, display: 'flex', flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start', columnGap: size * 0.26, fontSize: size, lineHeight, color: tone, letterSpacing: '-0.025em', ...sans(800, 100), ...style }}>
      {words.map((w, i) => {
        const p = expoOut(range(b, at + i * gap, at + i * gap + 0.75))
        const e = expoIn(range(b, out + i * gap * 0.4, out + i * gap * 0.4 + 0.5))
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: size * 0.14, marginBottom: -size * 0.14, paddingRight: size * 0.03 }}>
            <span style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 118 - e * 118}%) rotate(${(1 - p) * 4}deg)`, transformOrigin: '0 100%' }}>{w}</span>
          </span>
        )
      })}
    </div>
  )
}

export function Fade({ b, at, out = 1e9, children, style, dy = 14 }: { b: number; at: number; out?: number; children: ReactNode; style?: CSSProperties; dy?: number }) {
  const p = cubicOut(range(b, at, at + 0.6)) * (1 - smooth(range(b, out, out + 0.4)))
  return <div style={{ opacity: p, transform: `translateY(${(1 - cubicOut(range(b, at, at + 0.6))) * dy}px)`, ...style }}>{children}</div>
}

// A chapter card: a dab of coral grows until it's the whole frame, then shutters away.
export function Chapter({ b, at, n, title, line }: { b: number; at: number; n: string; title: string; line: string }) {
  if (b < at || b >= at + 4) return null
  const grow = expoInOut(range(b, at, at + 0.75))
  const leave = expoInOut(range(b, at + 3.3, at + 4))
  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: CORAL, clipPath: `circle(${grow * 1200}px at 50% 50%)`, transform: `translateY(${-leave * 100}%)` }}>
        <div style={{ position: 'absolute', left: 90, top: 300, font: `600 34px ${MONO}`, color: INK, opacity: expoOut(range(b, at + 0.4, at + 0.9)) }}>CHAPTER {n}</div>
        <Rise b={b} at={at + 0.42} text={title} size={196} tone={INK} left={84} top={355} style={{ ...sans(900, 108), flexWrap: 'nowrap', whiteSpace: 'nowrap' }} />
        <Rise b={b} at={at + 1.15} text={line} size={60} tone={INK} left={90} top={590} style={{ ...sans(600, 100), flexWrap: 'nowrap', whiteSpace: 'nowrap' }} gap={0.05} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// Which part of the work this is, and whose. Sits bottom left in app-adjacent scenes.
export function Chip({ b, at, out, model, note }: { b: number; at: number; out: number; model: string; note?: string }) {
  if (b < at || b >= out + 0.4) return null
  const p = expoOut(range(b, at, at + 0.5)) * (1 - expoIn(range(b, out, out + 0.35)))
  return (
    <div style={{ position: 'absolute', left: 40, bottom: 78, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, opacity: p, transform: `translateX(${(1 - p) * -24}px)` }}>
      <div style={{ font: `600 25px ${SANS}`, color: INK, background: PAPER, padding: '9px 15px', borderRadius: 9, display: 'flex', gap: 11, alignItems: 'center' }}>
        <span style={{ width: 11, height: 11, borderRadius: 11, background: CORAL }} />{model}
      </div>
      {note && <div style={{ font: `500 19px ${MONO}`, color: PAPER, background: 'rgb(14 12 11 / 0.82)', padding: '6px 12px', borderRadius: 7 }}>{note}</div>}
    </div>
  )
}

// A real recording of the app, in a floating window with a caption beside it.
export function AppClip({ b, at, to, name, start = 0, end, caption, sub, flip }: { b: number; at: number; to: number; name: string; start?: number; end: number; caption: string; sub?: string; flip?: boolean }) {
  const { fps } = useVideoConfig()
  if (b < at || b >= to) return null
  const dur = (to - at) / 2
  const rate = (end - start) / dur
  const p = expoOut(range(b, at, at + 1.1))
  const q = expoIn(range(b, to - 0.5, to))
  const ry = (flip ? 1 : -1) * lerp(lerp(26, 11, p), 8, range(b, at, to))
  return (
    <AbsoluteFill style={{ background: INK, perspective: 2100, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: flip ? 40 : 480, top: 108, width: 1400, height: 788, borderRadius: 16, overflow: 'hidden', transform: `translateY(${(1 - p) * 700 + q * -900}px) rotateY(${ry}deg) rotateX(${lerp(14, 3, p)}deg)`, boxShadow: '0 60px 120px -30px rgb(0 0 0 / 0.8), 0 0 0 1px rgb(244 239 230 / 0.1)', transformStyle: 'preserve-3d' }}>
        <Sequence from={Math.round((at / 2) * fps)} layout="none">
          <OffthreadVideo src={staticFile(`captures/${name}.mp4`)} startFrom={Math.round(start * fps)} playbackRate={rate} muted style={{ width: '100%', height: '100%', display: 'block' }} />
        </Sequence>
      </div>
      <div style={{ position: 'absolute', left: flip ? 1480 : 64, top: 280, width: 400 }}>
        <div style={{ font: `600 22px ${MONO}`, color: CORAL, marginBottom: 18, opacity: p }}>THE REAL APP{rate > 1.1 ? ` · ${rate.toFixed(1)}×` : ''}</div>
        <Rise b={b} at={at + 0.2} out={to - 0.7} text={caption} size={58} style={{ position: 'relative', ...sans(800, 100) }} gap={0.05} />
        {sub && <Fade b={b} at={at + 1} out={to - 0.7} style={{ marginTop: 20, font: `400 27px/1.35 ${SANS}`, color: '#c8c2b8' }}>{sub}</Fade>}
      </div>
    </AbsoluteFill>
  )
}

const KW = /\b(def|for|in|return|if|else|from|import|range|None|True|False)\b/g
function CodeLine({ text }: { text: string }) {
  const out: ReactNode[] = []
  const c = text.indexOf('#')
  const body = c >= 0 ? text.slice(0, c) : text
  let last = 0
  for (const m of body.matchAll(KW)) {
    out.push(body.slice(last, m.index))
    out.push(<span key={m.index} style={{ color: '#e09fcb' }}>{m[0]}</span>)
    last = m.index! + m[0].length
  }
  out.push(body.slice(last))
  if (c >= 0) out.push(<span key="c" style={{ color: '#7d7a74' }}>{text.slice(c)}</span>)
  return <>{out}</>
}
export function CodePane({ b, at, out, excerpt, style, size = 19 }: { b: number; at: number; out: number; excerpt: { file: string; firstLine: number; lines: string[] }; style?: CSSProperties; size?: number }) {
  if (b < at || b > out + 0.5) return null
  const p = expoOut(range(b, at, at + 0.6)) * (1 - expoIn(range(b, out, out + 0.45)))
  const indent = Math.min(...excerpt.lines.filter(l => l.trim()).map(l => l.length - l.trimStart().length))
  return (
    <div style={{ position: 'absolute', background: '#17151a', borderRadius: 14, padding: '18px 22px', boxShadow: '0 30px 60px -20px rgb(0 0 0 / 0.75), 0 0 0 1px rgb(244 239 230 / 0.09)', opacity: p, transform: `translateY(${(1 - p) * 30}px)`, overflow: 'hidden', ...style }}>
      <div style={{ font: `600 ${size}px ${MONO}`, color: '#f2c14e', marginBottom: 10 }}>{excerpt.file}:{excerpt.firstLine}</div>
      {excerpt.lines.map((l, i) => {
        const seen = range(b, at + 0.1 + i * 0.05, at + 0.2 + i * 0.05)
        return <div key={i} style={{ font: `400 ${size}px/1.45 ${MONO}`, color: '#e8e2d7', whiteSpace: 'pre', opacity: seen }}><CodeLine text={l.slice(indent)} /></div>
      })}
    </div>
  )
}

// Count up to a number in step with the music.
export const count = (b: number, at: number, dur: number, to: number) => to * expoOut(range(b, at, at + dur))
export const chapterless = null
