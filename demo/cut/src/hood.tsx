// "Under the hood", three ways to choose from. All use this piece's real results:
// her words, the brief and steps Spark wrote, the painting SAM 3.1 found in her picture (its corners,
// as the app showed them), the picture Muse Image cleaned, and the plan's band map and grams.
import React from 'react'
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { C, Fade, SANS, SERIF, Say, ease } from './kit'

// Timed to the voiceover (public/vo/hood.wav, from frame 8): each model's beat starts on its name.
const SAY_ALL: [number, number, string][] = [
  [10, 72, 'Underneath, four Meta models.'],
  [87, 150, 'Muse Voice Transcribe hears the idea.'],
  [162, 254, 'Muse Spark plans it, from the brief to every step.'],
  [265, 398, 'SAM 3.1 finds the painting, and the canvas in every photo.'],
  [409, 498, 'Muse Image cleans it, and repaints what she changed.'],
  [510, 680, 'The rest, Impasto measures itself: areas into grams, colors into mixes.'],
]
const BEATS = [[87, 162], [162, 265], [265, 409], [409, 510], [510, 688]] as const
const MODELS = [
  { name: 'Muse Voice Transcribe', job: 'hears the idea' },
  { name: 'Muse Spark', job: 'plans it, from the brief to every step' },
  { name: 'SAM 3.1', job: 'finds the painting, and the canvas in every check-in' },
  { name: 'Muse Image', job: 'cleans the picture, and repaints what she changes' },
]
const OURS = { name: 'Impasto', job: 'measures the rest: areas into grams, colors into mixes' }
const rise = (f: number, a: number, d = 16) => ({ opacity: ease(f, a, a + d * 0.7), transform: `translateY(${(1 - ease(f, a, a + d)) * 22}px)` })
const CARD: React.CSSProperties = { background: '#fff', borderRadius: 22, boxShadow: '0 30px 70px -30px rgba(60,40,30,.4), 0 0 0 1px rgba(60,40,30,.06)' }

