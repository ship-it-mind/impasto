import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import footageFiles from './generated/footage.json'
import gitlog from './generated/gitlog.json'
import code from './generated/code.json'
import musicFile from './generated/music.json'
import plan from './plan.json'
import voFiles from './generated/vo-files.json'
import slots from './slots.json'
import timeline from './timeline.json'
import voLines from './vo.json'

export const FPS = 30
export const TOTAL_SECONDS = 172
const s = (seconds: number) => Math.round(seconds * FPS)

const SANS = '"Geist Variable", system-ui, sans-serif'
const MONO = '"Geist Mono Variable", ui-monospace, monospace'
const INK = '#141210'
const PAPER = '#fbfaf7'
const MUTED = '#8d877e'
const PLUM = '#964778'

const footage = footageFiles as Record<string, { file: string; kind: string; seconds: number }>
const vo = voFiles as Record<string, { file: string; real: boolean; seconds: number } | null>

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const out = (t: number) => 1 - (1 - t) ** 3

// One scene: starts and stops at these seconds, with a short fade in.
function At({ from, to, fade = 8, children }: { from: number; to: number; fade?: number; children: ReactNode }) {
  return (
    <Sequence from={s(from)} durationInFrames={s(to - from)} layout="none">
      <FadeIn frames={fade}>{children}</FadeIn>
    </Sequence>
  )
}
function FadeIn({ frames, children }: { frames: number; children: ReactNode }) {
  const f = useCurrentFrame()
  return <AbsoluteFill style={{ opacity: frames ? interpolate(f, [0, frames], [0, 1], clamp) : 1 }}>{children}</AbsoluteFill>
}

