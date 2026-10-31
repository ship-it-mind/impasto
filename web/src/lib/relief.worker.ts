// Paints one concept with the relief engine, off the main thread, and hands
// back its color and height maps for relighting, plus each band's share of the
// canvas (what the paint plan's areas are measured from). A concept Muse Image
// painted is laid out from its band map; any other from the spec's geometry.
// Given a stage, it stops where that much of the canvas is painted, band by
// band in its order.

import { bandScene, layoutScene, type ConceptSpec } from '../../relief/bands.ts'
import { DEFAULTS, Surface, Timeline, bareUnpainted } from '../../relief/engine.ts'
import { loadLayout } from './band-map'
import type { Stage } from './relief'

type Job = { spec: ConceptSpec & { layout?: { map: string } }; W: number; H: number; seed: number; stage?: Stage }

self.onmessage = async (e: MessageEvent<Job>) => {
  const { spec, W, H, seed, stage } = e.data
  const scene = spec.layout ? layoutScene(spec, await loadLayout(spec.layout.map), W, H) : bandScene(spec, W, H, seed)
  const sf = new Surface(W, H)
  const timeline = new Timeline(sf, { seed, ...DEFAULTS }, scene, stage?.order)
  const counts = new Array<number>(spec.bands.length).fill(0)
  for (const band of sf.band ?? []) counts[band]++
  const shares = counts.map(c => c / sf.n)
  const step = stage ? timeline.stepAt(stage.painted, shares) : timeline.T
  timeline.seek(step, Infinity)
  if (stage) bareUnpainted(sf, timeline.finishedAt(step))
  self.postMessage({ C: sf.C, Hm: sf.Hm, band: sf.band, shares }, { transfer: [sf.C.buffer, sf.Hm.buffer] })
}
