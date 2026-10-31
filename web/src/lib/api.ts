// What the screens ask the backend for (backend/impasto/api.py, proxied at /api).
//
// Model calls run as jobs on the server: each call here starts one and polls it,
// passing the server's phase ("Reading the brief…") to `onPhase`.

import type { CheckIn, CheckInInput, Point } from './checkin'
import type { Concept, Piece } from './concepts'
import type { BriefResult, Preset } from './brief'
import type { MixSettings, Recipe } from './recipe'

export type BriefInput = { text: string; wall: File | null }
export type StyleInput = { references: File[]; without?: string[] }
export type ConceptSet = { run: string; concepts: Concept[]; canvasPx: [number, number]; piece: Piece }
export type Presets = { default: string; presets: Preset[]; tubes: string[] }

const POLL_MS = 700

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.detail
    throw new Error(typeof detail === 'string' ? detail : `The server said ${response.status}. Try again.`)
  }
  return response
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await send(path, init)).json() as Promise<T>
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

// Browsers can't show HEIC and the pipeline can't read it, so a HEIC photo becomes a JPEG as soon as it's picked.
export async function webImage(file: File): Promise<File> {
  if (!/\.hei[cf]$/i.test(file.name) && !/^image\/hei[cf]/.test(file.type)) return file
  const form = new FormData()
  form.append('photo', file)
  const jpeg = await (await send('/images/heic', { method: 'POST', body: form })).blob()
  return new File([jpeg], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
}

// Voice Transcribe: dictated audio as text, for the brief box.
export async function transcribe(audio: File): Promise<string> {
  const form = new FormData()
  form.append('audio', audio)
  return (await poll<{ transcript: string }>(request('/transcribe', { method: 'POST', body: form }))).transcript
}

// Spark reads the brief.
export function readBrief(input: BriefInput, onPhase: (phase: string) => void): Promise<BriefResult> {
  const form = new FormData()
  form.append('text', input.text)
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

// Spark drafts 3 band specs, steered by the style pictures if any; each band gets its Mixbox mix.
export async function makeConcepts(result: BriefResult, style: StyleInput, onPhase?: (phase: string) => void): Promise<ConceptSet> {
  const form = new FormData()
  form.append('brief_id', result.id)
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

// How the piece hangs on the client's wall photo: a measured line, its length, and the canvas's center (photo pixels).
export type Mockup = { line: [Point, Point]; length_cm: number; center: Point }

export async function getMockup(briefId: string): Promise<Mockup | null> {
  return (await request<{ mockup: Mockup | null }>(`/pieces/${briefId}/mockup`)).mockup
}

export async function saveMockup(briefId: string, mockup: Mockup): Promise<Mockup> {
  return (await request<{ mockup: Mockup }>(`/pieces/${briefId}/mockup`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockup),
  })).mockup
}