// A clip of the real app, between two moments of the recording, played to fill the scene.
function Capture({ name, start = 0, end, seconds, zoom }: { name: string; start?: number; end: number; seconds: number; zoom?: { at: number; scale: number; x: number; y: number }[] }) {
  const f = useCurrentFrame() / FPS
  const rate = (end - start) / seconds
  const keys = zoom ?? [{ at: 0, scale: 1, x: 50, y: 50 }]
  const pick = (k: 'scale' | 'x' | 'y') => keys.length === 1 ? keys[0][k] : interpolate(f, keys.map(z => z.at), keys.map(z => z[k]), { ...clamp, easing: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) })
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${pick('scale')})`, transformOrigin: `${pick('x')}% ${pick('y')}%` }}>
        <OffthreadVideo src={staticFile(`captures/${name}.mp4`)} startFrom={Math.round(start * FPS)} playbackRate={rate} muted style={{ width: '100%', height: '100%' }} />
      </AbsoluteFill>
      {rate > 1.15 && <div style={{ position: 'absolute', top: 22, right: 28, font: `500 19px ${MONO}`, color: '#fff', background: 'rgb(20 18 16 / 0.72)', padding: '5px 11px', borderRadius: 7 }}>{rate.toFixed(1)}× speed</div>}
    </AbsoluteFill>
  )
}

// Where real footage goes. With no file yet, a slate that says exactly what to shoot.
function Slot({ id, fit = 'cover' }: { id: string; fit?: 'cover' | 'contain' }) {
  const slot = slots.find(x => x.id === id)!
  const file = footage[id]
  const f = useCurrentFrame()
  if (!file) return <Slate id={id} title={slot.title} brief={slot.brief} seconds={slot.seconds} />
  if (file.kind === 'image') {
    const scale = interpolate(f, [0, s(slot.seconds)], [1, 1.04], clamp)
    return <AbsoluteFill style={{ background: '#000' }}><Img src={staticFile(file.file)} style={{ width: '100%', height: '100%', objectFit: fit, transform: `scale(${scale})` }} /></AbsoluteFill>
  }
  // Too short: slow it to fill. Marked fit (the time-lapse): speed it to fill.
  const rate = slot.fit || file.seconds < slot.seconds ? file.seconds / slot.seconds : 1
  return <AbsoluteFill style={{ background: '#000' }}><OffthreadVideo src={staticFile(file.file)} playbackRate={rate} volume={slot.volume} style={{ width: '100%', height: '100%', objectFit: fit }} /></AbsoluteFill>
}
function Slate({ id, title, brief, seconds }: { id: string; title: string; brief: string; seconds: number }) {
  return (
    <AbsoluteFill style={{ background: 'repeating-linear-gradient(135deg, #1b1917 0 26px, #232019 26px 52px)', alignItems: 'center', justifyContent: 'center', padding: 70, fontFamily: SANS, containerType: 'size' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.4cqmin', maxWidth: '86%', alignItems: 'flex-start' }}>
        <span style={{ font: `600 max(15px, 2.6cqmin) ${MONO}`, color: '#141210', background: '#f2c14e', padding: '0.5em 0.9em', borderRadius: 7 }}>REAL FOOTAGE NEEDED · {seconds}s</span>
        <span style={{ font: `600 max(24px, 6.4cqmin)/1.08 ${SANS}`, color: '#fff', letterSpacing: '-0.02em' }}>{title}</span>
        <span style={{ font: `400 max(15px, 3cqmin)/1.4 ${SANS}`, color: '#c8c2b8' }}>{brief}</span>
        <span style={{ font: `500 max(13px, 2.3cqmin) ${MONO}`, color: '#f2c14e' }}>public/footage/{id}.mp4</span>
      </div>
    </AbsoluteFill>
  )
}

// What this scene shows that was built here, and with which Meta model.
function Built({ children, note }: { children: ReactNode; note?: string }) {
  const f = useCurrentFrame()
  const x = interpolate(f, [4, 18], [-16, 0], { ...clamp, easing: out })
  return (
    <div style={{ position: 'absolute', left: 36, bottom: 116, display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start', opacity: interpolate(f, [4, 16], [0, 1], clamp), transform: `translateX(${x}px)` }}>
      <div style={{ font: `500 23px ${SANS}`, color: '#fff', background: 'rgb(20 18 16 / 0.86)', padding: '9px 15px', borderRadius: 9, display: 'flex', gap: 11, alignItems: 'center' }}>
        <span style={{ width: 9, height: 9, borderRadius: 9, background: '#f2c14e' }} />Built this hackathon · {children}
      </div>
      {note && <div style={{ font: `400 18px ${SANS}`, color: '#efe9de', background: 'rgb(20 18 16 / 0.7)', padding: '5px 12px', borderRadius: 7 }}>{note}</div>}
    </div>
  )
}

// Captions: the voice line a sentence at a time, each for its share of the line.
function Captions() {
  const f = useCurrentFrame()
  const t = f / FPS
  for (const line of voLines) {
    const take = vo[line.id]
    const at = timeline.VO_AT[line.id as keyof typeof timeline.VO_AT]
    if (!take || t < at || t > at + take.seconds + 0.15) continue
    const parts = line.text.split(/(?<=[.?!])\s+/)
    const total = parts.join('').length
    let walked = 0
    const pos = (t - at) / take.seconds
    for (const part of parts) {
      walked += part.length / total
      if (pos <= walked || part === parts[parts.length - 1]) {
        return (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 42, display: 'flex', justifyContent: 'center' }}>
            <span style={{ font: `500 30px/1.3 ${SANS}`, color: '#fff', background: 'rgb(20 18 16 / 0.78)', padding: '9px 20px', borderRadius: 10, maxWidth: 1400, textAlign: 'center', textWrap: 'balance' } as CSSProperties}>{part.trim()}</span>
          </div>
        )
      }
    }
  }
  return null
}

function Soundtrack() {
  const music = (musicFile as { file: string | null }).file
  return (
    <>
      {voLines.map(l => {
        const take = vo[l.id]
        return take ? <Sequence key={l.id} from={s(timeline.VO_AT[l.id as keyof typeof timeline.VO_AT])} layout="none"><Audio src={staticFile(take.file)} /></Sequence> : null
      })}
      {music && (
        <Audio
          src={staticFile(music)}
          volume={frame => interpolate(frame / FPS, [0, 5, 7, 118, 121, 134, 137, 143.5, 146, 157, 161, 168, 172], [0, 0, 0.14, 0.14, 0.8, 0.8, 0.05, 0.05, 0.75, 0.9, 0.16, 0.16, 0], clamp)}
        />
      )}
    </>
  )
}

function Big({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const f = useCurrentFrame()
  return <div style={{ font: `600 104px/1.05 ${SANS}`, letterSpacing: '-0.035em', color: '#fff', textShadow: '0 2px 30px rgb(0 0 0 / 0.45)', opacity: interpolate(f, [2, 12], [0, 1], clamp), transform: `translateY(${interpolate(f, [2, 16], [14, 0], { ...clamp, easing: out })}px)`, ...style }}>{children}</div>
}

function WallStill({ dim = 0, zoom = 1.04 }: { dim?: number; zoom?: number }) {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Img src={staticFile('stills/wall.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(f, [0, 180], [1, zoom], clamp)})` }} />
      {dim > 0 && <AbsoluteFill style={{ background: `rgb(0 0 0 / ${dim})` }} />}
    </AbsoluteFill>
  )
}

