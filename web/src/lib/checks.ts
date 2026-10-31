// What the check-ins screen keeps besides whole-canvas check-ins (backend/impasto/api.py).

export type Verdict = 'on_track' | 'needs_work' | 'unclear'

// Spark's look at a photo of one step of the guide.
export type StepCheck = {
  id: string
  step: string
  taken_at: string
  paste_in_mix: boolean
  review: { verdict: Verdict; headline: string; looks_right: string[]; to_fix: string[] }
  photo: string
}

export type MixState = 'match' | 'close' | 'off'

// One color tapped in a photo of the bowl, measured against its band's mix.
export type MixResult = {
  band: number
  name: string
  planned_hex: string
  measured_hex: string
  delta_e: number
  state: MixState
  drift: string | null
  advice: string[]
  warnings: string[]
}

export type MixCheck = { id: string; taken_at: string; paste_in_mix: boolean; results: MixResult[]; warnings: string[]; photo: string }

export type Asked = { question: string; answer: string; asked_at: string; section: string | null }

export type Checks = { steps: StepCheck[]; mixes: MixCheck[]; questions: Asked[] }

// Each band's latest reading, with the check it came from.
export function latestMixes(mixes: MixCheck[]): Map<number, { check: MixCheck; result: MixResult }> {
  const latest = new Map<number, { check: MixCheck; result: MixResult }>()
  for (const check of mixes) for (const result of check.results) latest.set(result.band, { check, result })
  return latest
}

// Same as DRY_TIME in backend/impasto/method.py: the least each wording can mean, in hours.
const DRY_HOURS: Record<string, number> = { 'a few hours': 3, 'about a day': 24, '2–3 days': 48 }

// How much longer paste photographed at `takenAt` still needs, in hours, or null if it's had long enough.
export function stillDrying(wait: string, takenAt: string, now = Date.now()): number | null {
  const left = (DRY_HOURS[wait] ?? 0) - (now - new Date(takenAt).getTime()) / 3_600_000
  return left > 0 ? left : null
}
