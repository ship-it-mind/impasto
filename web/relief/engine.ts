// Impasto relief engine: paints palette-knife strokes into a color map and a
// height map, then relights the height map under one light. A Scene says what
// color, stroke angle and stroke size belong at each point; the engine does the
// painting. No DOM, so it runs in the browser and under Node alike.

export type RGB = [number, number, number];

// c: paint color, a: stroke direction (radians), s: stroke size (1 = normal,
// smaller means shorter strokes laid more densely), t: paste thickness (1 = normal).
export interface Sample { c: RGB; a: number; s: number; t?: number }
export interface Scene { at(x: number, y: number): Sample }

export interface Noise { n2(x: number, y: number): number; fbm(x: number, y: number, octaves?: number): number }

export interface PaintOptions {
  seed: number;
  brush: number;    // stroke width in px at normal size
  thick: number;    // overall paste thickness
  density: number;  // stroke coverage
  swirl: number;    // how far strokes wander from the scene's direction
}

export const DEFAULTS: Omit<PaintOptions, 'seed'> = { brush: 13, thick: 1, density: 1, swirl: 0.35 };

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed: number): Noise {
  const r = mulberry32(seed * 2654435761 >>> 0);
  const perm: number[] = []; for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const p = new Uint16Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = new Float32Array(256); for (let i = 0; i < 256; i++) g[i] = r();
  function n2(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = g[p[p[X] + Y] & 255], b = g[p[p[X + 1] + Y] & 255];
    const c = g[p[p[X] + Y + 1] & 255], d = g[p[p[X + 1] + Y + 1] & 255];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x: number, y: number, o = 4): number {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let i = 0; i < o; i++) { s += a * n2(x * f, y * f); t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  }
  return { n2, fbm };
}

export const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x: number, a = 0, b = 1): number => x < a ? a : x > b ? b : x;
export const sstep = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const PI = Math.PI;

// The canvas being painted: color (C), height (Hm) and scratch buffers.
export class Surface {
  readonly w: number; readonly h: number; readonly n: number;
  readonly C: Float32Array; readonly Hm: Float32Array;
  readonly Bs: Float32Array; readonly Hs: Float32Array; readonly Tmp: Float32Array;
  readonly stamp: Int32Array;
  strokeId = 0;
  constructor(w: number, h: number) {
    this.w = w; this.h = h; this.n = w * h;
    this.C = new Float32Array(this.n * 3);
    this.Hm = new Float32Array(this.n);
    this.Bs = new Float32Array(this.n);   // per-stroke base height
    this.Hs = new Float32Array(this.n);   // smoothed height for lighting
    this.Tmp = new Float32Array(this.n);
    this.stamp = new Int32Array(this.n);
  }
}

const CANVAS_WHITE: RGB = [243, 239, 230];
function blankCanvas(sf: Surface): void {
  for (let y = 0, i = 0; y < sf.h; y++) for (let x = 0; x < sf.w; x++, i++) {
    sf.C[i * 3] = CANVAS_WHITE[0]; sf.C[i * 3 + 1] = CANVAS_WHITE[1]; sf.C[i * 3 + 2] = CANVAS_WHITE[2];
    sf.Hm[i] = (((x >> 1) + (y >> 1)) & 1) ? 0.22 : 0.0;  // canvas weave
  }
}

// Toned ground: the scene's colors, blocky and pulled toward a warm brown.
function applyWash(sf: Surface, scene: Scene): void {
  const { w: W, h: H } = sf;
  const ground = hex('#8f6040'), G = 10, gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1;
  const grid = new Float32Array(gw * gh * 3);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const c = mix(scene.at(Math.min(W - 1, gx * G), Math.min(H - 1, gy * G)).c, ground, 0.35);
    const k = (gy * gw + gx) * 3; grid[k] = c[0]; grid[k + 1] = c[1]; grid[k + 2] = c[2];
  }
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const k = (((y / G) | 0) * gw + ((x / G) | 0)) * 3;
    sf.C[i * 3] = grid[k]; sf.C[i * 3 + 1] = grid[k + 1]; sf.C[i * 3 + 2] = grid[k + 2];
  }
}

// Palette knife: flat slabs of paint with sharp edges and a ridge where the blade lifts.
export const KNIFE = {
  wMul: 1.6, lenMul: 0.75, cov: 0.9, nbDiv: 8, bVar: 0.03, ridge: 0.95, dome: 0.04, ragged: 0.02,
  dryStart: 9, dryBase: 0, head: 0, endRidge: 1.1, taper: 0, straight: 1, pick0: 0.1, pick1: 0.55, thick: 1.25,
};
type StrokeStyle = typeof KNIFE;

