// How to paint a concept, as POST /api/guide returns it.

export type GuideStep = {
  id: string
  title: string
  // The band this stage paints, by its index in the recipe.
  band: number | null
  // The bands on the canvas once this stage is done.
  paste: number[]
  paint: number[]
  // How long this stage has to dry before the next one.
  wait: string | null
  do: string[]
  tips: string[]
}

export type Guide = { overview: string; tips: string[]; steps: GuideStep[] }
