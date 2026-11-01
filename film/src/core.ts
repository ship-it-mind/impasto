import reactive from './reactive.json'

export const W = 1920, H = 1080
export const PAPER = '#f4efe6', INK = '#0e0c0b', CORAL = '#e0704f', OCHRE = '#e3a93b', PLUM = '#5b2a4e', SAGE = '#8fa78c', BLUE = '#2f4a8a', PINK = '#efb7a6'
export const PALETTE = [CORAL, PAPER, OCHRE, PLUM, SAGE, INK, BLUE, PINK]

export const BPS = 2
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const range = (x: number, a: number, b: number) => clamp((x - a) / (b - a))
export const frac = (x: number) => x - Math.floor(x)
export const smooth = (t: number) => t * t * (3 - 2 * t)
export const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const expoIn = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * (t - 1)))
export const expoInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2)
export const cubicOut = (t: number) => 1 - (1 - t) ** 3
export const quintInOut = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2)
export const backOut = (t: number, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2
export const backIn = (t: number, s = 1.70158) => (s + 1) * t ** 3 - s * t * t
export const elasticOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1)
// A damped spring from 0 to 1.
export const spring = (t: number, freq = 3.2, damp = 5.5) => (t <= 0 ? 0 : 1 - Math.exp(-damp * t) * Math.cos(2 * Math.PI * freq * t))

export const hash = (n: number) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453)
export const hash2 = (a: number, b: number) => frac(Math.sin(a * 127.1 + b * 269.5 + 11.3) * 43758.5453)

// Value noise with smooth interpolation, enough for flow fields.
export function noise2(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi)
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v)
}

const R = reactive as unknown as Record<string, number[]> & { rate: number; wave: string; waveRate: number }
const look = (a: number[], b: number) => a[clamp(Math.floor(b * R.rate), 0, a.length - 1)] ?? 0
export const kick = (b: number) => look(R.kick, b)
export const clap = (b: number) => look(R.clap, b)
export const hat = (b: number) => look(R.hat, b)
export const stab = (b: number) => look(R.stab, b)
export const arp = (b: number) => look(R.arp, b)
export const bass = (b: number) => look(R.bass, b)
export const hit = (b: number) => look(R.hit, b)

let waveCache: Int8Array | null = null
export function wave(b: number) {
  if (!waveCache) {
    const s = atob(R.wave)
    waveCache = new Int8Array(s.length)
    for (let i = 0; i < s.length; i++) waveCache[i] = s.charCodeAt(i) << 24 >> 24
  }
  const i = Math.floor(b * 0.5 * R.waveRate)
  return (waveCache[clamp(i, 0, waveCache.length - 1)] ?? 0) / 127
}

export const SANS = '"Archivo Variable", sans-serif'
export const SERIF = '"Fraunces Variable", serif'
export const MONO = '"JetBrains Mono Variable", monospace'
