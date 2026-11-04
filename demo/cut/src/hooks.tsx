// Four hooks to choose from, each 9 s. Rendered on their own: npm run hooks.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AbsoluteFill, Img, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { C, SANS, SERIF, Wordmark, ease } from './kit'

export const HOOK_LEN = 270

type Sketch = { w: number; h: number; order: number[]; bands: { name: string; hex: string; fills: string[]; lines: { d: string; len: number }[] }[] }

function useJson<T>(file: string): T | null {
  const [data, setData] = useState<T | null>(null)
  const [handle] = useState(() => delayRender(file))
  useEffect(() => { fetch(staticFile(file)).then(r => r.json()).then(d => { setData(d); continueRender(handle) }) }, [file, handle])
  return data
}

// A line of serif type that rises in.
const Line: React.FC<{ at: number; out?: number; size?: number; color?: string; children: React.ReactNode }> = ({ at, out = 9999, size = 76, color = C.ink, children }) => {
  const f = useCurrentFrame()
  return (
    <div style={{ opacity: Math.min(ease(f, at, at + 16), 1 - ease(f, out, out + 12)), transform: `translateY(${(1 - ease(f, at, at + 22)) * 24}px)`,
      fontFamily: SERIF, fontSize: size, lineHeight: 1.08, letterSpacing: -1.5, color, textWrap: 'balance' }}>{children}</div>
  )
}