function ThreeGuessCard({ slot, children }: { slot?: string; children: ReactNode }) {
  return (
    <AbsoluteFill>
      {slot ? <Slot id={slot} /> : <WallStill dim={0.42} />}
      {!footage[slot ?? ''] && slot && <AbsoluteFill style={{ background: 'rgb(0 0 0 / 0.1)' }} />}
      <AbsoluteFill style={{ justifyContent: slot ? 'flex-start' : 'center', padding: 90 }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  )
}

function ClientBubble() {
  const f = useCurrentFrame()
  return (
    <div style={{ alignSelf: 'flex-start', marginTop: 34, font: `400 36px/1.3 ${SANS}`, color: INK, background: '#fff', padding: '18px 26px', borderRadius: '24px 24px 24px 6px', opacity: interpolate(f, [22, 32], [0, 1], clamp), transform: `translateY(${interpolate(f, [22, 36], [10, 0], { ...clamp, easing: out })}px)` }}>
      Can you show me how it'll look on my wall?
    </div>
  )
}

function GitLog() {
  const f = useCurrentFrame()
  const row = 46
  const shown = interpolate(f, [8, s(4.4)], [0, gitlog.length - 1], { ...clamp, easing: t => t * t * (3 - 2 * t) })
  return (
    <AbsoluteFill style={{ background: INK, fontFamily: MONO, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 780, right: 0, top: 0, bottom: 0, maskImage: 'linear-gradient(transparent, #000 25%, #000 75%, transparent)' }}>
        <div style={{ transform: `translateY(${540 - shown * row}px)` }}>
          {gitlog.map((c, i) => (
            <div key={i} style={{ height: row, display: 'flex', gap: 26, alignItems: 'center', font: `400 24px ${MONO}`, whiteSpace: 'nowrap', opacity: interpolate(Math.abs(i - shown), [0, 9], [1, 0.22], clamp), color: '#e8e2d7' }}>
              <span style={{ color: '#f2c14e' }}>{c.date.slice(5)}</span><span>{c.subject}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 90, top: 330, width: 660, fontFamily: SANS }}>
        <div style={{ font: `600 84px/1.04 ${SANS}`, color: '#fff', letterSpacing: '-0.03em' }}>From an empty repo.</div>
        <div style={{ marginTop: 26, font: `400 34px/1.3 ${SANS}`, color: '#c8c2b8' }}>First commit {gitlog[0].date.slice(5).replace('-', '/')}.<br />{gitlog.length} commits in the hackathon window.</div>
      </div>
    </AbsoluteFill>
  )
}

const KEYWORDS = /\b(def|for|in|return|if|else|from|import|range|None|True|False)\b/g
function CodeLine({ text }: { text: string }) {
  const parts: ReactNode[] = []
  const comment = text.indexOf('#')
  const body = comment >= 0 ? text.slice(0, comment) : text
  let last = 0
  for (const m of body.matchAll(KEYWORDS)) {
    parts.push(body.slice(last, m.index))
    parts.push(<span key={m.index} style={{ color: '#d68ec0' }}>{m[0]}</span>)
    last = m.index! + m[0].length
  }
  parts.push(body.slice(last))
  if (comment >= 0) parts.push(<span key="c" style={{ color: '#7d7a74' }}>{text.slice(comment)}</span>)
  return <>{parts}</>
}
function CodePane({ excerpt }: { excerpt: { file: string; firstLine: number; lines: string[] } }) {
  const indent = Math.min(...excerpt.lines.filter(l => l.trim()).map(l => l.length - l.trimStart().length))
  return (
    <div style={{ background: '#17151a', borderRadius: 14, padding: '20px 24px', overflow: 'hidden', boxShadow: '0 20px 50px -20px rgb(0 0 0 / 0.5)' }}>
      <div style={{ font: `500 19px ${MONO}`, color: '#f2c14e', marginBottom: 12 }}>{excerpt.file}:{excerpt.firstLine}</div>
      {excerpt.lines.map((l, i) => (
        <div key={i} style={{ font: `400 17.5px/1.5 ${MONO}`, color: '#e8e2d7', whiteSpace: 'pre', overflow: 'hidden' }}><CodeLine text={l.slice(indent)} /></div>
      ))}
    </div>
  )
}

// Painting → band map → area → grams → parts, with the real numbers and code from this piece.
function PlanScene() {
  const f = useCurrentFrame()
  const t = f / FPS
  const beat = t < 6 ? 0 : t < 10.5 ? 1 : 2
  const excerpt = [code.layout, code.volume, code.mixing][beat]
  const mapOpacity = interpolate(t, [1.4, 3, 6.2, 7.2], [0, 0.94, 0.94, 0.3], clamp)
  const size = { w: 560, h: 607 }
  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: SANS, color: INK, padding: '56px 56px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${size.w}px 1fr`, gap: 44 }}>
        <div style={{ position: 'relative', width: size.w, height: size.h, borderRadius: 12, overflow: 'hidden', boxShadow: '0 14px 40px -14px rgb(0 0 0 / 0.45)' }}>
          <Img src={staticFile('stills/concept.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <Img src={staticFile('stills/bandmap.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: mapOpacity, imageRendering: 'pixelated' }} />
          <div style={{ position: 'absolute', left: 14, top: 14, font: `500 19px ${SANS}`, color: '#fff', background: 'rgb(20 18 16 / 0.72)', padding: '5px 11px', borderRadius: 7 }}>{mapOpacity > 0.5 ? 'Band map, read off the painting' : "Muse Image's painting"}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 110px 120px 120px', columnGap: 16, font: `500 18px ${SANS}`, color: MUTED }}>
            <span /><span>Band</span>
            <span style={{ textAlign: 'right', opacity: t > 3 ? 1 : 0 }}>Area</span>
            <span style={{ textAlign: 'right', opacity: t > 6 ? 1 : 0 }}>Paint</span>
            <span style={{ textAlign: 'right', opacity: t > 6 ? 1 : 0 }}>Paste</span>
          </div>
          {plan.bands.map((b, i) => {
            const shown = (from: number) => interpolate(t, [from + i * 0.12, from + i * 0.12 + 0.3], [0, 1], clamp)
            return (
              <div key={b.name} style={{ borderTop: '1px solid #e6e2da', paddingTop: 7 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 110px 120px 120px', columnGap: 16, alignItems: 'center', font: `500 22px ${SANS}`, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: b.hex, boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.1)' }} />
                  <span style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{b.name}</span>
                  <span style={{ textAlign: 'right', opacity: shown(3) }}>{Math.round(b.area).toLocaleString('en-US')} cm²</span>
                  <span style={{ textAlign: 'right', opacity: shown(6) }}>{(b.paint / 1000).toFixed(2)} kg</span>
                  <span style={{ textAlign: 'right', opacity: shown(6) }}>{(b.paste / 1000).toFixed(2)} kg</span>
                </div>
                <div style={{ marginLeft: 46, marginTop: 1, font: `400 18px ${SANS}`, color: PLUM, opacity: shown(10.5), height: 25, whiteSpace: 'nowrap' }}>{b.line}</div>
              </div>
            )
          })}
          <div style={{ marginTop: 2 }}><CodePane excerpt={excerpt} /></div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 56, top: 680, width: size.w, font: `400 21px/1.35 ${SANS}`, color: MUTED, opacity: interpolate(t, [10.5, 11.2], [0, 1], clamp) }}>
        The mix prediction is <b style={{ color: INK, fontWeight: 600 }}>Mixbox</b> by Sochorová &amp; Jamriška (CC BY-NC 4.0), not built here. The search over it, and everything around it, was.
      </div>
    </AbsoluteFill>
  )
}

