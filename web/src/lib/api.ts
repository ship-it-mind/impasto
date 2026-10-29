// What the screens ask the backend for (backend/impasto/api.py, proxied at /api).
//
// Model calls run as jobs on the server: each call here starts one and polls it,
// passing the server's phase ("Transcribing the voice note…") to `onPhase`.

import type { CheckIn, CheckInInput } from './checkin'
import type { Concept, Piece } from './concepts'
import type { BriefResult, Preset } from './brief'
import type { MixSettings, Recipe } from './recipe'

export type BriefInput = { audio: File | null; text: string; wall: File | null }
export type StyleInput = { preset: string | null; references: File[]; without?: string[] }
export type ConceptSet = { run: string; concepts: Concept[]; canvasPx: [number, number]; piece: Piece }
export type Presets = { default: string; presets: Preset[]; tubes: string[] }

// One session per page load: the server caps model calls per session.
const SESSION = crypto.randomUUID()
const POLL_MS = 700

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: { ...init.headers, 'X-Impasto-Session': SESSION } })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : `The server said ${response.status}. Try again.`)
  }
  return body as T
}

type Job<T> = { status: 'running' | 'done' | 'failed'; phase: string; result: T | null; error: string | null }

async function poll<T>(start: Promise<{ job: string }>, onPhase?: (phase: string) => void): Promise<T> {
  const { job } = await start
  for (;;) {
    const state = await request<Job<T>>(`/jobs/${job}`)
    if (state.status === 'done') return state.result as T
    if (state.status === 'failed') throw new Error(state.error ?? 'Something went wrong on the server.')
    onPhase?.(state.phase)
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

let presets: Promise<Presets> | null = null
export function getPresets(): Promise<Presets> {
  presets ??= request<Presets>('/presets').catch(error => { presets = null; throw error })
  return presets
}

// Voice Transcribe (if there is a voice note), then Spark reads the brief.
export function readBrief(input: BriefInput, onPhase: (phase: string) => void): Promise<BriefResult> {
  const form = new FormData()
  form.append('text', input.text)
  if (input.audio) form.append('audio', input.audio)
  if (input.wall) form.append('wall', input.wall)
  return poll(request('/brief', { method: 'POST', body: form }), onPhase)
}

// The client's answer to Spark's one clarifying question (the size).
export function answerQuestion(result: BriefResult, answer: string): Promise<BriefResult> {
  return poll(request(`/brief/${result.id}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  }))
}

type ConceptsRecord = { run: string; canvas_px: [number, number]; concepts: (Concept & { warnings: string[]; index: number })[] }

// Spark drafts 3 band specs in the chosen style; each band gets its Mixbox mix.
export async function makeConcepts(result: BriefResult, style: StyleInput, onPhase?: (phase: string) => void): Promise<ConceptSet> {
  const form = new FormData()
  form.append('brief_id', result.id)
  if (style.preset) form.append('preset', style.preset)
  style.references.forEach(file => form.append('references', file))
  style.without?.forEach(tube => form.append('without', tube))
  const set = conceptSet(await poll<ConceptsRecord>(request('/concepts', { method: 'POST', body: form }), onPhase), result)
  if (set.concepts.length === 0) throw new Error("None of the concepts came out usable. Make them again.")
  return set
}

// A concept that broke the spec (no valid color, a flow the style doesn't allow) can't be painted.
// Each keeps its index in the run, which is how the recipe and check-ins ask for it.
function conceptSet(record: ConceptsRecord, result: BriefResult): ConceptSet {
  const { piece, room } = result.brief
  return {
    run: record.run,
    concepts: record.concepts.map((c, index) => ({ ...c, index })).filter(c => c.warnings.length === 0),
    canvasPx: record.canvas_px,
    piece: { widthCm: piece.width_cm ?? 120, heightCm: piece.height_cm ?? 90, wallWidthCm: room.wall_width_cm },
  }
}

// A piece read earlier, for the list to reopen it from.
export type PieceSummary = {
  id: string
  summary: string
  updated: string
  concepts: boolean
  concept: { title: string; image: string | null; checkins: number } | null
}

export async function listPieces(): Promise<PieceSummary[]> {
  return (await request<{ pieces: PieceSummary[] }>('/pieces')).pieces
}

// A piece as it was left: the brief, its latest concepts, and the chosen concept (its
// place among the usable ones, as the screens count them) with its saved recipe.
export type OpenedPiece = { brief: BriefResult; set?: ConceptSet; pick?: number; recipe?: Recipe }

export async function openPiece(id: string): Promise<OpenedPiece> {
  const saved = await request<{ brief: BriefResult; concepts?: ConceptsRecord; chosen?: number; recipe?: Recipe }>(`/pieces/${id}`)
  if (!saved.concepts) return { brief: saved.brief }
  const set = conceptSet(saved.concepts, saved.brief)
  const pick = set.concepts.findIndex(c => c.index === saved.chosen)
  return pick < 0 ? { brief: saved.brief, set } : { brief: saved.brief, set, pick, recipe: saved.recipe }
}

// The paint plan for one concept: grams per band, Mixbox recipes from the tubes
// on hand, Spark's recipe cards and a shopping list. `shares` is each band's
// share of the canvas, measured from the painted concept.
export function makeRecipe(
  result: BriefResult, set: ConceptSet, concept: Concept, shares: number[], settings: MixSettings, onPhase?: (phase: string) => void,
): Promise<Recipe> {
  return poll(request('/recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brief_id: result.id, run: set.run, concept: concept.index, shares,
      without: settings.without, paste_in_mix: settings.pasteInMix,
    }),
  }), onPhase)
}

// Measure a photo of the canvas against the chosen concept, painted at `seed`:
// coverage and color drift per band, against the latest recipe's mixes.
export function checkIn(
  result: BriefResult, set: ConceptSet, concept: Concept, seed: number, input: CheckInInput, onPhase?: (phase: string) => void,
): Promise<CheckIn> {
  const form = new FormData()
  form.append('brief_id', result.id)
  form.append('run', set.run)
  form.append('concept', String(concept.index))
  form.append('seed', String(seed))
  form.append('photo', input.photo)
  form.append('white', input.white.join(','))
  input.corners.forEach(c => form.append('corners', c.join(',')))
  if (input.ground) form.append('ground', input.ground.join(','))
  return poll(request('/checkins', { method: 'POST', body: form }), onPhase)
}

// Every check-in on this concept so far, oldest first.
export async function listCheckIns(result: BriefResult, set: ConceptSet, concept: Concept): Promise<CheckIn[]> {
  const query = new URLSearchParams({ brief_id: result.id, run: set.run, concept: String(concept.index) })
  return (await request<{ checkins: CheckIn[] }>(`/checkins?${query}`)).checkins
}