function stroke(
  sf: Surface, scene: Scene, x0: number, y0: number, smp: Sample, w: number, L: number,
  thick: number, swirl: number, seed: number, tz: Noise, st: StrokeStyle,
): void {
  const { w: W, h: H, C, Hm, Bs, stamp } = sf;
  const sid = ++sf.strokeId;
  const rng = mulberry32(seed);
  let c = smp.c;
  const j = (rng() - 0.5) * 26;
  c = [c[0] + j + (rng() - 0.5) * 14, c[1] + j + (rng() - 0.5) * 14, c[2] + j + (rng() - 0.5) * 14];
  const i0 = ((y0 | 0) * W + (x0 | 0)) * 3;
  c = mix(c, [C[i0], C[i0 + 1], C[i0 + 2]], 0.08);
  c = [clamp(c[0], 0, 230), clamp(c[1], 0, 230), clamp(c[2], 0, 230)]; // headroom for the blade tint (x1.1)

  const step = Math.max(1.5, w * 0.3);
  const n = Math.max(2, Math.ceil(L / step));
  const px = new Float32Array(n + 1), py = new Float32Array(n + 1);
  const turb = (x: number, y: number) => (tz.n2(x * 0.006, y * 0.006) - 0.5) * swirl * 5;
  const a = smp.a + turb(x0, y0) + (rng() - 0.5) * 0.35;
  let dx = Math.cos(a), dy = Math.sin(a);
  if (rng() < 0.5) { dx = -dx; dy = -dy; }
  let x = x0, y = y0; px[0] = x; py[0] = y;
  for (let i = 1; i <= n; i++) {
    const q = i === 1 ? smp : scene.at(clamp(x, 0, W - 1), clamp(y, 0, H - 1));
    const ta = q.a + turb(x, y);
    let tx = Math.cos(ta), ty = Math.sin(ta);
    if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }
    const f = st.straight ? 0.06 : 0.4;
    dx = dx * (1 - f) + tx * f; dy = dy * (1 - f) + ty * f;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    x += dx * step; y += dy * step; px[i] = x; py[i] = y;
  }

  const nb = Math.max(3, Math.round(w / st.nbDiv));
  const bh = new Float32Array(nb), bt = new Float32Array(nb), br = new Float32Array(nb);
  for (let b = 0; b < nb; b++) { bh[b] = 1 + (rng() - 0.5) * 2 * st.bVar; bt[b] = 0.9 + rng() * 0.2; br[b] = rng(); }
  const load = 0.75 + rng() * 0.5;
  let total = 0; for (let i = 0; i < n; i++) total += Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i]);
  total = total || 1;
  const half = w / 2, vStep = Math.min(0.45 / half, 0.5), head = w * 0.6;
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const ax = px[i], ay = py[i];
    const sl = Math.hypot(px[i + 1] - ax, py[i + 1] - ay) || 1e-6;
    const tx = (px[i + 1] - ax) / sl, ty = (py[i + 1] - ay) / sl, nx = -ty, ny = tx;
    for (let t = 0; t < sl; t += 0.55) {
      const cx = ax + tx * t, cy = ay + ty * t, d = dist + t, u = d / total;
      const hd = Math.min(1, d / half); let lv = Math.sqrt(1 - (1 - hd) * (1 - hd));
      const rd = Math.min(1, (total - d) / half); lv = Math.min(lv, Math.sqrt(1 - (1 - rd) * (1 - rd)));
      if (st.taper) lv = Math.min(lv, Math.pow(Math.sin(PI * clamp(u, 0.02, 0.98)), 0.5));
      const profU = load * (1.12 - 0.5 * u) + (d < head ? st.head * (1 - d / head) : 0) + (st.endRidge ? st.endRidge * sstep(0.82, 0.97, u) : 0);
      const m = st.pick0 + st.pick1 * u * u;
      for (let v = -lv; v <= lv; v += vStep) {
        const b = Math.min(nb - 1, ((v + 1) * 0.5 * nb) | 0);
        const av = v < 0 ? -v : v;
        if (av > 1 - st.ragged * (1 - br[b])) continue;
        if (br[b] < st.dryBase || (u > st.dryStart && br[b] < (u - st.dryStart) * 2.2)) continue;
        const X = (cx + nx * v * half) | 0, Y = (cy + ny * v * half) | 0;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const idx = Y * W + X;
        const e = av - (1 - st.ragged - 0.02);
        const prof = (1 - st.dome * v * v) + st.ridge * Math.exp(-(e * e) / 0.006);
        const hgt = thick * profU * prof * bh[b];
        if (stamp[idx] !== sid) {
          stamp[idx] = sid; Bs[idx] = Hm[idx] * 0.4;
          const k3 = idx * 3, bb = bt[b];
          C[k3] = c[0] * bb * (1 - m) + C[k3] * m;
          C[k3 + 1] = c[1] * bb * (1 - m) + C[k3 + 1] * m;
          C[k3 + 2] = c[2] * bb * (1 - m) + C[k3 + 2] * m;
          Hm[idx] = Bs[idx] + hgt;
        } else if (Bs[idx] + hgt > Hm[idx]) Hm[idx] = Bs[idx] + hgt;
      }
    }
    dist += sl;
  }
}

