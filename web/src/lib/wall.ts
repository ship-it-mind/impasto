// Where a piece hangs on the wall photo, all in photo pixels. The corners go top-left, top-right,
// bottom-right, bottom-left, and needn't make a rectangle: a wall photographed at an angle doesn't show one.

import type { Point } from './checkin'

export type Quad = [Point, Point, Point, Point]
// line and length_cm: the scale. estimated: that scale is Spark's guess from the photo, not a line the painter measured.
export type Mockup = { line: [Point, Point]; length_cm: number; corners: Quad; estimated?: boolean }
export type SizeCm = { w: number; h: number }

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])

export const pxPerCm = (m: Pick<Mockup, 'line' | 'length_cm'>) => dist(m.line[0], m.line[1]) / m.length_cm

// The quad's average width and height in pixels.
export function quadSides([tl, tr, br, bl]: Quad): { across: number; down: number } {
  return { across: (dist(tl, tr) + dist(bl, br)) / 2, down: (dist(tl, bl) + dist(tr, br)) / 2 }
}

// The size the corners mark, at the mockup's scale.
export function quadCm(m: Mockup): SizeCm {
  const { across, down } = quadSides(m.corners)
  const scale = pxPerCm(m)
  return { w: Math.max(1, Math.round(across / scale)), h: Math.max(1, Math.round(down / scale)) }
}

export function rectangle([x, y]: Point, width: number, height: number): Quad {
  return [[x - width / 2, y - height / 2], [x + width / 2, y - height / 2], [x + width / 2, y + height / 2], [x - width / 2, y + height / 2]]
}

export function moveQuad(q: Quad, dx: number, dy: number): Quad {
  return q.map(([x, y]) => [x + dx, y + dy]) as Quad
}

// The same quad at a new width and height, around its center. Its slant stays, so it still sits on the wall.
export function resizeQuad(q: Quad, width: number, height: number): Quad {
  const [tl, tr, br, bl] = q
  const { across, down } = quadSides(q)
  const su = width / across, sv = height / down
  const c: Point = [(tl[0] + tr[0] + br[0] + bl[0]) / 4, (tl[1] + tr[1] + br[1] + bl[1]) / 4]
  return q.map(([x, y]) => {
    const dx = x - c[0], dy = y - c[1]
    // Split each corner's offset into the quad's own across and down directions, and scale each.
    const ux = (tr[0] + br[0] - tl[0] - bl[0]) / 2, uy = (tr[1] + br[1] - tl[1] - bl[1]) / 2
    const vx = (bl[0] + br[0] - tl[0] - tr[0]) / 2, vy = (bl[1] + br[1] - tl[1] - tr[1]) / 2
    const det = ux * vy - uy * vx
    const a = (dx * vy - dy * vx) / det, b = (ux * dy - uy * dx) / det
    return [c[0] + a * su * ux + b * sv * vx, c[1] + a * su * uy + b * sv * vy]
  }) as Quad
}

// Four points tapped in any order, as top-left, top-right, bottom-right, bottom-left.
export function orderQuad(points: Point[]): Quad {
  const by = (score: (p: Point) => number) => points.reduce((best, p) => (score(p) < score(best) ? p : best))
  return [by(p => p[0] + p[1]), by(p => p[1] - p[0]), by(p => -p[0] - p[1]), by(p => p[0] - p[1])]
}

// A quad the painting can be drawn on: it doesn't cross itself or fold in.
export function isConvex(q: Quad): boolean {
  const turns = q.map((a, i) => {
    const b = q[(i + 1) % 4], c = q[(i + 2) % 4]
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
  })
  return turns.every(t => t > 0) || turns.every(t => t < 0)
}

type Homography = [number, number, number, number, number, number, number, number, number]

// Takes a W × H rectangle at the origin onto the quad, by the projective mapping of a square onto a quadrilateral.
function homography([[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad, W: number, H: number): Homography {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det, h = (dx1 * dy3 - dx3 * dy1) / det
  return [
    (x1 - x0 + g * x1) / W, (x3 - x0 + h * x3) / H, x0,
    (y1 - y0 + g * y1) / W, (y3 - y0 + h * y3) / H, y0,
    g / W, h / H, 1,
  ]
}

// CSS for an element W × H px with its origin at its top left, drawn onto the quad.
export function quadTransform(q: Quad, W: number, H: number): string {
  const [a, b, c, d, e, f, g, h, i] = homography(q, W, H)
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].join(',')})`
}

// Draws a picture onto the quad, pixel by pixel: a canvas can't draw in perspective by itself.
// source is the part of the picture to use, cropped to the canvas's shape.
export function drawOnQuad(ctx: CanvasRenderingContext2D, art: CanvasImageSource, source: { x: number; y: number; w: number; h: number }, q: Quad) {
  const flat = document.createElement('canvas')
  flat.width = Math.round(source.w)
  flat.height = Math.round(source.h)
  const flatCtx = flat.getContext('2d')!
  flatCtx.drawImage(art, source.x, source.y, source.w, source.h, 0, 0, flat.width, flat.height)
  const from = flatCtx.getImageData(0, 0, flat.width, flat.height).data

  const [a, b, c, d, e, f, g, h, i] = homography(q, flat.width, flat.height)
  // The inverse of the mapping, as its adjugate: photo pixel back to picture pixel.
  const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e
  const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d

  const left = Math.max(0, Math.floor(Math.min(...q.map(p => p[0])))), top = Math.max(0, Math.floor(Math.min(...q.map(p => p[1]))))
  const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...q.map(p => p[0])))), bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...q.map(p => p[1]))))
  if (right <= left || bottom <= top) return
  const out = ctx.getImageData(left, top, right - left, bottom - top)
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const w = G * x + H * y + I
      const u = Math.floor((A * x + B * y + C) / w), v = Math.floor((D * x + E * y + F) / w)
      if (u < 0 || v < 0 || u >= flat.width || v >= flat.height) continue
      const at = (v * flat.width + u) * 4, to = ((y - top) * (right - left) + x - left) * 4
      out.data[to] = from[at]
      out.data[to + 1] = from[at + 1]
      out.data[to + 2] = from[at + 2]
    }
  }
  ctx.putImageData(out, left, top)
}
