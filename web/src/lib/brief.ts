// The structured brief as backend/impasto/brief.py writes it, and the style presets
// from backend/impasto/presets.py.

export type Brief = {
  summary: string
  piece: { width_cm: number | null; height_cm: number | null; orientation: string | null }
  palette: {
    colors: { name: string; approx_hex: string }[]
    avoid: string[]
    temperature: string | null
    intensity: string | null
  }
  mood: string[]
  style: string[]
  room: {
    name: string | null; placement: string | null; wall_width_cm: number | null
    wall_color_hex: string | null; lighting: string | null; notes: string | null
  }
  budget: string | null
  deadline: string | null
  clarifying_question: string | null
}

// wall: the client's wall photo (URL), when the brief came with one.
export type BriefResult = { id: string; transcript: string; brief: Brief; warnings: string[]; wall: string | null }

export type Relief = { default?: string; accent?: string; top?: string; bottom?: string }
export type Preset = {
  key: string
  name: string
  flows: string[]
  bands: number[]  // [min, max]
  relief: Relief
  palette: { name: string; hex: string }[]
}

export function reliefText(r: Relief): string {
  if (r.top) return `${r.top} at the top → ${r.bottom} at the bottom`
  if (r.accent) return `${r.default}, one ${r.accent} accent`
  return `${r.default} throughout`
}

export function presetFacts(p: Preset): string {
  return `${p.bands[0]}–${p.bands[1]} bands · ${p.flows.join(' / ')} · ${reliefText(p.relief)}`
}
