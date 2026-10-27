// A concept spec drawn as color bands: the Scene the relief engine paints from.
// Spark decides the flow, band order, colors, widths and relief
// (backend/impasto/concepts.py); the geometry here is plain code.

import { clamp, hex, makeNoise, mulberry32, type RGB, type Sample, type Scene } from './engine.ts';

export type Relief = 'thin' | 'medium' | 'heavy';
export type Flow = 'arc' | 'diagonal' | 'wave' | 'horizontal' | 'gentle wave' | 'grid' | 'diagonal split';

export interface BandSpec { name: string; hex: string; width: number; relief: Relief }
export interface ConceptSpec { title: string; flow: Flow; bands: BandSpec[] }

// Paste thickness and stroke size per relief level: heavy bands get thicker,
// shorter, denser strokes.
const RELIEF: Record<Relief, { t: number; s: number }> = {
  thin: { t: 0.45, s: 1.15 },
  medium: { t: 1, s: 1 },
  heavy: { t: 1.9, s: 0.8 },
};

export interface BandScene extends Scene { bandAt(x: number, y: number): number }

export function bandScene(spec: ConceptSpec, W: number, H: number, seed: number): BandScene {
  const region = spec.flow === 'grid' || spec.flow === 'diagonal split'
    ? panels(spec, W, H, seed)
    : continuous(spec, W, H, seed);
  const colors: RGB[] = spec.bands.map(b => hex(b.hex));
  return {
    bandAt: (x, y) => region(x, y).band,
    at(x: number, y: number): Sample {
      const { band, a } = region(x, y);
      const r = RELIEF[spec.bands[band].relief];
      return { c: colors[band], a, s: r.s, t: r.t };
    },
  };
}

type Region = (x: number, y: number) => { band: number; a: number };

// Flowing layouts: a scalar field whose level sets are the band edges.
// Bands follow each other along the field; strokes run along the level sets.
function continuous(spec: ConceptSpec, W: number, H: number, seed: number): Region {
  const rng = mulberry32(seed * 7919 + 13), nz = makeNoise(seed);
  const D = Math.hypot(W, H), sign = rng() < 0.5 ? -1 : 1;
  let field: (x: number, y: number) => number;
  if (spec.flow === 'horizontal') {
    const tilt = (rng() - 0.5) * 0.08;
    field = (x, y) => y + (x - W / 2) * tilt;
  } else if (spec.flow === 'gentle wave') {
    const A = (0.03 + rng() * 0.03) * H, k = (0.6 + rng() * 0.8) * 2 * Math.PI / W, ph = rng() * 6;
    field = (x, y) => y + A * Math.sin(x * k + ph);
  } else if (spec.flow === 'arc') {
    // Center off a corner, so the bands are concentric arcs across the canvas.
    const cx = rng() < 0.5 ? -(0.1 + rng() * 0.4) * W : (1.1 + rng() * 0.4) * W;
    const cy = rng() < 0.5 ? -(0.1 + rng() * 0.3) * H : (1.1 + rng() * 0.3) * H;
    field = (x, y) => Math.hypot(x - cx, y - cy);
  } else {
    // diagonal, or diagonal with a wave along it
    const phi = Math.PI / 2 + sign * (0.45 + rng() * 0.45);
    const nx = Math.cos(phi), ny = Math.sin(phi);
    const A = spec.flow === 'wave' ? (0.035 + rng() * 0.03) * D : 0;
    const k = (1 + rng() * 1.2) * 2 * Math.PI / D, ph = rng() * 6, bend = (rng() - 0.5) * 0.25 / D;
    field = (x, y) => {
      const along = -ny * x + nx * y;
      return nx * x + ny * y + A * Math.sin(along * k + ph) + bend * along * along;
    };
  }

  // Normalize the field over the canvas, then cut it at the bands' cumulative widths.
  let lo = Infinity, hi = -Infinity;
  for (let gy = 0; gy <= 40; gy++) for (let gx = 0; gx <= 40; gx++) {
    const f = field(gx / 40 * W, gy / 40 * H); if (f < lo) lo = f; if (f > hi) hi = f;
  }
  const cuts = cumulative(spec.bands.map(b => b.width));
  const warp = 0.006 * D, eps = 1.5;
  return (x, y) => {
    // Small noise on the edges, so they read as knife-laid rather than ruled.
    const wx = x + (nz.fbm(x * 0.004, y * 0.004) - 0.5) * warp;
    const wy = y + (nz.fbm(x * 0.004 + 31, y * 0.004 + 17) - 0.5) * warp;
    const f = clamp((field(wx, wy) - lo) / (hi - lo));
    const gx = field(x + eps, y) - field(x - eps, y), gy = field(x, y + eps) - field(x, y - eps);
    return { band: bandIndex(cuts, f), a: Math.atan2(gy, gx) + Math.PI / 2 };
  };
}

