// A concept's band layout as Muse's painting gave it (backend/impasto/layout.py):
// band index in red, stroke angle in green.

import type { BandLayout } from '../../relief/bands.ts'

export async function loadLayout(url: string): Promise<BandLayout> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
  const n = bitmap.width * bitmap.height
  const band = new Uint8Array(n), angle = new Uint8Array(n)
  for (let i = 0; i < n; i++) { band[i] = rgba[i * 4]; angle[i] = rgba[i * 4 + 1] }
  return { w: bitmap.width, h: bitmap.height, band, angle }
}
