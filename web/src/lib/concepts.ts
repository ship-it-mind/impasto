// A concept as backend/impasto/concepts.py writes it: Spark's band spec plus
// each band's Mixbox mix from the tubes on hand.

export type Relief = 'thin' | 'medium' | 'heavy'
export type Tube = { name: string; share: number }
export type Band = {
  name: string; hex: string; width: number; relief: Relief
  mix: { hex: string; delta_e: number; tubes: Tube[] }
}
// Path A: Muse Image's painting of the concept, or the exact picture, and the band layout read off it (URLs).
export type Layout = { image: string; map: string; shares: number[] }
// index: the concept's place in its run on the server. layout_note: why Muse's layout isn't used, or how an exact
// picture became this plan. exact: this is the user's own picture, to paint as it is.
// composition: Spark's words on the arrangement; flow is then only the nearest layout, for a fallback sketch.
export type Concept = {
  title: string; flow: string; composition?: string; idea: string; bands: Band[]; mix_warnings: string[]; index: number
  layout?: Layout; layout_note?: string; exact?: boolean
  // This concept is a change the painter asked for in the chat: from which concept, and what they asked.
  // segments: the parts it was about; area: the same, on versions made when a part was dragged as a box.
  edit?: { from: number; message: string; segments?: Segment[] | null; area?: number[] | null }
}

// A segment of the painting, by a point on it: x and y as shares of the canvas.
export type Segment = [number, number]

// The concept an edit started from, or the concept itself if it isn't one.
function originalOf(concepts: Concept[], concept: Concept): Concept {
  const from = concept.edit && concepts.find(c => c.index === concept.edit?.from)
  return from ? originalOf(concepts, from) : concept
}

// A concept's versions: the original, then each edit of it in the order they were made.
export function versionsOf(concepts: Concept[], concept: Concept): Concept[] {
  const original = originalOf(concepts, concept)
  return concepts.filter(c => originalOf(concepts, c) === original)
}

export type Piece = { widthCm: number; heightCm: number; wallWidthCm: number | null }

export function reliefSummary(c: Concept): string {
  const heavy = c.bands.filter(b => b.relief === 'heavy').length
  const summary = `${c.bands.length} bands · ${heavy ? `${heavy} heavy` : 'no heavy'}`
  return c.composition ? summary : `${summary} · ${c.flow}`
}
