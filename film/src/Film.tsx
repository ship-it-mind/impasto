import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion'
import { CORAL, H, INK, MONO, PAPER, SANS, SERIF, W, backOut, cubicOut, expoIn, expoInOut, expoOut, frac, hash, hash2, kick, lerp, range, smooth, stab } from './core'
import data from './data.json'
import { drawShader } from './gl'
import { AppClip, chapterless, Chip, Chapter, CodePane, count, Fade, Rise, sans, serif, still } from './kit2'
import repo from './repo.json'
import { MIX, PAINT, STACKS } from './shaders'

export const TOTAL_BEATS = 360
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
const fix2 = (n: number) => n.toFixed(2)
const kg = (g: number) => `${(g / 1000).toFixed(2)} kg`
const cap = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

// ---------------------------------------------------------------- The GPU layer behind each scene
function back(c: CanvasRenderingContext2D, b: number) {
  c.fillStyle = INK; c.fillRect(0, 0, W, H)
  if (b < 28) {
    return drawShader(c, 'paint', PAINT, { u_b: b + 40, u_light: smooth(range(b, 0, 7)), u_dim: 0.58 * smooth(range(b, 6.2, 8)) - 0.58 * smooth(range(b, 21, 23)) * 0.65 + 0.3 * smooth(range(b, 23.4, 24.4)) })
  }
  if (b >= 208 && b < 222) {
    const g = (i: number) => backOut(range(b, 208.6 + i * 0.5, 210.2 + i * 0.5), 1.1)
    const orbit = lerp(-0.34, 0.3, smooth(range(b, 208, 222)))
    const s = 0.47 // metres of height per kilogram
    const bands = data.bands
    return drawShader(c, 'stacks', STACKS, {
      u_b: b,
      u_ro: [Math.sin(orbit) * 22, 6.0, Math.cos(orbit) * 22],
      u_ta: [-2.7, 1.9, 0],
      u_paste0: bands.slice(0, 4).map(x => (x.paste / 1000) * s),
      u_paste4: (bands[4].paste / 1000) * s,
      u_paint0: bands.slice(0, 4).map(x => (x.paint / 1000) * s),
      u_paint4: (bands[4].paint / 1000) * s,
      u_grow0: [g(0), g(1), g(2), g(3)],
      u_grow4: g(4),
    })
  }
  if (b >= 222 && b < 246) {
    const i = Math.floor((b - 222) / 8)
    const band = data.bands[[0, 1, 4][i]]
    const t = band.tubes.map(x => ({ c: rgb((data.tubes as Record<string, string>)[x.name]), parts: x.parts }))
    const sum = t.reduce((a, x) => a + x.parts, 0)
    const pad = [...t, t[t.length - 1]].slice(0, 3)
    return drawShader(c, 'mix', MIX, {
      u_b: b, u_u: smooth(range(b - 222 - i * 8, 0.9, 7.4)),
      u_c0: pad[0].c, u_c1: pad[1].c, u_c2: pad[2].c, u_target: rgb(band.hex),
      u_s0: pad[0].parts / sum, u_s1: pad[1].parts / sum,
      u_center: [510, 540], u_r: 0.415,
    })
  }
  if (b >= 346) {
    return drawShader(c, 'paint', PAINT, { u_b: b - 200, u_light: smooth(range(b, 346, 349)), u_dim: 0.55 + 0.2 * range(b, 351, 352) })
  }
}