export const PASSES = [
  { name: 'Laying in the underpainting', cov: 1.7, size: 2.0, thick: 0.35, len: 1.25 },
  { name: 'Building body strokes', cov: 1.9, size: 1.1, thick: 0.8, len: 1.0 },
  { name: 'Loading on impasto', cov: 1.3, size: 0.62, thick: 1.2, len: 0.85 },
];

interface StrokeEvent { x: number; y: number; sm: Sample; w: number; L: number; t: number; seed: number }

// Plan every stroke up front so the painting can be replayed to any point.
function planPainting(sf: Surface, o: PaintOptions, scene: Scene, st: StrokeStyle) {
  const { w: W, h: H, n: N } = sf;
  const rng = mulberry32(o.seed * 104729 + 7);
  const events: StrokeEvent[] = [], passEnds: number[] = [];
  for (const p of PASSES) {
    const w = o.brush * p.size * st.wMul, L = w * 3.2 * p.len * st.lenMul;
    const count = Math.round(p.cov * st.cov * o.density * N / (w * L));
    for (let n = 0; n < count; n++) {
      const x = rng() * W, y = rng() * H;
      const smp = scene.at(x, y), s = smp.s;
      const k = 1 / (s * s);
      const reps = Math.floor(k) + (rng() < k % 1 ? 1 : 0);
      for (let r = 0; r < reps; r++) {
        let jx = x, jy = y, sm = smp;
        if (r) { jx = clamp(x + (rng() - 0.5) * w * s * 2.5, 0, W - 1); jy = clamp(y + (rng() - 0.5) * w * s * 2.5, 0, H - 1); sm = scene.at(jx, jy); }
        events.push({
          x: jx, y: jy, sm, w: w * sm.s * (0.85 + rng() * 0.3), L: L * sm.s * (0.75 + rng() * 0.6),
          t: o.thick * p.thick * st.thick * (sm.t ?? 1), seed: (rng() * 4294967296) >>> 0,
        });
      }
    }
    passEnds.push(events.length);
  }
  return { events, passEnds };
}

