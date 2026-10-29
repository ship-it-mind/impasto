// A progress check-in, as POST /api/checkins returns it (backend/impasto/checkin.py).

export type Point = [number, number]

export type BandProgress = {
  id: number
  name: string
  planned_hex: string
  planned_cm2: number
  painted_cm2: number
  coverage: number
  measured_hex: string | null
  delta_e: number | null
  drift: string | null
  fix: string | null
}

export type CheckIn = {
  id: string
  taken_at: string
  coverage: number
  bands: BandProgress[]
  // At most 3 short lines: where she stands, then the worst color drifts.
  summary: string[]
  warnings: string[]
  images: { progress: string; rectified: string }
}

// Points tapped on the photo, in its own pixels. Without corners, SAM finds the canvas.
export type CheckInInput = { photo: File; white: Point; corners: Point[]; ground: Point | null }

// Same thresholds as DONE and MIN_STARTED in backend/impasto/checkin.py.
export const DONE = 0.95
export const MIN_STARTED = 0.05

export const percent = (share: number) => `${Math.round(share * 100)}%`

export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