// Geometric layouts: rectangular panels from recursive splits; for a diagonal
// split, some panels are cut corner to corner. Each region takes one band,
// every band gets at least one region, neighbors in order never repeat.
function panels(spec: ConceptSpec, W: number, H: number, seed: number): Region {
  const rng = mulberry32(seed * 7919 + 13), nz = makeNoise(seed);
  const n = spec.bands.length;
  type Rect = { x: number; y: number; w: number; h: number; cut: number; angle: number };
  const rects: Rect[] = [{ x: 0, y: 0, w: W, h: H, cut: 0, angle: 0 }];
  const target = Math.max(n, Math.round(n * (1.3 + rng() * 0.5)));
  while (rects.length < target) {
    rects.sort((a, b) => b.w * b.h - a.w * a.h);
    const r = rects.shift()!, t = 0.35 + rng() * 0.3;
    if (r.w >= r.h) rects.push({ ...r, w: r.w * t }, { ...r, x: r.x + r.w * t, w: r.w * (1 - t) });
    else rects.push({ ...r, h: r.h * t }, { ...r, y: r.y + r.h * t, h: r.h * (1 - t) });
  }
  if (spec.flow === 'diagonal split') {
    const k = 1 + Math.floor(rng() * 2);
    for (const r of rects.slice(0, k)) r.cut = rng() < 0.5 ? 1 : -1;
  }
  // Region ids: one per panel, two for a cut panel.
  const regions = rects.flatMap((r, i) => r.cut ? [i * 2, i * 2 + 1] : [i * 2]);
  const order = [...Array(n).keys()].sort(() => rng() - 0.5);
  const bandOf = new Map(regions.map((id, i) => [id, order[i % n]]));
  for (const r of rects) r.angle = (r.w >= r.h ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.3;

  const warp = 0.003 * Math.hypot(W, H);
  return (x, y) => {
    const wx = x + (nz.fbm(x * 0.005, y * 0.005) - 0.5) * warp;
    const wy = y + (nz.fbm(x * 0.005 + 31, y * 0.005 + 17) - 0.5) * warp;
    let i = rects.findIndex(r => wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h);
    if (i < 0) i = 0;
    const r = rects[i];
    let id = i * 2, a = r.angle;
    if (r.cut) {
      const u = (wx - r.x) / r.w, v = (wy - r.y) / r.h;
      const side = r.cut > 0 ? v > u : v > 1 - u;
      id += side ? 1 : 0;
      a = Math.atan2(r.cut * r.h, r.w);  // strokes along the cut
    }
    return { band: bandOf.get(id)!, a };
  };
}

function cumulative(widths: number[]): number[] {
  const total = widths.reduce((s, w) => s + w, 0) || 1;
  let acc = 0;
  return widths.map(w => (acc += w / total));
}

function bandIndex(cuts: number[], f: number): number {
  for (let i = 0; i < cuts.length; i++) if (f <= cuts[i]) return i;
  return cuts.length - 1;
}
