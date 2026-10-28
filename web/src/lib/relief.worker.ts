// Paints one concept with the relief engine, off the main thread, and hands
// back its color and height maps for relighting.

import { bandScene, type ConceptSpec } from '../../relief/bands.ts'
import { DEFAULTS, Surface, Timeline } from '../../relief/engine.ts'

self.onmessage = (e: MessageEvent<{ spec: ConceptSpec; W: number; H: number; seed: number }>) => {
  const { spec, W, H, seed } = e.data
  const sf = new Surface(W, H)
  const timeline = new Timeline(sf, { seed, ...DEFAULTS }, bandScene(spec, W, H, seed))
  timeline.seek(timeline.T, Infinity)
  self.postMessage({ C: sf.C, Hm: sf.Hm }, { transfer: [sf.C.buffer, sf.Hm.buffer] })
}
