// Paints one concept with the relief engine, off the main thread, and hands
// back its color and height maps for relighting, plus each band's share of the
// canvas (what the paint plan's areas are measured from).

import { bandScene, type ConceptSpec } from '../../relief/bands.ts'
import { DEFAULTS, Surface, Timeline } from '../../relief/engine.ts'

self.onmessage = (e: MessageEvent<{ spec: ConceptSpec; W: number; H: number; seed: number }>) => {
  const { spec, W, H, seed } = e.data
  const sf = new Surface(W, H)
  const timeline = new Timeline(sf, { seed, ...DEFAULTS }, bandScene(spec, W, H, seed))
  timeline.seek(timeline.T, Infinity)
  const counts = new Array<number>(spec.bands.length).fill(0)
  for (const band of sf.band ?? []) counts[band]++
  const shares = counts.map(c => c / sf.n)
  self.postMessage({ C: sf.C, Hm: sf.Hm, shares }, { transfer: [sf.C.buffer, sf.Hm.buffer] })
}