// ---------------------------------------------------------------- COLD OPEN
function Open({ b }: { b: number }) {
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 120, top: 250 }}>
        <Rise b={b} at={7} out={21} text="im·pas·to" size={240} style={{ ...serif(500), letterSpacing: '-0.02em', position: 'relative' }} />
        <Fade b={b} at={10.5} out={21} style={{ font: `500 34px ${MONO}`, color: PAPER, marginTop: 22 }}>/ɪmˈpæstəʊ/ · noun</Fade>
        <Rise b={b} at={12.5} out={21} text="Paint laid on so thick it stands up off the canvas." size={64} style={{ position: 'relative', marginTop: 34, width: 1180, ...sans(600) }} gap={0.05} />
      </div>
      {b >= 24 && <Wordmark b={b} at={24} size={250} y={500} tail="Studio Co-pilot" />}
    </AbsoluteFill>
  )
}
// The name, ended by its dot.
function Wordmark({ b, at, size, y, tail }: { b: number; at: number; size: number; y: number; tail?: string }) {
  const letters = 'Impasto'.split('')
  const land = at + 0.4
  const fall = range(b, at - 0.1, land), up = range(b, land, land + 0.6)
  const dropY = (1 - fall * fall) * -520 - (b > land ? 4 * 70 * up * (1 - up) : 0)
  const n = b - land
  const sy = n > 0 && n < 0.12 ? 0.7 : 1
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: y, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', overflow: 'visible' }}>
        <div style={{ display: 'flex', overflow: 'hidden', fontSize: size, lineHeight: 1.15, color: PAPER, letterSpacing: '-0.025em', ...serif(500) }}>
          {letters.map((ch, i) => <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - backOut(range(b, land + i * 0.04, land + i * 0.04 + 0.8), 1.4)) * 110}%)` }}>{ch}</span>)}
        </div>
        <div style={{ width: size * 0.17, height: size * 0.17, borderRadius: '50%', background: CORAL, marginLeft: size * 0.02, marginBottom: size * 0.21, transform: `translateY(${dropY}px) scale(${1 / sy},${sy})`, transformOrigin: '50% 100%' }} />
      </div>
      {tail && <Rise b={b} at={land + 0.5} text={tail} size={52} style={{ position: 'relative', ...sans(500, 112), marginTop: 6 }} />}
    </div>
  )
}

// ---------------------------------------------------------------- THE STORY
function Story({ b }: { b: number }) {
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {b < 36 && (
        <div style={{ position: 'absolute', left: 110, top: 250 }}>
          <Rise b={b} at={28.4} out={35} text="My wife paints with a palette knife." size={150} style={{ position: 'relative', width: 1500 }} gap={0.1} />
          <Rise b={b} at={32} out={35} text="For the love of it." size={110} tone={CORAL} style={{ position: 'relative', marginTop: 22, ...serif(400), fontStyle: 'italic' }} />
        </div>
      )}
      {b >= 36 && b < 44 && (
        <AbsoluteFill>
          <Img src={still('wall.jpg')} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${lerp(1.16, 1.02, cubicOut(range(b, 36, 44)))})`, opacity: expoOut(range(b, 36, 37)) }} />
          <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgb(14 12 11 / 0.82), transparent 66%)' }} />
          <Rise b={b} at={36.6} out={43} text="Every painting starts with an empty wall." size={124} left={100} top={340} style={{ width: 1050 }} />
        </AbsoluteFill>
      )}
      {b >= 44 && b < 48 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Rise b={b} at={44.1} out={47.2} text="And three guesses." size={170} center top={380} />
          <div style={{ position: 'absolute', top: 640, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 46 }}>
            {[45, 46, 47].map(t => <span key={t} style={{ width: 62, height: 62, borderRadius: 62, background: CORAL, transform: `scale(${backOut(range(b, t, t + 0.35), 3)})` }} />)}
          </div>
        </AbsoluteFill>
      )}
      {b >= 48 && b < 52 && <GuessWall b={b} />}
      {b >= 52 && b < 56 && <GuessTubes b={b} />}
      {b >= 56 && b < 60 && <GuessKg b={b} />}
      {b >= 60 && b < 64 && (
        <div style={{ position: 'absolute', left: 110, top: 300 }}>
          <Rise b={b} at={60.1} out={63.2} text="Guess wrong, and you find out" size={112} style={{ position: 'relative', width: 1700 }} gap={0.06} />
          <Rise b={b} at={61} out={63.2} text="with paint already on the canvas." size={112} tone={CORAL} style={{ position: 'relative', width: 1700 }} gap={0.06} />
        </div>
      )}
    </AbsoluteFill>
  )
}
const Tag = ({ text, b, at }: { text: string; b: number; at: number }) => <Rise b={b} at={at} text={text} size={128} center top={70} style={sans(900, 104)} gap={0.05} />
function GuessWall({ b }: { b: number }) {
  const i = Math.floor((b - 48) * 2)
  const rect = (k: number) => ({ w: 240 + hash(k + 1) * 700, h: 200 + hash(k + 2) * 480, x: 300 + hash(k + 3) * 400 })
  const r = rect(i)
  return (
    <AbsoluteFill>
      <Img src={still('wall.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.5)' }} />
      <div style={{ position: 'absolute', left: r.x, top: 340, width: r.w, height: r.h, boxShadow: `0 0 0 4px ${PAPER}`, background: 'rgb(224 112 79 / 0.3)' }} />
      <Tag text="Will it work on that wall?" b={b} at={48.05} />
    </AbsoluteFill>
  )
}
function GuessTubes({ b }: { b: number }) {
  const names = Object.keys(data.tubes), T = data.tubes as Record<string, string>
  return (
    <AbsoluteFill style={{ display: 'flex', flexDirection: 'row' }}>
      {names.map((n, i) => {
        const y = (i % 2 ? 1 : -1) * (b - 52) * 90 + (i % 2 ? -160 : 0)
        const light = n === 'Titanium White' || n === 'Yellow Ochre' || n === 'Sap Green'
        return (
          <div key={n} style={{ flex: 1, background: T[n], position: 'relative', overflow: 'hidden', transform: `translateY(${(1 - expoOut(range(b, 52 + i * 0.05, 52.7 + i * 0.05))) * (i % 2 ? 1100 : -1100)}px)` }}>
            <div style={{ position: 'absolute', left: 92, top: 300 + y, transform: 'rotate(90deg)', transformOrigin: '0 0', whiteSpace: 'nowrap', font: `500 33px ${MONO}`, color: light ? INK : PAPER }}>{n}</div>
          </div>
        )
      })}
      <AbsoluteFill style={{ background: 'linear-gradient(rgb(14 12 11 / 0.72), transparent 42%)' }} />
      <Tag text="Which colors do I mix?" b={b} at={52.05} />
    </AbsoluteFill>
  )
}
function GuessKg({ b }: { b: number }) {
  const step = Math.floor((b - 56) * 12)
  const digits = [0, 1, 2, 3].map(i => Math.floor(hash(step * 13 + i) * 10))
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Rise b={b} at={56.05} text="How much paint will it take?" size={120} center top={80} tone={INK} style={sans(900, 104)} gap={0.05} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 350, textAlign: 'center', fontSize: 400, lineHeight: 1.1, color: CORAL, fontVariantNumeric: 'tabular-nums', ...sans(900, 100) }}>{digits[0]}{digits[1]}.{digits[2]}{digits[3]}<span style={{ fontSize: 150, color: INK }}> kg?</span></div>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- BUILT
function Built({ b }: { b: number }) {
  const row = 46, log = repo.log
  const shown = lerp(0, log.length - 1, smooth(range(b, 65, 73.5)))
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 870, right: 0, top: 0, bottom: 0, maskImage: 'linear-gradient(transparent, #000 22%, #000 78%, transparent)' }}>
        <div style={{ transform: `translateY(${540 - shown * row}px)` }}>
          {log.map((c, i) => (
            <div key={i} style={{ height: row, display: 'flex', gap: 24, alignItems: 'center', whiteSpace: 'nowrap', font: `400 23px ${MONO}`, color: '#e8e2d7', opacity: Math.abs(i - shown) > 14 ? 0.05 : lerp(1, 0.2, Math.abs(i - shown) / 14) }}>
              <span style={{ color: CORAL }}>{c.date.slice(5)}</span><span>{c.subject}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 90, top: 280, width: 760 }}>
        <Rise b={b} at={64.2} out={73.4} text="So I built her a studio co-pilot." size={110} style={{ position: 'relative' }} />
        <Fade b={b} at={67} out={73.4} style={{ marginTop: 32, font: `500 36px/1.35 ${SANS}`, color: '#c8c2b8' }}>From an empty repo, during this hackathon.<br />{log.length} commits. The first on {log[0].date.slice(5).replace('-', '/')}.</Fade>
      </div>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- THE WHOLE IDEA, on the drop
const PIPE: [string, string][] = [['Brief', 'Muse Voice Transcribe · Muse Spark'], ['Concepts', 'Muse Image · Muse Spark'], ['Recipe', 'Measured + Muse Spark'], ['Guide', 'Muse Spark'], ['Check-ins', 'SAM 3.1 · Muse Spark']]
function Pipeline({ b }: { b: number }) {
  const slam = expoOut(range(b, 76, 76.3)), out = expoIn(range(b, 77.3, 77.9))
  const x = (i: number) => 160 + i * 400, y = 500
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {b < 78 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 310, color: CORAL, ...sans(900, 120), transform: `translateY(${(1 - slam) * 900 - out * 1200}px)` }}>IMPASTO</div>}
      <Rise b={b} at={78.2} out={83.4} text="A request goes in. A plan you can paint comes out." size={66} center top={190} style={sans(800)} gap={0.05} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <line x1={x(0)} y1={y} x2={lerp(x(0), x(4), expoInOut(range(b, 78.3, 82.5)))} y2={y} stroke={PAPER} strokeWidth={4} opacity={1 - range(b, 83.4, 83.9)} />
      </svg>
      {PIPE.map(([name, model], i) => {
        const t = 78.5 + i
        const p = backOut(range(b, t, t + 0.45), 2.6)
        const o = 1 - range(b, 83.4, 83.9)
        return (
          <div key={name} style={{ position: 'absolute', left: x(i) - 180, width: 360, top: y - 34, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: o }}>
            <span style={{ width: 68, height: 68, borderRadius: 68, background: CORAL, transform: `scale(${p})` }} />
            <div style={{ marginTop: 22, fontSize: 52, color: PAPER, ...sans(800), opacity: range(b, t, t + 0.3) }}>{name}</div>
            <div style={{ marginTop: 10, font: `500 21px/1.3 ${MONO}`, color: '#b9b2a6', textAlign: 'center', opacity: range(b, t + 0.2, t + 0.6) }}>{model}</div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- 01 THE BRIEF
const WALL = { scale: 1080 / data.wallSize[1], w: (data.wallSize[0] * 1080) / data.wallSize[1] }
function BriefScene({ b }: { b: number }) {
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {b < 100 && <Sentence b={b} />}
      {b >= 100 && b < 112 && <WallFit b={b} />}
      <AppClip b={b} at={112} to={122} name="brief-read" start={0.8} end={8.8} caption="Spark's read, in the app." sub="The size is yours to change, by typing or by dragging a corner." />
    </AbsoluteFill>
  )
}
function Sentence({ b }: { b: number }) {
  const text = data.request
  const n = Math.floor(lerp(0, text.length, range(b, 88.2, 92)))
  const typed = text.slice(0, n)
  const spans: [string, number][] = [['this wall', 93], ['refrences i shared', 93.8], ['plum color', 94.6]]
  const parts: ReactNode[] = []
  let idx = 0
  for (const [word, at] of spans) {
    const i = typed.indexOf(word, idx)
    if (i < 0) break
    parts.push(typed.slice(idx, i))
    const on = expoOut(range(b, at, at + 0.4))
    parts.push(<span key={word} style={{ color: on > 0.5 ? INK : PAPER, background: `linear-gradient(${CORAL},${CORAL}) 0 100% / ${on * 100}% 100% no-repeat`, padding: '0 8px', margin: '0 -8px', borderRadius: 8 }}>{word}</span>)
    idx = i + word.length
  }
  parts.push(typed.slice(idx))
  const card: CSSProperties = { background: '#1b1816', borderRadius: 16, padding: 26, boxShadow: '0 0 0 1px rgb(244 239 230 / 0.1)', height: 420, boxSizing: 'border-box', overflow: 'hidden' }
  const lab: CSSProperties = { font: `600 21px ${MONO}`, color: CORAL, marginBottom: 14 }
  const cardIn = (t: number): CSSProperties => ({ ...card, transform: `translateY(${(1 - expoOut(range(b, t, t + 0.7))) * 480}px)`, opacity: range(b, t, t + 0.2) })
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 90, top: 96, width: 1740, fontSize: 82, lineHeight: 1.3, color: PAPER, ...sans(500), letterSpacing: '-0.015em' }}>
        {parts}<span style={{ display: 'inline-block', width: 5, height: 62, background: CORAL, marginLeft: 6, verticalAlign: '-8px', opacity: b < 93 && frac(b) < 0.55 ? 1 : 0 }} />
      </div>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 450, display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: 26 }}>
        <div style={cardIn(95.2)}><div style={lab}>THE WALL</div><Img src={still('wall.jpg')} style={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 10 }} /></div>
        <div style={cardIn(95.6)}><div style={lab}>THE COLOR</div><div style={{ display: 'flex', alignItems: 'center', gap: 22 }}><span style={{ width: 200, height: 200, borderRadius: 200, background: data.palette[0].approx_hex }} /><span style={{ fontSize: 58, color: PAPER, ...sans(700) }}>{cap(data.palette[0].name)}<br /><span style={{ font: `500 28px ${MONO}`, color: '#b9b2a6' }}>{data.palette[0].approx_hex}</span></span></div></div>
        <div style={cardIn(96)}><div style={lab}>THE BRIEF</div><div style={{ fontSize: 56, lineHeight: 1.18, color: PAPER, ...sans(600) }}>{data.summary}</div></div>
      </div>
      <Chip b={b} at={93} out={99.5} model="Muse Spark reads it" note="The real request, from a real run on Oct 31" />
    </AbsoluteFill>
  )
}
function WallFit({ b }: { b: number }) {
  const fit = data.wallFit!, S = WALL.scale, IW = WALL.w
  const cm = IW / fit.visible_width_cm
  const r0 = { w: fit.width_cm * cm, h: fit.height_cm * cm, x: fit.center_x * IW - (fit.width_cm * cm) / 2, y: fit.center_y * 1080 - (fit.height_cm * cm) / 2 }
  const c = data.mockup.corners
  const r1 = { x: c[0][0] * S, y: c[0][1] * S, w: (c[1][0] - c[0][0]) * S, h: (c[2][1] - c[0][1]) * S }
  const grow = expoOut(range(b, 101, 101.8)), m = expoInOut(range(b, 106, 107.4))
  const w = lerp(r0.w, r1.w, m) * grow, h = lerp(r0.h, r1.h, m) * grow
  const x = lerp(r0.x, r1.x, m) + (lerp(r0.w, r1.w, m) - w) / 2, y = lerp(r0.y, r1.y, m) + (lerp(r0.h, r1.h, m) - h) / 2
  const corner = (cx: number, cy: number, k: number) => <span key={k} style={{ position: 'absolute', left: cx - 15, top: cy - 15, width: 30, height: 30, borderRadius: 30, background: CORAL, boxShadow: `0 0 0 4px ${PAPER}`, transform: `scale(${backOut(range(b, 101.6 + k * 0.1, 102 + k * 0.1), 3)})` }} />
  const cmW = Math.round(lerp(fit.width_cm, data.size.width_cm, m)), cmH = Math.round(lerp(fit.height_cm, data.size.height_cm, m))
  return (
    <AbsoluteFill>
      <Img src={still('wall.jpg')} style={{ position: 'absolute', left: 0, top: 0, width: IW, height: 1080 }} />
      <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, background: 'rgb(224 112 79 / 0.35)', boxShadow: `0 0 0 3px ${PAPER}` }} />
      {[[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([cx, cy], k) => corner(cx, cy, k))}
      <div style={{ position: 'absolute', left: IW + 34, top: 150, width: W - IW - 70 }}>
        <div style={{ font: `600 22px ${MONO}`, color: CORAL, marginBottom: 14 }}>{m < 0.5 ? 'SPARK RECOMMENDS' : 'THE PAINTER DECIDES'}</div>
        <div style={{ fontSize: 88, lineHeight: 1, color: PAPER, fontVariantNumeric: 'tabular-nums', ...sans(900, 90) }}>{cmW} ×<br />{cmH} cm</div>
        <div style={{ position: 'relative', marginTop: 26 }}>
          <Fade b={b} at={102} out={105.6} style={{ position: 'absolute', fontSize: 33, lineHeight: 1.3, color: '#d8d2c6', ...sans(500) }}>{fit.reason}</Fade>
          <Fade b={b} at={107.4} out={111.5} style={{ position: 'absolute', fontSize: 33, lineHeight: 1.3, color: '#d8d2c6', ...sans(500) }}>Drag a corner, or type it. It stays a rectangle.</Fade>
        </div>
      </div>
      <Chip b={b} at={101} out={105.8} model="Muse Spark looks at the wall" />
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- 02 THE CONCEPTS
const CONCEPTS = [{ f: 'c1.jpg', ...data.concepts[0] }, { f: 'c2.jpg', ...data.concepts[1] }, { f: 'c3.jpg', ...data.concepts[2] }]
function ConceptScene({ b }: { b: number }) {
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {b < 134 && <Three b={b} />}
      {b >= 134 && b < 146 && <Full b={b} />}
      {b >= 146 && b < 156 && <OnWall b={b} />}
      {b >= 156 && b < 176 && <TapRepaint b={b} />}
      {b >= 176 && b < 184 && <Versions b={b} />}
      <AppClip b={b} at={184} to={190} name="edit-result" start={0.6} end={8.6} caption="All of it, in the app." flip />
      <Chip b={b} at={128.4} out={155.4} model="Muse Image paints, Muse Spark composes" note="Real results from the Oct 31 run" />
    </AbsoluteFill>
  )
}
function Three({ b }: { b: number }) {
  return (
    <AbsoluteFill>
      <Rise b={b} at={128.1} out={133.2} text="Three paintings, from that request." size={80} center top={44} style={sans(800)} gap={0.05} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 170, display: 'flex', justifyContent: 'center', gap: 40, perspective: 1800 }}>
        {CONCEPTS.map((c, i) => {
          const p = expoOut(range(b, 128.5 + i * 0.7, 129.6 + i * 0.7)), q = expoIn(range(b, 133.3, 134))
          return (
            <div key={i} style={{ width: 510, transform: `translateY(${(1 - p) * 950 - q * 1000}px) rotateX(${(1 - p) * 32}deg) rotateZ(${(1 - p) * (i - 1) * 8}deg)` }}>
              <Img src={still(c.f)} style={{ width: 510, height: 553, objectFit: 'cover', borderRadius: 10, boxShadow: '0 40px 80px -20px rgb(0 0 0 / 0.85)' }} />
              <div style={{ marginTop: 14, fontSize: 36, color: PAPER, textAlign: 'center', ...sans(700) }}>{c.title}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
function Full({ b }: { b: number }) {
  const i = Math.floor((b - 134) / 4), u = (b - 134 - i * 4) / 4, c = CONCEPTS[i]
  const wipe = expoInOut(range(u, 0, 0.14))
  return (
    <AbsoluteFill style={{ clipPath: `inset(${(1 - wipe) * 100}% 0 0 0)` }}>
      <Img src={still(c.f)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${lerp(1.5, 1.2, u)}) translateY(${lerp(-40, 50, u)}px)` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(transparent 45%, rgb(14 12 11 / 0.88))' }} />
      <Rise b={b} at={134 + i * 4 + 0.4} out={134 + i * 4 + 3.5} text={c.title} size={118} left={80} top={660} />
      <Rise b={b} at={134 + i * 4 + 0.8} out={134 + i * 4 + 3.5} text={c.idea ?? ''} size={40} left={84} top={800} style={{ ...sans(500), width: 1500 }} gap={0.02} />
    </AbsoluteFill>
  )
}
function hang(i: number) {
  const c = data.mockup.corners, S = WALL.scale
  return { left: c[0][0] * S, top: c[0][1] * S, width: (c[1][0] - c[0][0]) * S, height: (c[2][1] - c[0][1]) * S, i }
}
function OnWall({ b }: { b: number }) {
  const i = Math.min(2, Math.floor((b - 147) / 2.2))
  const r = hang(0)
  const t0 = 147 + Math.max(i, 0) * 2.2
  const drop = backOut(range(b, t0, t0 + 0.55), 1.3)
  return (
    <AbsoluteFill>
      <Img src={still('wall.jpg')} style={{ position: 'absolute', left: 0, top: 0, width: WALL.w, height: 1080 }} />
      {b >= 147 && <Img src={still(CONCEPTS[Math.max(i, 0)].f)} style={{ position: 'absolute', ...{ left: r.left, top: r.top, width: r.width, height: r.height }, objectFit: 'cover', boxShadow: '0 4px 8px rgb(0 0 0 / 0.3), 0 28px 50px -14px rgb(0 0 0 / 0.6)', transform: `translateY(${(1 - drop) * -1200}px)` }} />}
      <div style={{ position: 'absolute', left: WALL.w + 34, top: 170, width: W - WALL.w - 70 }}>
        <Rise b={b} at={146.3} out={155.3} text="On the actual wall." size={88} style={{ position: 'relative' }} />
        <Fade b={b} at={147.4} out={155.3} style={{ marginTop: 26, font: `500 30px ${MONO}`, color: '#c8c2b8' }}>{data.size.width_cm} × {data.size.height_cm} cm</Fade>
        <div style={{ marginTop: 24, fontSize: 38, color: CORAL, ...sans(700) }}>{CONCEPTS[Math.max(i, 0)].title}</div>
      </div>
    </AbsoluteFill>
  )
}
// The real tap: two real points on real segments, the real request, the real repaint.
function TapRepaint({ b }: { b: number }) {
  const h = 980, w = (h * data.canvasPx[0]) / data.canvasPx[1], x0 = 60, y0 = 50
  const seg = data.concepts[3].edit!.segments!
  const dark = smooth(range(b, 157, 157.6)) * (1 - smooth(range(b, 169.2, 170)))
  const typed = 'change the shape and color'.slice(0, Math.floor(lerp(0, 26, range(b, 160, 163))))
  const wipe = expoInOut(range(b, 166, 169))
  const showAll = b >= 169.4
  const tapAt = (k: number) => 157 + k * 1.5
  const flicker = b >= 171 && b < 175 && Math.floor((b - 171) / 1) % 2 === 1
  const R = 1400 * wipe
  const pct = { x: seg[0][0] * w, y: seg[0][1] * h }
  const box: CSSProperties = { position: 'absolute', left: 0, top: 0, width: w, height: h }
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: x0, top: y0, width: w, height: h, borderRadius: 10, overflow: 'hidden', boxShadow: '0 40px 90px -20px rgb(0 0 0 / 0.8)' }}>
        <Img src={still(showAll && !flicker ? 'v2.jpg' : 'c3.jpg')} style={{ ...box, filter: `brightness(${1 - dark * 0.62}) saturate(${1 - dark * 0.45})` }} />
        {!showAll && dark > 0 && <Img src={still('c3.jpg')} style={{ ...box, WebkitMaskImage: `url(${still('segment.png')})`, WebkitMaskSize: '100% 100%' } as CSSProperties} />}
        {!showAll && wipe > 0 && (
          <div style={{ ...box, clipPath: `circle(${R}px at ${pct.x}px ${pct.y}px)` }}>
            <Img src={still('v2-seg.png')} style={box} />
          </div>
        )}
        {seg.map(([sx, sy], k) => {
          const t = b - tapAt(k)
          if (t < 0 || t > 1.4) return null
          return <span key={k} style={{ position: 'absolute', left: sx * w - 40, top: sy * h - 40, width: 80, height: 80, borderRadius: 80, boxShadow: `0 0 0 ${lerp(10, 1, range(t, 0, 1))}px ${PAPER}`, transform: `scale(${lerp(0.2, 1.8, expoOut(range(t, 0, 1)))})`, opacity: 1 - range(t, 0.7, 1.4) }} />
        })}
      </div>
      <div style={{ position: 'absolute', left: x0 + w + 60, top: 130, right: 70 }}>
        <Rise b={b} at={156.3} out={159.6} text="Don't like a shape? Tap it." size={82} style={{ position: 'relative' }} gap={0.05} />
        {b >= 159.6 && b < 169.6 && <>
          <Fade b={b} at={159.6} out={169.2} style={{ font: `600 25px ${MONO}`, color: CORAL, marginBottom: 16 }}>2 SEGMENTS SELECTED</Fade>
          <Fade b={b} at={159.8} out={169.2} style={{ background: '#1b1816', padding: '26px 28px', borderRadius: 16, fontSize: 52, minHeight: 130, lineHeight: 1.2, color: PAPER, boxShadow: '0 0 0 1px rgb(244 239 230 / 0.12)', ...sans(600) }}>{typed}<span style={{ display: 'inline-block', width: 4, height: 50, verticalAlign: -6, marginLeft: 4, background: CORAL, opacity: frac(b) < 0.55 ? 1 : 0 }} /></Fade>
          <Fade b={b} at={163.6} out={169.2} style={{ marginTop: 24, font: `500 27px/1.35 ${MONO}`, color: '#b9b2a6' }}>Segments come from the painting's own band map.</Fade>
        </>}
        {b >= 169.6 && <Rise b={b} at={169.7} out={175.2} text="Only what you tapped changed." size={100} tone={PAPER} style={{ position: 'relative' }} />}
        {b >= 171 && <Fade b={b} at={171} out={175.2} style={{ marginTop: 30, font: `600 30px ${MONO}`, color: CORAL }}>{flicker ? 'BEFORE' : 'AFTER'}</Fade>}
      </div>
      <Chip b={b} at={166} out={175.4} model="Muse Image repaints it" note="Saved result of this exact request, Oct 31" />
    </AbsoluteFill>
  )
}
function Versions({ b }: { b: number }) {
  const V: [string, string, string | null][] = [['c3.jpg', 'Original', null], ['v2.jpg', 'Version 2', 'change the shape and color'], ['v3.jpg', 'Version 3', 'change the design']]
  const pick = b < 181 ? Math.min(2, Math.floor((b - 177) / 1.3)) : 0
  return (
    <AbsoluteFill>
      <Rise b={b} at={176.1} out={183.2} text="Every answer is a version. Keep it, or go back." size={72} center top={50} style={sans(800)} gap={0.05} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 180, display: 'flex', justifyContent: 'center', gap: 40 }}>
        {V.map(([f, label, ask], i) => {
          const p = expoOut(range(b, 176.3 + i * 0.25, 177.1 + i * 0.25)), q = expoIn(range(b, 183.4, 184))
          const on = i === Math.max(0, pick)
          return (
            <div key={f} style={{ width: 500, transform: `translateY(${(1 - p) * 950 - q * 1000}px) scale(${on ? 1.035 : 0.97})`, opacity: on ? 1 : 0.42 }}>
              <Img src={still(f)} style={{ width: 500, height: 542, objectFit: 'cover', borderRadius: 10, boxShadow: on ? `0 0 0 6px ${CORAL}` : undefined }} />
              <div style={{ marginTop: 16, fontSize: 38, color: PAPER, ...sans(700) }}>{label}</div>
              <div style={{ marginTop: 4, font: `500 25px ${MONO}`, color: '#b9b2a6', minHeight: 34 }}>{ask ? `"${ask}"` : 'as first painted'}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- 03 THE RECIPE
function RecipeScene({ b }: { b: number }) {
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {b < 208 && <Explode b={b} />}
      {b >= 208 && b < 222 && <Stacks b={b} />}
      {b >= 222 && b < 246 && <Mixing b={b} />}
      <AppClip b={b} at={246} to={258} name="recipe" start={0.2} end={10.8} caption="Tick what you own. See what's left to buy." sub="Every color and tool, with 15% spare so you don't run dry mid-band." />
    </AbsoluteFill>
  )
}
function Explode({ b }: { b: number }) {
  const scanY = range(b, 197, 199)
  const open = expoInOut(range(b, 200, 201.6))
  const size = { w: 560, h: 607 }
  const total = data.totals.area_cm2
  return (
    <AbsoluteFill style={{ background: INK }}>
      <div style={{ position: 'absolute', left: 200, top: 250, width: size.w, height: size.h, perspective: 2400 }}>
        <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateX(${open * 58}deg) rotateZ(${open * -34}deg) translateY(${open * -30}px)` }}>
          {open < 1 && <Img src={still('c3.jpg')} style={{ position: 'absolute', width: size.w, height: size.h, objectFit: 'cover', clipPath: `inset(${scanY * 100}% 0 0 0)` }} />}
          {open < 1 && <Img src={still('bandmap.png')} style={{ position: 'absolute', width: size.w, height: size.h, clipPath: `inset(0 0 ${(1 - scanY) * 100}% 0)`, opacity: 1 - open }} />}
          {open > 0 && data.bands.map((_, i) => <Img key={i} src={still(`band-${i}.png`)} style={{ position: 'absolute', width: size.w, height: size.h, transform: `translateZ(${(i - 2) * 120 * open}px)`, opacity: open }} />)}
        </div>
      </div>
      {scanY > 0 && scanY < 1 && <div style={{ position: 'absolute', left: 200, width: size.w, top: 250 + scanY * size.h, height: 4, background: CORAL, boxShadow: `0 0 24px ${CORAL}` }} />}
      <div style={{ position: 'absolute', left: 980, top: 72, right: 60 }}>
        <Rise b={b} at={196.2} out={207.2} text="The picture becomes a plan." size={78} style={{ position: 'relative' }} gap={0.05} />
        <Fade b={b} at={197} out={207.2} style={{ marginTop: 12, fontSize: 32, color: '#c8c2b8', ...sans(500) }}>A band map, read straight off the painting.</Fade>
        <div style={{ marginTop: 30 }}>
          {data.bands.map((x, i) => {
            const t = 200.6 + i * 0.35
            const a = Math.round(count(b, t, 1.1, x.area))
            return (
              <div key={x.name} style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto', gap: 18, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #2c2825', opacity: range(b, t, t + 0.3) * (1 - range(b, 207.2, 207.8)), fontSize: 33, color: PAPER, fontVariantNumeric: 'tabular-nums', ...sans(600) }}>
                <span style={{ width: 34, height: 34, borderRadius: 7, background: x.hex }} /><span>{cap(x.name)}</span><span>{a.toLocaleString('en-US')} cm²</span>
              </div>
            )
          })}
        </div>
      </div>
      <CodePane b={b} at={203.4} out={207.3} excerpt={repo.layout} size={15.5} style={{ left: 980, right: 60, top: 660 }} />
      <Chip b={b} at={197} out={207.4} model="Built here: the band reading" />
    </AbsoluteFill>
  )
}
function Stacks({ b }: { b: number }) {
  const paint = count(b, 209.2, 3.4, data.totals.paint_g), paste = count(b, 209.2, 3.4, data.totals.paste_g)
  // Where each stack stands on screen, from the same camera the shader uses.
  const orbit = lerp(-0.34, 0.3, smooth(range(b, 208, 222)))
  const ro = [Math.sin(orbit) * 22, 6.0, Math.cos(orbit) * 22], ta = [-2.7, 1.9, 0]
  const norm = (v: number[]) => { const l = Math.hypot(...v); return v.map(x => x / l) }
  const cross = (a: number[], c: number[]) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]]
  const dot = (a: number[], c: number[]) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2]
  const ww = norm(ta.map((x, i) => x - ro[i])), uu = norm(cross(ww, [0, 1, 0])), vv = cross(uu, ww)
  const project = (p: number[]) => { const d = p.map((x, i) => x - ro[i]); const z = dot(d, ww); return [960 + (dot(d, uu) / z) * 1.7 * 1080, 540 - (dot(d, vv) / z) * 1.7 * 1080] }
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 70, top: 66 }}>
        <Fade b={b} at={208.2} out={221.2} style={{ font: `600 25px ${MONO}`, color: CORAL, marginBottom: 12 }}>HOW MUCH PAINT WILL IT TAKE?</Fade>
        <div style={{ fontSize: 96, lineHeight: 1.04, color: PAPER, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...sans(900, 96) }}>{kg(paint)} <span style={{ fontSize: 44, ...sans(600) }}>of paint</span><br />{kg(paste)} <span style={{ fontSize: 44, ...sans(600) }}>of paste</span></div>
      </div>
      {data.bands.map((x, i) => {
        const [lx, ly] = project([(i - 2) * 2.5, -0.02, 1.25])
        return (
          <div key={x.name} style={{ position: 'absolute', left: lx - 150, width: 300, top: ly + 8, textAlign: 'center', opacity: range(b, 209.5 + i * 0.5, 210.2 + i * 0.5) }}>
            <div style={{ fontSize: 28, color: PAPER, ...sans(700) }}>{cap(x.name)}</div>
            <div style={{ font: `500 23px ${MONO}`, color: '#c8c2b8' }}>{fix2(x.paint / 1000)} + {fix2(x.paste / 1000)}</div>
          </div>
        )
      })}
      <CodePane b={b} at={214} out={221} excerpt={repo.volume} size={14} style={{ left: 60, top: 335, width: 620 }} />
      <Chip b={b} at={209} out={221.3} model="Area × thickness × density, per band" note="Real numbers for Plum Hollow, 153 × 166 cm" />
    </AbsoluteFill>
  )
}
function Mixing({ b }: { b: number }) {
  const i = Math.floor((b - 222) / 8), at = 222 + i * 8, u = b - at
  const x = data.bands[[0, 1, 4][i]]
  const sum = x.tubes.reduce((a, t) => a + t.parts, 0)
  const T = data.tubes as Record<string, string>
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 1090, top: 110, right: 70 }}>
        <Fade b={b} at={at + 0.1} out={at + 7.4} style={{ font: `600 25px ${MONO}`, color: CORAL, marginBottom: 12 }}>WHICH COLORS DO I MIX?</Fade>
        <Rise b={b} at={at + 0.15} out={at + 7.3} text={cap(x.name)} size={92} style={{ position: 'relative', ...sans(900, 96) }} gap={0.05} />
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {x.tubes.map((t, k) => {
            const p = expoOut(range(u, 0.9 + k * 0.3, 1.8 + k * 0.3))
            return (
              <div key={t.name} style={{ opacity: range(u, 0.9 + k * 0.3, 1.2 + k * 0.3) * (1 - range(u, 7.3, 7.7)) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 34, color: PAPER, fontVariantNumeric: 'tabular-nums', ...sans(600) }}><span>{t.name}</span><span>{t.parts} {t.parts === 1 ? 'part' : 'parts'}</span></div>
                <div style={{ marginTop: 7, height: 22, borderRadius: 5, background: '#26231f', overflow: 'hidden' }}><div style={{ height: '100%', width: `${(p * t.parts * 100) / sum}%`, background: T[t.name], boxShadow: 'inset 0 0 0 1px rgb(244 239 230 / 0.25)' }} /></div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 24, opacity: range(u, 5.2, 5.7) * (1 - range(u, 7.3, 7.7)) }}>
          <span style={{ width: 94, height: 94, borderRadius: 14, background: `linear-gradient(90deg, ${x.target} 50%, ${x.hex} 50%)` }} />
          <div style={{ color: PAPER, ...sans(700), fontSize: 38 }}>ΔE {x.de.toFixed(2)}<div style={{ font: `500 22px/1.3 ${MONO}`, color: '#b9b2a6' }}>concept's color · closest mix</div></div>
        </div>
      </div>
      <Chip b={b} at={223} out={245.3} model="Recipe search built here, on the Mixbox pigment model" note="Mixbox: Secret Weapons, CC BY-NC 4.0. Not built here." />
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- 04 THE GUIDE
function GuideScene({ b }: { b: number }) {
  const steps = data.guide.steps
  const i = Math.min(steps.length - 1, Math.floor((b - 264) / 3.5))
  const at = 264 + i * 3.5
  const grid = expoInOut(range(b, 292, 293.6))
  if (b >= 292) {
    return (
      <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
        <Rise b={b} at={292.3} out={297.3} text="Spark writes the steps. The app cuts each picture from the band map." size={50} center top={40} style={sans(800)} gap={0.04} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 150, display: 'grid', gridTemplateColumns: 'repeat(4, 372px)', justifyContent: 'center', gap: 24 }}>
          {steps.map((_, k) => <Img key={k} src={still(`stage-${k + 1}.png`)} style={{ width: 372, height: 403, objectFit: 'cover', borderRadius: 8, transform: `scale(${backOut(range(b, 292 + k * 0.1, 292.7 + k * 0.1), 1.6)}) translateY(${-expoIn(range(b, 297.5, 298)) * 1000}px)`, opacity: grid > 0 ? 1 : 0 }} />)}
        </div>
      </AbsoluteFill>
    )
  }
  const s = steps[i], u = b - at
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 80, top: 130, width: 900 }}>
        <div style={{ fontSize: 210, lineHeight: 1, color: CORAL, fontVariantNumeric: 'tabular-nums', ...sans(300, 100), transform: `translateY(${(1 - expoOut(range(u, 0, 0.4))) * 40}px)` }}>{String(i + 1).padStart(2, '0')}</div>
        <Rise b={b} at={at + 0.05} out={at + 3} text={s.title} size={80} style={{ position: 'relative', marginTop: 14 }} gap={0.05} />
        <Fade b={b} at={at + 0.6} out={at + 3} style={{ marginTop: 26, fontSize: 38, lineHeight: 1.3, color: '#d8d2c6', ...sans(500) }}>{s.do[0]}</Fade>
        {s.wait && <Fade b={b} at={at + 1.2} out={at + 3} style={{ marginTop: 24, display: 'inline-flex', gap: 14, alignItems: 'center', fontSize: 34, color: INK, background: PAPER, padding: '10px 18px', borderRadius: 10, ...sans(700) }}><span style={{ display: 'inline-block', transform: `rotate(${expoInOut(frac(u / 1)) * 180 + Math.floor(u) * 180}deg)` }}>⧗</span> Let it dry {s.wait}</Fade>}
      </div>
      <div style={{ position: 'absolute', left: 1010, top: 80, width: 830, height: 900, perspective: 2200 }}>
        {Array.from({ length: i + 1 }, (_, k) => {
          const age = b - (264 + k * 3.5)
          const p = expoOut(range(age, 0, 0.5))
          const rest = i - k
          if (rest > 2) return null
          return <Img key={k} src={still(`stage-${k + 1}.png`)} style={{ position: 'absolute', left: 0, top: 0, width: 830, height: 900, objectFit: 'cover', borderRadius: 10, boxShadow: '0 30px 60px -20px rgb(0 0 0 / 0.8)', transformOrigin: '50% 100%', transform: `translateY(${(1 - p) * -1300 + rest * -14}px) rotateZ(${(1 - p) * ((k % 2) * 2 - 1) * 9 + rest * ((k % 2) * 2 - 1) * 1.2}deg) scale(${1 - rest * 0.02})`, filter: rest ? 'brightness(0.55)' : undefined }} />
        })}
      </div>
      <Chip b={b} at={264.3} out={291.3} model="Muse Spark's guide, the app's stage pictures" note="Saved from the real run" />
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- 05 THE CHECK-INS
function CheckScene({ b }: { b: number }) {
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      {b < 318 && <Bowl b={b} />}
      {b >= 318 && b < 327 && <Flatten b={b} />}
      {b >= 327 && <Ask b={b} />}
    </AbsoluteFill>
  )
}
function Bowl({ b }: { b: number }) {
  const m = data.mix, W_ = 1040, H_ = (W_ * m.size[1]) / m.size[0], X = 60, Y = 130
  const dot = (p: number[], at: number, color: string, label: string, side: number) => {
    const s = backOut(range(b, at, at + 0.4), 3)
    const x = X + (p[0] / m.size[0]) * W_, y = Y + (p[1] / m.size[1]) * H_
    return (
      <>
        <span style={{ position: 'absolute', left: x - 22, top: y - 22, width: 44, height: 44, borderRadius: 44, background: color, boxShadow: `0 0 0 5px ${PAPER}, 0 6px 16px rgb(0 0 0 / 0.5)`, transform: `scale(${s})` }} />
        <span style={{ position: 'absolute', left: x + (side > 0 ? 38 : -258), width: 220, textAlign: side > 0 ? 'left' : 'right', top: y - 20, font: `600 26px ${MONO}`, color: INK, opacity: range(b, at + 0.2, at + 0.5) }}><span style={{ background: PAPER, padding: '3px 10px', borderRadius: 6 }}>{label}</span></span>
      </>
    )
  }
  const scan = range(b, 304.4, 306)
  const de = count(b, 311, 1.2, m.de)
  return (
    <AbsoluteFill>
      <Rise b={b} at={304.1} out={317.3} text="Is this mix right? Photograph the bowl." size={64} left={60} top={36} style={sans(800)} gap={0.05} />
      <Img src={still('bowl.jpg')} style={{ position: 'absolute', left: X, top: Y, width: W_, height: H_, borderRadius: 12, clipPath: `inset(0 0 ${(1 - expoOut(range(b, 304.2, 305))) * 100}% 0 round 12px)` }} />
      {scan > 0 && scan < 1 && <div style={{ position: 'absolute', left: X, width: W_, top: Y + scan * H_, height: 4, background: CORAL, boxShadow: `0 0 26px ${CORAL}` }} />}
      {b >= 306 && dot(m.white, 306, '#fff', 'WHITE, FOUND', 1)}
      {b >= 308 && dot(m.point, 308, m.measured, 'PAINT, FOUND', 1)}
      <div style={{ position: 'absolute', left: 1160, top: 130, right: 60, color: PAPER }}>
        <div style={{ display: 'flex', gap: 18, opacity: range(b, 309.5, 310) }}>
          {[['RECIPE', m.planned], ['THE BOWL', m.measured]].map(([l, c]) => (
            <div key={l} style={{ flex: 1 }}><div style={{ height: 170, borderRadius: 12, background: c, boxShadow: 'inset 0 0 0 1px rgb(244 239 230 / 0.2)' }} /><div style={{ marginTop: 10, font: `600 23px ${MONO}`, color: '#c8c2b8' }}>{l}<br />{c}</div></div>
          ))}
        </div>
        <div style={{ marginTop: 22, fontSize: 124, lineHeight: 1, fontVariantNumeric: 'tabular-nums', ...sans(900, 96), opacity: range(b, 311, 311.2) }}>ΔE {de.toFixed(1)}</div>
        <Fade b={b} at={312.3} out={317.3} style={{ marginTop: 12, fontSize: 42, color: CORAL, ...sans(800) }}>Doesn't match. Duller than the mix.</Fade>
        <Fade b={b} at={313.5} out={317.3} style={{ marginTop: 18, fontSize: 36, lineHeight: 1.28, ...sans(600) }}>{m.advice}</Fade>
      </div>
      <Chip b={b} at={305} out={317.4} model="Measured from the photo, no model call" note="A real reading of a real photo of the paint" />
    </AbsoluteFill>
  )
}
function Flatten({ b }: { b: number }) {
  const [pw, ph] = data.canvasPhotoSize
  const hh = 800, ww = (hh * pw) / ph
  const go = expoInOut(range(b, 320.5, 322))
  return (
    <AbsoluteFill>
      <Rise b={b} at={318.1} out={326.3} text="A photo of the canvas, measured square-on." size={64} left={60} top={36} style={sans(800)} gap={0.04} />
      <Img src={still('canvas-photo.jpg')} style={{ position: 'absolute', left: 110, top: 150, width: ww, height: hh, objectFit: 'cover', borderRadius: 12, transform: `translateY(${(1 - expoOut(range(b, 318.2, 319))) * 950}px)` }} />
      <svg width={260} height={100} style={{ position: 'absolute', left: 110 + ww + 34, top: 500, opacity: go }}>
        <line x1={0} y1={50} x2={200} y2={50} stroke={CORAL} strokeWidth={8} />
        <path d="M185 22 L235 50 L185 78 Z" fill={CORAL} />
      </svg>
      <Img src={still('canvas-flat.png')} style={{ position: 'absolute', left: 1020, top: 150, width: 800, height: 800, objectFit: 'contain', transform: `perspective(1800px) rotateY(${(1 - go) * 56}deg) scale(${lerp(0.72, 1, go)})`, opacity: range(b, 320.5, 321) }} />
      <Chip b={b} at={319} out={326.4} model="SAM 3.1 finds the corners, you can correct them" note="A real canvas. Each band's coverage and color are read from here." />
    </AbsoluteFill>
  )
}
function Ask({ b }: { b: number }) {
  return (
    <AbsoluteFill style={{ padding: '110px 150px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: PAPER, color: INK, fontSize: 56, padding: '22px 32px', borderRadius: 26, maxWidth: 1200, ...sans(600), transform: `scale(${backOut(range(b, 327.2, 327.7), 1.6)})`, transformOrigin: '100% 100%' }}>{data.qa.question}</div>
      </div>
      <div style={{ marginTop: 60, width: 1500 }}>
        <Rise b={b} at={328.5} out={335} text={data.qa.answer.split('. ').slice(0, 2).join('. ') + '…'} size={66} style={{ position: 'relative', ...sans(500) }} gap={0.08} lineHeight={1.24} />
      </div>
      <Chip b={b} at={328} out={335.3} model="Muse Spark, from the plan and the check-ins" note="A real question and answer, saved Oct 31" />
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- THE END
const MODELS: [string, string][] = [
  ['Muse Spark', 'Reads the brief, writes compositions and the guide, checks steps, answers questions'],
  ['Muse Image', 'Paints the concepts, and repaints what you tap'],
  ['SAM 3.1', 'Finds the canvas corners in progress photos'],
  ['Muse Voice Transcribe', 'Turns dictation into the brief'],
]
function Credits({ b }: { b: number }) {
  const show = (t: number): CSSProperties => ({ opacity: range(b, t, t + 0.4) * (1 - range(b, 345.5, 346)), transform: `translateY(${(1 - expoOut(range(b, t, t + 0.6))) * 18}px)` })
  return (
    <AbsoluteFill style={{ background: INK, padding: '64px 90px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', columnGap: 70, alignContent: 'start', color: PAPER }}>
      <div style={{ gridColumn: '1 / -1', fontSize: 74, marginBottom: 34, ...sans(900, 104), letterSpacing: '-0.02em', ...show(336.1) }}>What did what.</div>
      <div style={show(336.5)}>
        {MODELS.map(([n, j]) => (
          <div key={n} style={{ padding: '15px 0', borderTop: '1px solid #36322c' }}>
            <div style={{ fontSize: 40, ...sans(800) }}>{n}</div>
            <div style={{ fontSize: 28, lineHeight: 1.3, color: '#c8c2b8', ...sans(400) }}>{j}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
        <div style={show(337.5)}>
          <div style={{ font: `600 25px ${MONO}`, color: CORAL, marginBottom: 12 }}>BUILT DURING THE HACKATHON</div>
          <div style={{ fontSize: 31, lineHeight: 1.32, ...sans(500) }}>All the code: every screen, the band reading, the recipes, the paint and color checks. {repo.log.length} commits from {repo.log[0].date.slice(5).replace('-', '/')}, by one person.</div>
        </div>
        <div style={show(338.5)}>
          <div style={{ font: `600 25px ${MONO}`, color: CORAL, marginBottom: 12 }}>NOT BUILT HERE</div>
          <div style={{ fontSize: 31, lineHeight: 1.32, ...sans(500) }}>Mixbox paint mixing (Secret Weapons, CC BY-NC 4.0). The SAM stream adapter, adapted from Meta's cookbook (MIT). Meta's models.</div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
function End({ b }: { b: number }) {
  return (
    <AbsoluteFill>
      {b < 351.8 && (
        <div style={{ position: 'absolute', left: 120, top: 360 }}>
          <Rise b={b} at={346.5} out={351} text="The app stops there." size={124} style={{ position: 'relative' }} />
          <Rise b={b} at={348} out={351} text="The rest is a knife, a bowl and a wall." size={88} tone={PAPER} style={{ position: 'relative', marginTop: 20, ...serif(400), fontStyle: 'italic' }} gap={0.06} />
        </div>
      )}
      {b >= 351.6 && <Wordmark b={b} at={351.6} size={290} y={250} />}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 660, textAlign: 'center', color: PAPER }}>
        <Fade b={b} at={353.6} style={{ fontSize: 58, ...sans(600) }}>impasto.projectrunning.com</Fade>
        <Fade b={b} at={354.4} style={{ marginTop: 14, font: `500 32px ${MONO}`, color: '#d8d2c6' }}>github.com/ship-it-mind/impasto</Fade>
        <Fade b={b} at={355.4} style={{ marginTop: 30, fontSize: 44, ...serif(400), fontStyle: 'italic' }}>Built for my wife, and for anyone with a knife and a wall.</Fade>
      </div>
      <AbsoluteFill style={{ background: '#000', opacity: range(b, 358.8, 359.7) }} />
    </AbsoluteFill>
  )
}

// ---------------------------------------------------------------- The frame around it all
const CHAPTERS: [number, string][] = [[0, ''], [76, ''], [84, '01 THE BRIEF'], [124, '02 THE CONCEPTS'], [192, '03 THE RECIPE'], [260, '04 THE GUIDE'], [300, '05 THE CHECK-INS'], [336, '']]
function Hud({ b }: { b: number }) {
  if (b >= 346 || b < 3) return null
  const ch = [...CHAPTERS].reverse().find(([a]) => b >= a)![1]
  const a = range(b, 3, 4)
  const s: CSSProperties = { position: 'absolute', font: `500 19px ${MONO}`, letterSpacing: '0.04em', color: PAPER, mixBlendMode: 'difference', opacity: a }
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ ...s, right: 40, top: 26 }}>{ch}</div>
      <div style={{ ...s, left: 40, bottom: 26 }}>BUILT DURING THE HACKATHON · OCT 27 – NOV 4</div>
      <div style={{ ...s, right: 40, bottom: 26 }}>{String(Math.floor(b / 2 / 60))}:{String(Math.floor((b / 2) % 60)).padStart(2, '0')} / 3:00</div>
    </AbsoluteFill>
  )
}

export function Film() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const b = (frame / fps) * 2
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => { back(ref.current!.getContext('2d')!, b) }, [b])
  void kick; void stab; void hash2; void SERIF; void chapterless; void expoOut
  const inChapter = (a: number, z: number) => b >= a && b < z
  return (
    <AbsoluteFill style={{ background: INK, overflow: 'hidden' }}>
      <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', inset: 0 }} />
      {b < 28.4 && <Open b={b} />}
      {inChapter(28, 64) && <Story b={b} />}
      {inChapter(64, 76) && <Built b={b} />}
      {inChapter(76, 84.8) && <Pipeline b={b} />}
      {inChapter(88, 124) && <BriefScene b={b} />}
      {inChapter(128, 192) && <ConceptScene b={b} />}
      {inChapter(196, 260) && <RecipeScene b={b} />}
      {inChapter(264, 300) && <GuideScene b={b} />}
      {inChapter(304, 336) && <CheckScene b={b} />}
      {inChapter(336, 346) && <Credits b={b} />}
      {b >= 346 && <End b={b} />}
      <Chapter b={b} at={84} n="01" title="The brief" line="From a sentence and a photo of a wall." />
      <Chapter b={b} at={124} n="02" title="The concepts" line="Will it work on that wall?" />
      <Chapter b={b} at={192} n="03" title="The recipe" line="How much paint, and which colors." />
      <Chapter b={b} at={260} n="04" title="The guide" line="What to do next, and what it should look like." />
      <Chapter b={b} at={300} n="05" title="The check-ins" line="Is it going to plan?" />
      <Hud b={b} />
    </AbsoluteFill>
  )
}
void W; void H; void lerp