// ─── Each model's real work, as a picture ──────────────────────────────────
const TRANSCRIPT = 'This is the wall of my office room. I wanna paint this exact reference I shared with you, can you help with that?'
const VoiceViz: React.FC = () => {
  const f = useCurrentFrame()
  const words = TRANSCRIPT.split(' ')
  const shown = Math.round(interpolate(f, [26, 80], [0, words.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  return (
    <div style={{ width: 940 }}>
      <div style={{ ...CARD, height: 130, display: 'flex', alignItems: 'center', gap: 7, padding: '0 40px', ...rise(f, 0) }}>
        {Array.from({ length: 56 }, (_, i) => {
          const live = f < 84 ? 1 : 1 - ease(f, 84, 96)
          const h = 10 + 70 * live * Math.abs(Math.sin(f / 3.2 + i * 1.3)) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + f / 9)))
          return <div key={i} style={{ width: 8, height: h, borderRadius: 4, background: C.plum, opacity: 0.85 }} />
        })}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 50, lineHeight: 1.22, color: C.ink, marginTop: 44, letterSpacing: -0.6, minHeight: 250 }}>
        {shown > 0 && '“'}{words.slice(0, shown).join(' ')}{shown >= words.length ? '”' : ''}
      </div>
    </div>
  )
}
const STEP_TITLES = ['Prepare the canvas and mark the bands', 'Lay Muted Plum', 'Lay Olive Taupe', 'Lay Sage Grey', 'Lay Warm Linen Beige', 'Lay Deep Burgundy Brown', 'Lay Dusty Rose', 'Let it dry and finish']
const SparkViz: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <div style={{ width: 940, display: 'flex', gap: 28 }}>
      <div style={{ ...CARD, width: 440, padding: '28px 30px', ...rise(f, 0) }}>
        <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: C.soft }}>The brief</div>
        <div style={{ fontFamily: SERIF, fontSize: 36, lineHeight: 1.15, color: C.ink, margin: '12px 0 18px' }}>Exact copy of the shared reference for the office wall.</div>
        {[['Size', '115 × 135 cm'], ['Room', 'office room'], ['Colors', 'From the picture']].map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(31,26,23,.1)', fontFamily: SANS, fontSize: 24, ...rise(f, 10 + i * 6, 12) }}>
            <span style={{ color: C.soft }}>{k}</span><span style={{ color: C.ink }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ ...CARD, width: 472, padding: '24px 26px', ...rise(f, 24) }}>
        <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: C.soft, marginBottom: 8 }}>How to paint it</div>
        {STEP_TITLES.map((t, i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', fontFamily: SANS, fontSize: 23, color: C.ink, ...rise(f, 34 + i * 7, 10) }}>
            <span style={{ width: 34, height: 34, borderRadius: 34, background: C.ink, color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{String(i + 1).padStart(2, '0')}</span>
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}
// Her picture (1086 × 1448) and the corners SAM 3.1 found in it, as the app showed them.
const PIC = { w: 1086, h: 1448, q: [[120, 137], [957, 137], [957, 1145], [120, 1145]] as [number, number][] }
const SamViz: React.FC = () => {
  const f = useCurrentFrame()
  const H = 700, W = H * PIC.w / PIC.h, k = H / PIC.h
  const q = PIC.q.map(([x, y]) => [x * k, y * k])
  const draw = ease(f, 14, 46), fill = ease(f, 46, 62)
  const per = 2 * ((q[1][0] - q[0][0]) + (q[2][1] - q[1][1]))
  return (
    <div style={{ position: 'relative', width: W, height: H, ...CARD, overflow: 'hidden', ...rise(f, 0) }}>
      <Img src={staticFile('app/to-paint.jpg')} style={{ width: W, height: H, display: 'block' }} />
      <AbsoluteFill style={{ background: `rgba(15,13,12,${0.45 * fill})`, clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${q[0][0]}px ${q[0][1]}px, ${q[3][0]}px ${q[3][1]}px, ${q[2][0]}px ${q[2][1]}px, ${q[1][0]}px ${q[1][1]}px, ${q[0][0]}px ${q[0][1]}px)` }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <polygon points={q.map(p => p.join(',')).join(' ')} fill="none" stroke="#2f9be0" strokeWidth={4} strokeDasharray={per} strokeDashoffset={per * (1 - draw)} />
        {q.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={11 * ease(f, 40 + i * 3, 50 + i * 3)} fill="#2f9be0" stroke="#fff" strokeWidth={3} />)}
      </svg>
      <div style={{ position: 'absolute', left: q[0][0], top: q[0][1] - 52, padding: '6px 14px', borderRadius: 999, background: '#2f9be0', color: '#fff', fontFamily: SANS, fontSize: 22, fontWeight: 600, opacity: ease(f, 50, 62) }}>“painting” · found</div>
    </div>
  )
}
// Her picture, cut to SAM's corners, wiping into the version Muse Image cleaned.
const ImageViz: React.FC = () => {
  const f = useCurrentFrame()
  const H = 690, W = H * 852 / 1000
  const wipe = ease(f, 18, 70)
  const [x0, y0] = PIC.q[0], [x1, y1] = PIC.q[2]
  const fw = W / ((x1 - x0) / PIC.w)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, ...rise(f, 0) }}>
      <div style={{ position: 'relative', width: W, height: H, ...CARD, overflow: 'hidden' }}>
        <Img src={staticFile('app/to-paint.jpg')} style={{ position: 'absolute', width: fw, left: -x0 / PIC.w * fw, top: -y0 / PIC.w * fw, height: fw * PIC.h / PIC.w }} />
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${(1 - wipe) * 100}%)` }}>
          <Img src={staticFile('app/plan.png')} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(1 - wipe) * 100}%`, width: 4, marginLeft: -2, background: '#fff', boxShadow: '0 0 12px rgba(0,0,0,.4)', opacity: wipe > 0 && wipe < 1 ? 1 : 0 }} />
      </div>
      <div style={{ display: 'flex', width: W, justifyContent: 'space-between', fontFamily: SANS, fontSize: 22, color: C.soft }}>
        <span style={{ opacity: 1 - 0.6 * wipe }}>Her picture</span><span style={{ opacity: 0.4 + 0.6 * wipe }}>Cleaned by Muse Image</span>
      </div>
    </div>
  )
}
// The plan's band map, each band lighting with its grams; then the totals.
const BANDS = [
  { name: 'Warm Linen Beige', hex: '#d2bda8', paint: 1040, paste: 2432 }, { name: 'Dusty Rose', hex: '#ab887e', paint: 836, paste: 1954 },
  { name: 'Deep Burgundy Brown', hex: '#391e20', paint: 552, paste: 1291 }, { name: 'Sage Grey', hex: '#a2957d', paint: 273, paste: 638 },
  { name: 'Muted Plum', hex: '#694445', paint: 153, paste: 357 }, { name: 'Olive Taupe', hex: '#968972', paint: 123, paste: 288 },
]
const OursViz: React.FC = () => {
  const f = useCurrentFrame()
  const H = 620, W = H * 852 / 1000
  const g = (x: number) => x >= 1000 ? `${(x / 1000).toFixed(2)} kg` : `${x} g`
  return (
    <div style={{ display: 'flex', gap: 40, alignItems: 'center', ...rise(f, 0) }}>
      <div style={{ position: 'relative', width: W, height: H, ...CARD, overflow: 'hidden', background: '#f3efe8' }}>
        {BANDS.map((b, i) => {
          const a = 8 + i * 9, on = ease(f, a, a + 10)
          return <div key={i} style={{ position: 'absolute', inset: 0, background: b.hex, opacity: on, WebkitMaskImage: `url(${staticFile(`hood/band-${i}.png`)})`, maskImage: `url(${staticFile(`hood/band-${i}.png`)})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' }} />
        })}
      </div>
      <div style={{ width: 470 }}>
        {BANDS.map((b, i) => {
          const a = 8 + i * 9
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0', borderBottom: '1px solid rgba(31,26,23,.08)', ...rise(f, a, 12) }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: b.hex, flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
              <span style={{ flex: 1, fontFamily: SANS, fontSize: 23, color: C.ink }}>{b.name}</span>
              <span style={{ fontFamily: SANS, fontSize: 22, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{g(b.paint)}</span>
            </div>
          )
        })}
        <div style={{ marginTop: 22, fontFamily: SERIF, fontSize: 40, color: C.ink, letterSpacing: -0.6, ...rise(f, 66) }}>2.98 kg <span style={{ fontFamily: SANS, fontSize: 22, color: C.soft }}>paint</span> · 6.96 kg <span style={{ fontFamily: SANS, fontSize: 22, color: C.soft }}>paste</span></div>
        <div style={{ display: 'flex', height: 34, borderRadius: 10, overflow: 'hidden', marginTop: 18, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.1)', ...rise(f, 76) }}>
          {[['#f1ede4', 35], ['#c8952e', 13], ['#8d2558', 3], ['#28398e', 3]].map(([c, p], i) => <div key={i} style={{ width: `${(p as number) / 54 * 100 * ease(f, 80 + i * 5, 96 + i * 5)}%`, background: c as string }} />)}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 20, color: C.soft, marginTop: 8, opacity: ease(f, 92, 104) }}>Warm Linen Beige: 35 paste : 13 Yellow Ochre : 3 Magenta : 3 Ultramarine</div>
      </div>
    </div>
  )
}
const VIZ = [VoiceViz, SparkViz, SamViz, ImageViz, OursViz]