// ─── 1. The idea becomes the canvas ─────────────────────────────────────────
// The plan's own pencil lines draw themselves, the bands fill in the order she paints them,
// then the plan's painting, then her real canvas in the same frame.
export const HookSketch: React.FC = () => {
  const f = useCurrentFrame()
  const s = useJson<Sketch>('hook/sketch.json')
  if (!s) return null
  const H = 880, W = H * s.w / s.h, X = 1040, Y = 100
  const slot = (k: number) => s.order.indexOf(k)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ opacity: 1 - ease(f, 214, 226) }}>
        <div style={{ position: 'absolute', left: 140, top: 0, bottom: 0, width: 820, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
          <Line at={8}>Every painting starts in your head.</Line>
          <Line at={118} color={C.plum}>Getting it onto the canvas is the hard part.</Line>
        </div>
        <div style={{ position: 'absolute', left: X, top: Y, width: W, height: H, borderRadius: 6, overflow: 'hidden', background: '#f4f0e7',
          boxShadow: `0 ${40 * ease(f, 0, 30)}px 90px -36px rgba(60,40,30,.45), 0 0 0 1px rgba(60,40,30,.07)`,
          transform: `scale(${0.97 + 0.03 * ease(f, 0, 40)})` }}>
          <svg viewBox={`0 0 ${s.w} ${s.h}`} width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              {s.bands.map((_, k) => {
                const a = 84 + slot(k) * 11, p = ease(f, a, a + 20)
                // A knife pass: a wide strip sweeping across the band at an angle.
                return <clipPath key={k} id={`wipe${k}`}><rect x={-3600 + p * 3400} y={-800} width={3000} height={2800} transform={`rotate(-32 ${s.w / 2} ${s.h / 2})`} /></clipPath>
              })}
            </defs>
            {s.bands.map((b, k) => (
              <g key={k} clipPath={`url(#wipe${k})`}>{b.fills.map((d, i) => <path key={i} d={d} fill={b.hex} />)}</g>
            ))}
            {s.bands.map((b, k) => b.lines.map((l, i) => {
              const a = 6 + slot(k) * 11, p = ease(f, a, a + 40)
              return <path key={`${k}-${i}`} d={l.d} fill="none" stroke="#6f665d" strokeWidth={2.4} strokeLinecap="round"
                strokeDasharray={l.len} strokeDashoffset={l.len * (1 - p)} opacity={0.85 * (1 - ease(f, 150, 170))} />
            }))}
          </svg>
          <Img src={staticFile('hook/concept.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: ease(f, 148, 172) }} />
          <Img src={staticFile('hook/finished-straight.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: ease(f, 178, 196) }} />
        </div>
        {[['The plan', 148, 176], ['Her canvas', 184, 9999]].map(([t, a, b]) => (
          <div key={t as string} style={{ position: 'absolute', left: X, top: Y + H + 16, fontFamily: SANS, fontSize: 24, fontWeight: 600, color: C.soft, letterSpacing: 0.3,
            opacity: Math.min(ease(f, a as number, (a as number) + 10), 1 - ease(f, b as number, (b as number) + 8)) }}>{t}</div>
        ))}
      </AbsoluteFill>
      <Sequence from={222}><Wordmark len={48} /></Sequence>
    </AbsoluteFill>
  )
}

// ─── 2. The painting builds itself ──────────────────────────────────────────
// Her stage photos dealt like prints, faster and faster, all turned the same way up.
const DEAL = 13
const GAPS = [16, 14, 12, 11, 10, 9, 8, 7, 6, 6, 6, 5]
const LAND = GAPS.reduce((t, g) => [...t, t[t.length - 1] + g], [26])
const tilt = (i: number) => [-3.2, 2.4, -1.6, 3.4, -2.6, 1.8, -3.6, 2.8, -1.2, 3.0, -2.2, 1.4, 0][i]
const shift = (i: number) => [[-14, 6], [12, -8], [-8, -12], [16, 10], [-18, 4], [10, 12], [-6, -10], [14, -4], [-12, 8], [8, 6], [-10, -6], [6, 10], [0, 0]][i]

export const HookDeal: React.FC = () => {
  const f = useCurrentFrame()
  const last = LAND[DEAL - 1]
  const settle = ease(f, last + 6, last + 40)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ opacity: 1 - ease(f, 214, 226) }}>
        <div style={{ position: 'absolute', left: 140, top: 0, bottom: 0, width: 760, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
          <Line at={8}>Everyone thinks the hard part is the painting.</Line>
          <Line at={last + 22} color={C.plum} size={92}>It's everything before it.</Line>
        </div>
        {Array.from({ length: DEAL }, (_, i) => {
          const t = LAND[i]
          if (f < t - 8 || (i < DEAL - 4 && f > LAND[i + 4] + 4)) return null
          const k = ease(f, t - 8, t)
          const final = i === DEAL - 1
          const [dx, dy] = shift(i)
          const rot = tilt(i) * (final ? 1 - settle : 1) + (1 - k) * (i % 2 ? 6 : -6)
          const z = (1.12 - 0.12 * k) * (final ? 1 + 0.1 * settle : 1)
          return (
            <div key={i} style={{ position: 'absolute', left: 1330 - 330 + dx, top: 540 - 420 + dy - (1 - k) * 60, width: 660, height: 840, padding: 16, background: '#fbfaf7', borderRadius: 4,
              boxShadow: '0 30px 60px -28px rgba(40,25,15,.55), 0 1px 2px rgba(0,0,0,.12)', opacity: k, transform: `rotate(${rot}deg) scale(${z})` }}>
              <Img src={staticFile(`hook/deal-${String(i).padStart(2, '0')}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )
        })}
      </AbsoluteFill>
      <Sequence from={222}><Wordmark len={48} /></Sequence>
    </AbsoluteFill>
  )
}

// ─── 3. Words laid on with a knife ──────────────────────────────────────────
// The type is a height field in thick paint: each row revealed by one knife pass, lit from the top left.
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform sampler2D u_blur; uniform vec2 u_res;
uniform vec4 u_edge; uniform vec4 u_rows; uniform float u_fade;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= .5; } return s; }
float edgeAt(float y){ return y < u_rows.x ? u_edge.x : y < u_rows.y ? u_edge.y : y < u_rows.z ? u_edge.z : u_edge.w; }
// How much paint is here, and how high it stands.
vec2 paint(vec2 px){
  vec2 uv = px / u_res;
  float a = texture(u_blur, uv).a, s = texture(u_tex, uv).a;
  float rag = (fbm(vec2(px.y * .05, px.x * .002)) - .5) * 46.;
  float front = edgeAt(px.y) + rag;
  float shown = smoothstep(front + 2., front - 6., px.x);
  float cover = smoothstep(.32, .52, s * .8 + a * .45 + (fbm(px * .03) - .5) * .24) * shown;
  vec2 q = vec2(px.x + px.y * .35, px.y);
  float streak = fbm(vec2(q.x * .0018, q.y * .035)) * .7 + fbm(vec2(q.x * .006, q.y * .09)) * .3;
  float bead = exp(-pow((px.x - front + 10.) / 16., 2.)) * a * .7;
  float rim = smoothstep(.15, .45, a) * (1. - smoothstep(.5, .95, a)) * .45;
  float h = smoothstep(.15, .85, a) * .5 + s * .15 + rim + streak * .7 * a + bead;
  return vec2(cover, h * cover);
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 p = paint(px);
  float hx = paint(px + vec2(1.5, 0.)).y - paint(px - vec2(1.5, 0.)).y;
  float hy = paint(px + vec2(0., 1.5)).y - paint(px - vec2(0., 1.5)).y;
  vec3 n = normalize(vec3(-hx * 6., -hy * 6., 1.));
  vec3 L = normalize(vec3(-.55, -.6, .6));
  float dif = clamp(dot(n, L), 0., 1.);
  float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.), 10.) * .14;
  vec2 qq = vec2(px.x + px.y * .35, px.y);
  vec3 col = texture(u_blur, px / u_res).rgb / max(texture(u_blur, px / u_res).a, .05);
  col *= .9 + .2 * fbm(vec2(qq.x * .002, qq.y * .04));
  vec3 paintC = col * (.62 + .5 * dif) + spec;
  // Bare canvas: the weave, and the paint's shadow falling down and to the right.
  vec3 paper = vec3(.953, .933, .906) + (sin(px.x * 1.7) * sin(px.y * 1.7)) * .006;
  float sh = texture(u_blur, (px - vec2(9., 11.)) / u_res).a * smoothstep(edgeAt(px.y) + 20., edgeAt(px.y) - 20., px.x) * .2;
  paper *= 1. - sh;
  o = vec4(mix(paper, paintC, p.x * u_fade) * mix(1., 1., u_fade), 1.);
}`
const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`

type Row = { y: number; parts: [string, string][] }

const KnifeText: React.FC<{ rows: Row[]; size: number; starts: number[]; dur?: number; fadeAt?: number }> = ({ rows, size, starts, dur = 34, fadeAt = 9999 }) => {
  const f = useCurrentFrame()
  const ref = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [handle] = useState(() => delayRender('knife'))
  const glRef = useRef<{ gl: WebGL2RenderingContext; prog: WebGLProgram; spans: [number, number][] } | null>(null)
  const font = `800 ${size}px 'Fraunces Variable'`

  useEffect(() => {
    document.fonts.load(font).then(() => {
      const W = 1920, H = 1080
      const t = document.createElement('canvas'); t.width = W; t.height = H
      const ctx = t.getContext('2d')!
      ctx.font = font; ctx.textBaseline = 'middle'
      const spans: [number, number][] = []
      for (const r of rows) {
        const total = r.parts.reduce((w, [s]) => w + ctx.measureText(s).width, 0)
        let x = (W - total) / 2
        spans.push([x, x + total])
        for (const [s, c] of r.parts) { ctx.fillStyle = c; ctx.fillText(s, x, r.y); x += ctx.measureText(s).width }
      }
      const b = document.createElement('canvas'); b.width = W; b.height = H
      const bctx = b.getContext('2d')!
      bctx.filter = 'blur(4px)'; bctx.drawImage(t, 0, 0)
      const gl = ref.current!.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })!
      const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!); return s }
      const prog = gl.createProgram()!
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
      gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)!)
      gl.useProgram(prog)
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      ;[t, b].forEach((img, i) => {
        const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      })
      gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'u_blur'), 1)
      gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), W, H)
      glRef.current = { gl, prog, spans }
      setReady(true); continueRender(handle)
    })
  }, [])

  useLayoutEffect(() => {
    const g = glRef.current
    if (!g) return
    const { gl, prog, spans } = g
    const edges = [0, 1, 2, 3].map(i => {
      const sp = spans[Math.min(i, spans.length - 1)]
      if (i >= rows.length) return -1e4
      return interpolate(ease(f, starts[i], starts[i] + dur), [0, 1], [sp[0] - 80, sp[1] + 160])
    })
    const ys = rows.map(r => r.y)
    const mid = [0, 1, 2].map(i => (i + 1 < ys.length ? (ys[i] + ys[i + 1]) / 2 : 1e5))
    gl.uniform4f(gl.getUniformLocation(prog, 'u_edge'), edges[0], edges[1], edges[2], edges[3])
    gl.uniform4f(gl.getUniformLocation(prog, 'u_rows'), mid[0], mid[1], mid[2], 1e5)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_fade'), 1 - ease(f, fadeAt, fadeAt + 14))
    gl.viewport(0, 0, 1920, 1080)
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish()
  }, [f, ready])

  return <canvas ref={ref} width={1920} height={1080} style={{ position: 'absolute', inset: 0, width: 1920, height: 1080 }} />
}

const BURG = '#4a272b', PLUM = '#6b4547', ROSE = '#a87f76'
export const HookKnife: React.FC = () => (
  <AbsoluteFill style={{ background: '#f3eee7' }}>
    <Sequence durationInFrames={214}>
      <KnifeText size={96} fadeAt={196} starts={[10, 40, 104, 134]} rows={[
        { y: 320, parts: [['Everyone thinks the hard part', BURG]] },
        { y: 430, parts: [['of painting is the painting.', BURG]] },
        { y: 640, parts: [["It's actually turning the idea in", PLUM]] },
        { y: 750, parts: [['your head into ', PLUM], ['something real.', ROSE]] },
      ]} />
    </Sequence>
    <Sequence from={210}>
      <KnifeText size={210} starts={[4]} dur={30} rows={[{ y: 540, parts: [['Impasto', BURG]] }]} />
    </Sequence>
  </AbsoluteFill>
)

// ─── 4. All the guessing ────────────────────────────────────────────────────
// What goes into this one painting piles up into noise, then cuts to one quiet line.
const BANDS = [
  ['Warm Linen Beige', '#d2bda8', '13 Yellow Ochre : 3 Ultramarine : 3 Magenta : 35 paste', '1.04 kg'],
  ['Dusty Rose', '#ab887e', '7 Mars Black : 3 Cadmium Red : 19 paste', '836 g'],
  ['Deep Burgundy Brown', '#391e20', '2 Quinacridone Magenta : 1 Ultramarine Blue : 6 paste', '552 g'],
  ['Sage Grey', '#a2957d', '8 Mars Black : 3 Burnt Sienna : 1 Sap Green : 22 paste', '273 g'],
  ['Muted Plum', '#694445', '1 Mars Black : 1 Quinacridone Magenta : 4 paste', '153 g'],
  ['Olive Taupe', '#968972', '8 Mars Black : 3 Burnt Sienna : 20 paste', '123 g'],
]
const TUBES = [['Mars Black', 779], ['Yellow Ochre', 595], ['Quinacridone Magenta', 489], ['Ultramarine Blue', 339], ['Cadmium Red', 221], ['Burnt Sienna', 98], ['Sap Green', 19]] as const
const DE = ['ΔE 25.2', 'ΔE 10.9', 'ΔE 10.1', 'ΔE 5.8', 'ΔE 1.7', 'ΔE 40.9']

const rnd = (i: number) => { const x = Math.sin(i * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x) }

type Frag = { at: number; x: number; y: number; r: number; node: (f: number) => React.ReactNode }
const chip = (bg: string, fg: string, children: React.ReactNode, size = 26) => (
  <div style={{ background: bg, color: fg, borderRadius: 12, padding: '10px 16px', fontFamily: SANS, fontSize: size, fontWeight: 550, whiteSpace: 'nowrap', boxShadow: '0 14px 28px -16px rgba(0,0,0,.45)' }}>{children}</div>
)

export const HookNoise: React.FC = () => {
  const f = useCurrentFrame()
  const CUT = 166
  const frags = useMemo(() => {
    const out: Frag[] = []
    let i = 0
    // Places that keep clear of the type on the left.
    const spot = (k: number) => ({ x: 860 + rnd(k) * 960, y: 70 + rnd(k + 50) * 900, r: (rnd(k + 99) - 0.5) * 10 })
    BANDS.forEach(([name, hex], b) => out.push({ at: 12 + b * 5, ...spot(i++), node: () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 14, padding: '10px 18px 10px 10px', boxShadow: '0 14px 28px -16px rgba(0,0,0,.45)', fontFamily: SANS, fontSize: 26, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 10, background: hex }} />{name}
      </div>) }))
    TUBES.forEach(([t, ml], k) => out.push({ at: 46 + k * 4, ...spot(i++), node: g => chip(C.ink, '#fff', <>{t} · {Math.round(ml * ease(g, 0, 30))} ml</>) }))
    BANDS.forEach(([, hex, ratio], b) => out.push({ at: 70 + b * 6, ...spot(i++), node: () => chip('#fff', C.ink, <span><span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: hex, marginRight: 10, verticalAlign: -1 }} />{ratio}</span>, 24) }))
    DE.forEach((d, k) => out.push({ at: 92 + k * 5, ...spot(i++), node: () => chip('#f2d9d2', '#7a2f28', d, 30) }))
    BANDS.forEach(([, hex, , g], b) => out.push({ at: 108 + b * 4, ...spot(i++), node: () => chip(hex, b === 0 || b === 3 || b === 1 || b === 5 ? C.ink : '#fff', g, 34) }))
    out.push({ at: 112, ...spot(i++), node: g => chip(C.plum, '#fff', <>{(2975.7 * ease(g, 0, 40)).toFixed(1)} g of paint</>, 36) })
    out.push({ at: 118, ...spot(i++), node: g => chip(C.plum, '#fff', <>{(6959 * ease(g, 0, 40)).toFixed(1)} g of paste</>, 36) })
    out.push({ at: 124, ...spot(i++), node: g => chip('#fff', C.ink, <>{Math.round(15525 * ease(g, 0, 30)).toLocaleString('en')} cm² to cover</>, 30) })
    // Then everything again, louder.
    for (let k = 0; k < 18; k++) { const src = out[k % 30]; out.push({ ...src, at: 132 + k * 1.6, ...spot(i++) }) }
    return out
  }, [])
  const shake = f > 130 && f < CUT ? (rnd(f) - 0.5) * 8 * ease(f, 130, CUT) : 0
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {f < CUT && (
        <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
          {frags.map((fr, k) => {
            if (f < fr.at) return null
            const g = f - fr.at, k2 = ease(f, fr.at, fr.at + 10)
            return (
              <div key={k} style={{ position: 'absolute', left: fr.x, top: fr.y, transform: `translate(-50%,-50%) rotate(${fr.r}deg) scale(${0.85 + 0.15 * k2}) translateY(${-g * 0.25}px)`, opacity: k2 }}>
                {fr.node(g)}
              </div>
            )
          })}
          <div style={{ position: 'absolute', left: 120, top: 0, bottom: 0, width: 760, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
            {[['Six colors.', 10], ['Seven tubes.', 46], ['Almost ten kilos', 84], ['of paint and paste.', 92]].map(([t, a]) => (
              <div key={t as string} style={{ opacity: ease(f, a as number, (a as number) + 10), transform: `translateY(${(1 - ease(f, a as number, (a as number) + 16)) * 20}px)` }}>
                <span style={{ fontFamily: SERIF, fontSize: 88, lineHeight: 1.05, letterSpacing: -1.5, color: C.ink, background: C.paper, boxShadow: `0 0 0 10px ${C.paper}` }}>{t}</span>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      )}
      {f >= CUT && (
        <AbsoluteFill style={{ background: C.black, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ fontFamily: SERIF, fontSize: 92, color: '#fff', letterSpacing: -1.5, opacity: ease(f, CUT + 8, CUT + 22) * (1 - ease(f, 222, 232)) }}>And no way to know if it'll look right.</div>
        </AbsoluteFill>
      )}
      <Sequence from={228}><Wordmark len={42} dark /></Sequence>
    </AbsoluteFill>
  )
}
