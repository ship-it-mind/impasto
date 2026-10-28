// A concept as backend/impasto/concepts.py writes it: Spark's band spec plus
// each band's Mixbox mix from the tubes on hand.

export type Relief = 'thin' | 'medium' | 'heavy'
export type Tube = { name: string; share: number }
export type Band = {
  name: string; hex: string; width: number; relief: Relief
  mix: { hex: string; delta_e: number; tubes: Tube[] }
}
// index: the concept's place in its run on the server.
export type Concept = { title: string; flow: string; idea: string; bands: Band[]; mix_warnings: string[]; index: number }

export type Piece = { widthCm: number; heightCm: number; wallWidthCm: number | null }

// Same threshold as MAX_MIX_DE in backend/impasto/concepts.py.
const MAX_MIX_DE = 3

// Bands the tubes on hand can only mix close to, not exactly.
export function offBands(c: Concept): Band[] {
  return c.bands.filter(b => b.mix.delta_e > MAX_MIX_DE)
}

export function reliefSummary(c: Concept): string {
  const heavy = c.bands.filter(b => b.relief === 'heavy').length
  return `${c.bands.length} bands · ${heavy ? `${heavy} heavy` : 'no heavy'} · ${c.flow}`
}