// ─── A and B: one model at a time, its name on the left and its work on the right ──
const Intro: React.FC = () => {
  const f = useCurrentFrame()
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 34, paddingBottom: 120 }}>
      <div style={{ fontFamily: SANS, fontSize: 28, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: C.soft, ...rise(f, 0) }}>Under the hood</div>
      <div style={{ display: 'flex', gap: 22 }}>
        {MODELS.map((m, i) => <div key={m.name} style={{ ...CARD, padding: '22px 30px', fontFamily: SERIF, fontSize: 40, color: C.ink, ...rise(f, 8 + i * 6) }}>{m.name}</div>)}
      </div>
    </AbsoluteFill>
  )
}
const Beat: React.FC<{ i: number; len: number; last: boolean }> = ({ i, len, last }) => {
  const f = useCurrentFrame()
  const m = i < 4 ? MODELS[i] : OURS
  const out = last ? 0 : ease(f, len - 10, len)
  const V = VIZ[i]
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <div style={{ position: 'absolute', left: 150, top: 0, bottom: 120, width: 560, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
        <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 600, letterSpacing: 2.6, textTransform: 'uppercase', color: i < 4 ? C.plum : C.soft, ...rise(f, 0) }}>{i < 4 ? `Meta model ${i + 1} of 4` : 'Our own code'}</div>
        <div style={{ fontFamily: SERIF, fontSize: 76, lineHeight: 1.02, color: C.ink, letterSpacing: -1.6, ...rise(f, 4) }}>{m.name}</div>
        <div style={{ fontFamily: SANS, fontSize: 32, lineHeight: 1.3, color: C.soft, maxWidth: 520, ...rise(f, 10) }}>{m.job}</div>
      </div>
      <div style={{ position: 'absolute', left: 780, right: 150, top: 110, bottom: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Sequence from={6} layout="none"><V /></Sequence>
      </div>
    </AbsoluteFill>
  )
}
const Showcase: React.FC<{ beats: number; len: number }> = ({ beats, len }) => {
  const say = SAY_ALL.slice(0, beats + 1)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Fade len={len} inF={12} outF={12}>
        <Sequence durationInFrames={BEATS[0][0]}><Fade len={BEATS[0][0]} inF={0} outF={8}><Intro /></Fade></Sequence>
        {BEATS.slice(0, beats).map(([a, b], i) => {
          const end = i === beats - 1 ? len : b
          return <Sequence key={i} from={a} durationInFrames={end - a}><Beat i={i} len={end - a} last={i === beats - 1} /></Sequence>
        })}
        <Say lines={say} dark={false} bottom={40} />
      </Fade>
    </AbsoluteFill>
  )
}
export const HOOD_A_LEN = 520, HOOD_B_LEN = 688, HOOD_C_LEN = 688
export const HoodWork: React.FC = () => <Showcase beats={4} len={HOOD_A_LEN} />
export const HoodMeasured: React.FC = () => <Showcase beats={5} len={HOOD_B_LEN} />