// Step 0 is the bare canvas, step 1 the toned wash, then one step per stroke.
export class Timeline {
  readonly sf: Surface; readonly o: PaintOptions; readonly scene: Scene;
  readonly T: number; k = 0;
  private readonly tz: Noise; private readonly st = KNIFE;
  private readonly ev: StrokeEvent[]; private readonly passEnds: number[];
  private readonly interval: number;
  private readonly snaps = new Map<number, { c: Uint8ClampedArray; h: Uint16Array }>();
  constructor(sf: Surface, o: PaintOptions, scene: Scene) {
    this.sf = sf; this.o = o; this.scene = scene;
    this.tz = makeNoise(o.seed + 999);
    const plan = planPainting(sf, o, scene, this.st);
    this.ev = plan.events; this.passEnds = plan.passEnds;
    this.T = this.ev.length + 1;
    this.interval = Math.max(300, Math.ceil(this.T / 12));
    blankCanvas(sf); this.save(0);
  }
  save(k: number): void {
    const { C, Hm, n } = this.sf;
    const c = new Uint8ClampedArray(n * 3), h = new Uint16Array(n);
    for (let i = 0; i < n * 3; i++) c[i] = C[i];
    for (let i = 0; i < n; i++) h[i] = Math.min(65535, Math.round(Hm[i] * 2000));
    this.snaps.set(k, { c, h });
  }
  restore(k: number): void {
    const { C, Hm, n } = this.sf;
    const s = this.snaps.get(k)!;
    for (let i = 0; i < n * 3; i++) C[i] = s.c[i];
    for (let i = 0; i < n; i++) Hm[i] = s.h[i] / 2000;
    this.k = k;
  }
  step(): void {
    if (this.k === 0) applyWash(this.sf, this.scene);
    else {
      const e = this.ev[this.k - 1];
      stroke(this.sf, this.scene, e.x, e.y, e.sm, e.w, e.L, e.t, this.o.swirl, e.seed, this.tz, this.st);
    }
    this.k++;
    if ((this.k % this.interval === 0 || this.k === this.T) && !this.snaps.has(this.k)) this.save(this.k);
  }
  // Move toward `target`, spending at most `budget` ms. Returns true once there.
  seek(target: number, budget: number): boolean {
    target = Math.max(0, Math.min(this.T, target | 0));
    let best = -1;
    for (const key of this.snaps.keys()) if (key <= target && key > best) best = key;
    if (target < this.k || best > this.k) this.restore(best);
    const t0 = performance.now();
    while (this.k < target) {
      this.step();
      if ((this.k & 7) === 0 && performance.now() - t0 > budget) break;
    }
    return this.k === target;
  }
  phase(k: number): string {
    if (k === 0) return 'Bare canvas';
    if (k === 1) return 'Toned ground';
    const i = k - 1;
    for (let p = 0; p < PASSES.length; p++) if (i <= this.passEnds[p]) return PASSES[p].name;
    return PASSES[PASSES.length - 1].name;
  }
}

// Shade the painted surface into `out` (RGBA): normals from the smoothed height
// map, diffuse light from azimuth `azDeg` (0° = from the right, clockwise on
// screen) plus a varnish highlight scaled by `gloss`.
export function relight(sf: Surface, out: Uint8ClampedArray, azDeg: number, gloss: number): void {
  const { w: W, h: H, C, Hm, Hs, Tmp } = sf;
  // separable 3x3 box blur
  for (let y = 0; y < H; y++) {
    const r0 = y * W;
    Tmp[r0] = Hm[r0]; Tmp[r0 + W - 1] = Hm[r0 + W - 1];
    for (let x = 1; x < W - 1; x++) { const i = r0 + x; Tmp[i] = (Hm[i - 1] + Hm[i] + Hm[i + 1]) * 0.3333; }
  }
  for (let x = 0; x < W; x++) { Hs[x] = Tmp[x]; Hs[(H - 1) * W + x] = Tmp[(H - 1) * W + x]; }
  for (let y = 1; y < H - 1; y++) {
    const r0 = y * W;
    for (let x = 0; x < W; x++) { const i = r0 + x; Hs[i] = (Tmp[i - W] + Tmp[i] + Tmp[i + W]) * 0.3333; }
  }
  const az = azDeg * PI / 180, el = 38 * PI / 180;
  const Lx = Math.cos(az) * Math.cos(el), Ly = Math.sin(az) * Math.cos(el), Lz = Math.sin(el);
  let hx = Lx, hy = Ly, hz = Lz + 1; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
  const k = 1.5, invLz = 1 / Lz, sp = gloss * 150;
  for (let y = 0; y < H; y++) {
    const ym = y > 0 ? -W : 0, yp = y < H - 1 ? W : 0;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const xm = x > 0 ? -1 : 0, xp = x < W - 1 ? 1 : 0;
      let nx = -(Hs[i + xp] - Hs[i + xm]) * k, ny = -(Hs[i + yp] - Hs[i + ym]) * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= inv; ny *= inv; const nz = inv;
      let dif = (nx * Lx + ny * Ly + nz * Lz) * invLz; if (dif < 0) dif = 0;
      const sh = 0.28 + 0.72 * dif;
      let nh = nx * hx + ny * hy + nz * hz; if (nh < 0) nh = 0;
      let s = nh * nh; s *= s; s *= s; s *= s; s *= s; // ^32
      s *= sp;
      const k3 = i * 3, o4 = i * 4;
      out[o4] = C[k3] * sh + s; out[o4 + 1] = C[k3 + 1] * sh + s; out[o4 + 2] = C[k3 + 2] * sh + s; out[o4 + 3] = 255;
    }
  }
}