// The plan's picture of a stage beside the real canvas at that stage.
function StageCompare({ stage, slot, label }: { stage: number; slot: string; label: string }) {
  const f = useCurrentFrame()
  const y = interpolate(f, [0, 14], [12, 0], { ...clamp, easing: out })
  const tag: CSSProperties = { font: `500 22px ${SANS}`, color: '#fff', background: 'rgb(20 18 16 / 0.78)', padding: '6px 13px', borderRadius: 8, position: 'absolute', left: 16, top: 16 }
  return (
    <AbsoluteFill style={{ background: INK, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '56px 90px 110px' }}>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', transform: `translateY(${y}px)`, background: '#26231f' }}>
        <Img src={staticFile(`stills/stage-${stage}.png`)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <span style={tag}>The plan · {label}</span>
      </div>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', transform: `translateY(${-y}px)` }}>
        <Slot id={slot} fit="contain" />
        {footage[slot] && <span style={tag}>The canvas</span>}
      </div>
    </AbsoluteFill>
  )
}

function Reveal() {
  const f = useCurrentFrame()
  const t = f / FPS
  const mock = interpolate(t, [2.2, 4.4], [0, 1], clamp)
  const real = interpolate(t, [6.2, 8.4], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Img src={staticFile('stills/wall.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      <Img src={staticFile('stills/mockup.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: mock }} />
      <AbsoluteFill style={{ opacity: real }}><Sequence from={s(6.2)} layout="none"><Slot id="reveal-wall" fit="contain" /></Sequence></AbsoluteFill>
      <div style={{ position: 'absolute', left: 36, top: 30, font: `500 26px ${SANS}`, color: '#fff', background: 'rgb(20 18 16 / 0.7)', padding: '7px 15px', borderRadius: 9, opacity: interpolate(t, [2.4, 3, 6, 6.8], [0, 1, 1, 0], clamp) }}>The app's mockup, before any paint</div>
      <div style={{ position: 'absolute', left: 36, top: 30, font: `500 26px ${SANS}`, color: '#fff', background: 'rgb(20 18 16 / 0.7)', padding: '7px 15px', borderRadius: 9, opacity: interpolate(t, [8, 8.8], [0, 1], clamp) }}>The painting</div>
    </AbsoluteFill>
  )
}

const MODELS = [
  ['Muse Spark', 'Reads the brief, writes the compositions and the painting guide, checks each step, answers questions'],
  ['Muse Image', 'Paints the concepts, and repaints the parts you tap'],
  ['SAM 3.1', 'Finds the canvas corners in progress photos'],
  ['Muse Voice Transcribe', 'Turns dictated briefs into text'],
]
function Credits() {
  const f = useCurrentFrame()
  const show = (from: number) => ({ opacity: interpolate(f, [from, from + 12], [0, 1], clamp), transform: `translateY(${interpolate(f, [from, from + 16], [10, 0], { ...clamp, easing: out })}px)` })
  return (
    <AbsoluteFill style={{ background: INK, color: '#fff', fontFamily: SANS, padding: '74px 96px', display: 'grid', gridTemplateColumns: '1.25fr 1fr', columnGap: 80, alignContent: 'start' }}>
      <div style={{ gridColumn: '1 / -1', font: `600 76px/1.05 ${SANS}`, letterSpacing: '-0.03em', marginBottom: 46, ...show(0) }}>Impasto Studio Co-pilot</div>
      <div style={show(10)}>
        <div style={{ font: `500 24px ${SANS}`, color: '#f2c14e', marginBottom: 18 }}>Meta models, and their job</div>
        {MODELS.map(([name, job]) => (
          <div key={name} style={{ padding: '12px 0', borderTop: '1px solid #36322c' }}>
            <div style={{ font: `600 28px ${SANS}` }}>{name}</div>
            <div style={{ font: `400 23px/1.3 ${SANS}`, color: '#c8c2b8' }}>{job}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        <div style={show(30)}>
          <div style={{ font: `500 24px ${SANS}`, color: '#f2c14e', marginBottom: 12 }}>Built during the hackathon</div>
          <div style={{ font: `400 25px/1.35 ${SANS}`, color: '#e8e2d7' }}>All the code: every screen, the band reading, the paint and color checks. {gitlog.length} commits from {gitlog[0].date.slice(5).replace('-', '/')}, built solo.</div>
        </div>
        <div style={show(50)}>
          <div style={{ font: `500 24px ${SANS}`, color: '#f2c14e', marginBottom: 12 }}>Not built here</div>
          <div style={{ font: `400 25px/1.35 ${SANS}`, color: '#e8e2d7' }}>Mixbox paint mixing (Secret Weapons, CC BY-NC 4.0). The SAM stream adapter, adapted from Meta's cookbook. Meta's models. The painting, by my wife.</div>
        </div>
        <div style={show(90)}>
          <div style={{ font: `600 38px ${SANS}` }}>impasto.projectrunning.com</div>
          <div style={{ font: `400 25px ${MONO}`, color: '#c8c2b8', marginTop: 8 }}>github.com/ship-it-mind/impasto</div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

export function Demo() {
  useVideoConfig()
  const SAVED = 'Saved result from a real run on Oct 31'
  return (
    <AbsoluteFill style={{ background: '#000', fontFamily: SANS }}>
      {/* The cold open */}
      <At from={0} to={6} fade={0}><Slot id="knife" /></At>
      <At from={6} to={11} fade={10}><WallStill /></At>

      {/* Three guesses */}
      <At from={11} to={14}><ThreeGuessCard><Big>Will the client like it?</Big><ClientBubble /></ThreeGuessCard></At>
      <At from={14} to={16.8}><ThreeGuessCard slot="tubes"><Big style={{ opacity: 1 }}>Which colors do I mix?</Big></ThreeGuessCard></At>
      <At from={16.8} to={19.6}><ThreeGuessCard slot="pot"><Big style={{ opacity: 1 }}>How much paint will it take?</Big></ThreeGuessCard></At>
      <At from={19.6} to={25}><GitLog /></At>

      {/* Brief to concepts */}
      <At from={25} to={31.5}>
        <Capture name="brief-typed" end={12.7} seconds={6.5} zoom={[{ at: 0, scale: 1.45, x: 50, y: 42 }, { at: 6.5, scale: 1.45, x: 50, y: 42 }]} />
        <Built>the brief, on a real wall photo</Built>
      </At>
      <At from={31.5} to={36}>
        <Capture name="brief-read" start={0.8} end={8.8} seconds={4.5} />
        <Built note={SAVED}>Muse Spark reads the request</Built>
      </At>
      <At from={36} to={43.5}>
        <Capture name="concepts-wall" start={0.6} end={9.6} seconds={7.5} />
        <Built note={SAVED}>Muse Image, hung in perspective on the wall</Built>
      </At>

      {/* Tap and repaint */}
      <At from={43.5} to={49.5}>
        <Capture name="edit-tap" end={11.6} seconds={6} />
        <Built>segments from the band map</Built>
      </At>
      <At from={49.5} to={57.5}>
        <Capture name="edit-result" start={0.6} end={8.6} seconds={8} zoom={[{ at: 0, scale: 1, x: 50, y: 50 }, { at: 1.4, scale: 1.2, x: 30, y: 42 }, { at: 5.6, scale: 1.2, x: 30, y: 42 }, { at: 7, scale: 1, x: 50, y: 50 }]} />
        <Built note={SAVED + ', from this request'}>Muse Image repaints only the tapped shape</Built>
      </At>

      {/* Picture to plan: the code */}
      <At from={57.5} to={75}><PlanScene /></At>
      <At from={75} to={81}>
        <Capture name="recipe" start={2.6} end={8.6} seconds={6} />
        <Built>the supplies list, updating as you tick</Built>
      </At>

      {/* The painting */}
      <At from={81} to={87.5}>
        <Capture name="paint" start={0.9} end={16.2} seconds={6.5} />
        <Built note={SAVED}>Muse Spark's guide, the app's stage pictures</Built>
      </At>
      <At from={87.5} to={91.3}><StageCompare stage={1} slot="stage-marks" label="mark the bands" /></At>
      <At from={91.3} to={95.1}><StageCompare stage={2} slot="stage-paste" label="lay the paste" /></At>
      <At from={95.1} to={99}><StageCompare stage={5} slot="stage-color" label="color going on" /></At>

      {/* The bowl */}
      <At from={99} to={102.5}><Slot id="mixing" /></At>
      <At from={102.5} to={112}>
        <Capture name="mix" start={1.2} end={10.7} seconds={9.5} zoom={[{ at: 0, scale: 1, x: 50, y: 50 }, { at: 3.6, scale: 1.42, x: 22, y: 92 }]} />
        <Built note="Live reading of a real photo of the paint, no model call">the color check</Built>
      </At>

      {/* The whole canvas */}
      <At from={112} to={120}>
        <Slot id="whole-canvas" />
        <Built>SAM 3.1 finds the canvas, the app measures every band</Built>
      </At>

      {/* Breathing room, then her, then the wall */}
      <At from={120} to={136} fade={14}><Slot id="timelapse" /></At>
      <At from={136} to={144}><Slot id="wife-line" /></At>
      <At from={144} to={157} fade={14}><Reveal /></At>
      <At from={157} to={160}><Slot id="reveal-detail" /></At>
      <At from={160} to={172} fade={14}><Credits /></At>

      <Captions />
      <Soundtrack />
    </AbsoluteFill>
  )
}
