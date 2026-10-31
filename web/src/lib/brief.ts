// The structured brief as backend/impasto/brief.py writes it.

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
  // Spark's recommendation from the wall photo, when there is one and it made sense.
  wall_fit?: WallFit | null
}

export type WallFit = { visible_width_cm: number; width_cm: number; height_cm: number; center_x: number; center_y: number; reason: string }

// wall: the client's wall photo (URL), when the brief came with one.
export type BriefResult = { id: string; transcript: string; brief: Brief; warnings: string[]; wall: string | null }
