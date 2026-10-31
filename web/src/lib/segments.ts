// A painting's segments: each connected shape of one color in its band map, which is what a tap selects.
// Neighbors count across edges only, as in segment_mask in backend/impasto/edits.py, so both find the same shapes.

import type { BandLayout } from '../../relief/bands.ts'
import type { Segment } from './concepts'

export type SegmentMap = { w: number; h: number; labels: Int32Array }

export function findSegments({ w, h, band }: Pick<BandLayout, 'w' | 'h' | 'band'>): SegmentMap {
  const labels = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  let next = 0
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== -1) continue
    labels[start] = next
    let top = 0
    stack[top++] = start
    while (top) {
      const at = stack[--top]
      const x = at % w
      const visit = (to: number) => {
        if (labels[to] === -1 && band[to] === band[start]) { labels[to] = next; stack[top++] = to }
      }
      if (x > 0) visit(at - 1)
      if (x < w - 1) visit(at + 1)
      if (at >= w) visit(at - w)
      if (at < labels.length - w) visit(at + w)
    }
    next++
  }
  return { w, h, labels }
}

// The segment at a point given as shares of the canvas.
export function labelAt({ w, h, labels }: SegmentMap, [x, y]: Segment): number {
  return labels[Math.min(h - 1, Math.floor(y * h)) * w + Math.min(w - 1, Math.floor(x * w))]
}

// Paints over the picture: selected segments outlined and the rest dimmed, the one under the pointer lightened.
export function drawSegments(ctx: CanvasRenderingContext2D, { w, h, labels }: SegmentMap, selected: Set<number>, hovered: number | null) {
  const out = ctx.createImageData(w, h)
  const edge = Math.max(1, Math.round(Math.max(w, h) / 400))
  const put = (i: number, value: number, alpha: number) => {
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = value
    out.data[i * 4 + 3] = alpha
  }
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const label = labels[i]
      if (label === hovered || selected.has(label)) {
        const onEdge = (x >= edge && labels[i - edge] !== label) || (x < w - edge && labels[i + edge] !== label)
          || (y >= edge && labels[i - edge * w] !== label) || (y < h - edge && labels[i + edge * w] !== label)
        if (onEdge) put(i, 255, 255)
        else if (!selected.has(label)) put(i, 255, 64)
      } else if (selected.size) {
        put(i, 0, 110)
      }
    }
  }
  ctx.putImageData(out, 0, 0)
}
