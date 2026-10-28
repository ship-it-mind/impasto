// The paint plan for one concept, as POST /api/recipe returns it.

export type RecipeTube = { name: string; share: number; grams: number; parts: number }

export type RecipeBand = {
  name: string
  target_hex: string
  mix_hex: string
  delta_e: number
  parts_delta_e: number
  tubes: RecipeTube[]
  paste_parts: number | null
  area_cm2: number
  level: 'thin' | 'medium' | 'heavy'
  paint_g: number
  paste_g: number
  card: { recipe_line: string; steps: string[]; too_dark: string; too_light: string; warnings: string[]; rematch: string[] }
}

export type Recipe = {
  bands: RecipeBand[]
  totals: { paint_g: number; paste_g: number; area_cm2: number }
  shopping: {
    tubes: { name: string; grams: number; buy_g: number; tubes: number }[]
    paste: { grams: number; buy_g: number; tubs: number }
  }
  materials: { tube_ml: number; tub_ml: number; buffer_pct: number; waste_pct: number; calibrated: boolean }
  mixing: { tubes: string[]; without: string[]; paste_in_mix: boolean }
}

export type MixSettings = { without: string[]; pasteInMix: boolean }

export const parts = (n: number) => `${n} ${n === 1 ? 'part' : 'parts'}`
export const grams = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`)
export const cm2 = (a: number) => `${Math.round(a).toLocaleString('en-GB')} cm²`