// ─── C: the flow, from her inputs through the models to the five stops ─────
const IN = [{ k: 'voice', label: 'Her words' }, { k: 'wall', label: 'Her wall' }, { k: 'pic', label: 'The picture' }]
const OUT = ['Idea', 'See it', 'Colors', 'Steps', 'Check-ins']
const IX = 150, IW = 330, MX = 780, MW = 380, OX = 1440, OW = 330
const iy = (i: number) => 230 + i * 210, my = (i: number) => 175 + i * 165, oy = (i: number) => 185 + i * 130
// Which links light on each beat: [from, to] as 'i0'..'i2' (inputs), 'm0'..'m3' (models), 'o0'..'o4' (stops).
const LINKS: [string, string][][] = [
  [['i0', 'm0'], ['m0', 'o0']],
  [['m0', 'm1'], ['i1', 'm1'], ['m1', 'o0'], ['m1', 'o2'], ['m1', 'o3'], ['m1', 'o4']],
  [['i2', 'm2'], ['m2', 'o1'], ['m2', 'o4']],
  [['i2', 'm3'], ['m2', 'm3'], ['m3', 'o1']],
  [],
]
const pt = (id: string, side: 'out' | 'in'): [number, number] => {
  const n = Number(id.slice(1))
  if (id[0] === 'i') return [IX + IW, iy(n) + 75]
  if (id[0] === 'm') return side === 'out' ? [MX + MW, my(n) + 62] : [MX, my(n) + 62]
  return [OX, oy(n) + 40]
}
export const HoodFlow: React.FC = () => {
  const f = useCurrentFrame()
  const beat = BEATS.findIndex(([a, b]) => f >= a && f < b)
  const lit = (bi: number) => f >= BEATS[bi][0]
  const ours = ease(f, BEATS[4][0], BEATS[4][0] + 20)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Fade len={HOOD_C_LEN} inF={12} outF={12}>
        <div style={{ position: 'absolute', top: 80, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 26, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: C.soft, opacity: ease(f, 0, 14) }}>Under the hood · four Meta models</div>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {LINKS.map((ls, bi) => ls.map(([a, b], j) => {
            const [x1, y1] = pt(a, 'out'), [x2, y2] = a[0] === 'm' && b[0] === 'm' ? [MX + MW - 40, my(Number(b.slice(1)))] : pt(b, 'in')
            const vertical = a[0] === 'm' && b[0] === 'm'
            const d = vertical ? `M ${MX + MW - 40} ${my(Number(a.slice(1))) + 124} L ${x2} ${y2}` : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
            const on = ease(f, BEATS[bi][0] + 4 + j * 4, BEATS[bi][0] + 24 + j * 4)
            const now = beat === bi
            return (
              <g key={`${bi}-${j}`}>
                <path d={d} fill="none" stroke="rgba(31,26,23,.1)" strokeWidth={3} />
                <path d={d} fill="none" stroke={C.plum} strokeOpacity={now ? 1 : 0.45} strokeWidth={now ? 4.5 : 3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - on} />
              </g>
            )
          }))}
        </svg>
        {/* Her inputs */}
        {IN.map((n, i) => {
          const on = (i === 0 && lit(0)) || (i === 1 && lit(1)) || (i === 2 && lit(2))
          return (
            <div key={n.k} style={{ position: 'absolute', left: IX, top: iy(i), width: IW, height: 150, ...CARD, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px',
              opacity: ease(f, 10 + i * 6, 24 + i * 6) * (on ? 1 : 0.55), outline: on ? `3px solid ${C.plum}` : 'none' }}>
              {n.k === 'voice'
                ? <div style={{ width: 100, height: 100, borderRadius: 100, background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  </div>
                : <Img src={staticFile(n.k === 'wall' ? 'app/wall.jpg' : 'app/to-paint.jpg')} style={{ width: 92, height: 120, objectFit: 'cover', borderRadius: 10, flex: 'none' }} />}
              <span style={{ fontFamily: SANS, fontSize: 30, fontWeight: 600, color: C.ink }}>{n.label}</span>
            </div>
          )
        })}
        {/* The models */}
        {MODELS.map((m, i) => {
          const now = beat === i, on = lit(i)
          return (
            <div key={m.name} style={{ position: 'absolute', left: MX, top: my(i), width: MW, height: 124, ...CARD, padding: '20px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
              background: now ? C.ink : '#fff', opacity: ease(f, 16 + i * 6, 30 + i * 6) * (on ? 1 : 0.5), transform: `scale(${now ? 1.04 : 1})` }}>
              <span style={{ fontFamily: SERIF, fontSize: 36, color: now ? '#fff' : C.ink }}>{m.name}</span>
              <span style={{ fontFamily: SANS, fontSize: 20, color: now ? 'rgba(255,255,255,.75)' : C.soft, opacity: on ? 1 : 0 }}>{m.job}</span>
            </div>
          )
        })}
        {/* What Impasto measures itself */}
        <div style={{ position: 'absolute', left: MX, top: my(3) + 160, width: MW, padding: '14px 22px', borderRadius: 16, border: `2px dashed ${C.plum}`, fontFamily: SANS, fontSize: 22, color: C.ink, opacity: ours }}>
          <b>Impasto itself</b>: areas into grams, colors into mixes
        </div>
        {/* The five stops */}
        {OUT.map((o, i) => {
          const on = LINKS.slice(0, Math.max(0, beat) + 1).some(ls => ls.some(([, b]) => b === `o${i}`)) || (ours > 0.5 && (i === 2 || i === 4))
          return (
            <div key={o} style={{ position: 'absolute', left: OX, top: oy(i), width: OW, height: 80, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 14, padding: '0 28px',
              background: on ? C.ink : 'transparent', border: `2px solid ${on ? C.ink : 'rgba(31,26,23,.18)'}`, color: on ? '#fff' : C.soft, fontFamily: SANS, fontSize: 30, fontWeight: 600, opacity: ease(f, 22 + i * 5, 36 + i * 5) }}>
              <span style={{ width: 12, height: 12, borderRadius: 12, background: on ? '#fff' : 'rgba(31,26,23,.25)' }} />{o}
              {ours > 0.5 && (i === 2 || i === 4) && <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 500, opacity: ours }}>{i === 2 ? 'grams, mixes' : 'ΔE'}</span>}
            </div>
          )
        })}
        <Say lines={SAY_ALL} dark={false} bottom={40} />
      </Fade>
    </AbsoluteFill>
  )
}
