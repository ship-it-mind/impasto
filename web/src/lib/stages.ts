// What the canvas looks like part-way through painting: the finished painting,
// cut along its band map. Painted bands show the painting itself, pasted bands
// the same knife ridges in white paste, and the rest bare canvas with the
// pencil lines marking where the bands go. It takes no model call, and every
// stage lines up exactly with the painting it leads to.

import { relight } from '../../relief/engine.ts'
import { loadLayout } from './band-map'
import type { Concept, Layout } from './concepts'
import { DEFAULT_LIGHT, paint } from './relief'

// The bands on the canvas by this stage.
export type StageView = { paste: number[]; paint: number[] }

type Source = { W: number; H: number; rgba: Uint8ClampedArray; band: ArrayLike<number>; luma: number[] }

const PASTE = [238, 234, 224]
const CANVAS = [243, 239, 230]
const PENCIL = [128, 120, 110]
// How far the paste's ridges may swing from its color, as a share of it.
const RIDGE_MIN = 0.68
const RIDGE_MAX = 1.08

const lumaAt = (rgba: ArrayLike<number>, i: number) => 0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]

// Each band's mean brightness, which its ridges are measured against.
function bandLuma(rgba: Uint8ClampedArray, band: ArrayLike<number>, bands: number): number[] {
  const sum = new Array<number>(bands).fill(0), count = new Array<number>(bands).fill(0)
  for (let i = 0; i < band.length; i++) { sum[band[i]] += lumaAt(rgba, i); count[band[i]]++ }
  return sum.map((s, b) => s / Math.max(count[b], 1))
}

// Muse's painting, cropped to the canvas just as its band map was (crop_to in layout.py).
async function museSource(layout: Layout, bands: number): Promise<Source> {
  const [image, map] = await Promise.all([
    fetch(layout.image).then(r => r.blob()).then(blob => createImageBitmap(blob)),
    loadLayout(layout.map),
  ])
  const canvas = new OffscreenCanvas(map.w, map.h)
  const ctx = canvas.getContext('2d')!
  const scale = Math.min(image.width / map.w, image.height / map.h)
  const sw = map.w * scale, sh = map.h * scale
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, map.w, map.h)
  const rgba = ctx.getImageData(0, 0, map.w, map.h).data
  return { W: map.w, H: map.h, rgba, band: map.band, luma: bandLuma(rgba, map.band, bands) }
}

async function reliefSource(concept: Concept, seed: number, W: number, H: number): Promise<Source> {
  const { surface } = await paint(concept, seed, W, H)
  if (!surface.band) throw new Error('This relief has no band map.')
  const rgba = new Uint8ClampedArray(W * H * 4)
  relight(surface, rgba, DEFAULT_LIGHT, 0.15)
  return { W, H, rgba, band: surface.band, luma: bandLuma(rgba, surface.band, concept.bands.length) }
}

const sources = new Map<string, Promise<Source>>()

function stageSource(concept: Concept, seed: number, W: number, H: number): Promise<Source> {
  const key = concept.layout?.map ?? JSON.stringify([concept.bands.map(b => b.mix.hex), seed, W, H])
  let source = sources.get(key)
  if (!source) {
    source = concept.layout ? museSource(concept.layout, concept.bands.length) : reliefSource(concept, seed, W, H)
    source.catch(() => sources.delete(key))
    sources.set(key, source)
  }
  return source
}

function compose({ W, H, rgba, band, luma }: Source, view: StageView, out: Uint8ClampedArray): void {
  const painted = new Set(view.paint), pasted = new Set(view.paste)
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const b = band[i], o = i * 4
    out[o + 3] = 255
    if (painted.has(b)) {
      out[o] = rgba[o]; out[o + 1] = rgba[o + 1]; out[o + 2] = rgba[o + 2]
    } else if (pasted.has(b)) {
      const ridge = Math.min(RIDGE_MAX, Math.max(RIDGE_MIN, lumaAt(rgba, i) / luma[b]))
      out[o] = PASTE[0] * ridge; out[o + 1] = PASTE[1] * ridge; out[o + 2] = PASTE[2] * ridge
    } else {
      const line = (x > 0 && band[i - 1] !== b) || (x + 1 < W && band[i + 1] !== b) || (y > 0 && band[i - W] !== b) || (y + 1 < H && band[i + W] !== b)
      // The weave, as the relief preview draws bare canvas.
      const weave = ((x >> 1) + (y >> 1)) & 1 ? 0 : -4
      const color = line ? PENCIL : CANVAS
      out[o] = color[0] + weave; out[o + 1] = color[1] + weave; out[o + 2] = color[2] + weave
    }
  }
}

// Draws the stage on the canvas element, at the painting's own size.
export async function drawStage(canvas: HTMLCanvasElement, concept: Concept, seed: number, W: number, H: number, view: StageView): Promise<void> {
  const source = await stageSource(concept, seed, W, H)
  canvas.width = source.W
  canvas.height = source.H
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(source.W, source.H)
  compose(source, view, image.data)
  ctx.putImageData(image, 0, 0)
}
