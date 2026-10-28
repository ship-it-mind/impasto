// What the screens ask the backend for (backend/impasto/api.py, proxied at /api).
//
// Model calls run as jobs on the server: each call here starts one and polls it,
// passing the server's phase ("Transcribing the voice note…") to `onPhase`.

import type { Concept, Piece } from './concepts'
import type { BriefResult, Preset } from './brief'

export type BriefInput = { audio: File | null; text: string; wall: File | null }
export type StyleInput = { preset: string | null; references: File[]; without?: string[] }
export type ConceptSet = { concepts: Concept[]; canvasPx: [number, number]; piece: Piece }
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

type ConceptsRecord = { canvas_px: [number, number]; concepts: (Concept & { warnings: string[] })[] }

// Spark drafts 3 band specs in the chosen style; each band gets its Mixbox mix.
export async function makeConcepts(result: BriefResult, style: StyleInput, onPhase?: (phase: string) => void): Promise<ConceptSet> {
  const form = new FormData()
  form.append('brief_id', result.id)
  if (style.preset) form.append('preset', style.preset)
  style.references.forEach(file => form.append('references', file))
  style.without?.forEach(tube => form.append('without', tube))
  const record = await poll<ConceptsRecord>(request('/concepts', { method: 'POST', body: form }), onPhase)
  // A concept that broke the spec (no valid color, a flow the style doesn't allow) can't be painted.
  const usable = record.concepts.filter(c => c.warnings.length === 0)
  if (usable.length === 0) throw new Error("None of the concepts came out usable. Make them again.")
  const { piece, room } = result.brief
  return {
    concepts: usable,
    canvasPx: record.canvas_px,
    piece: { widthCm: piece.width_cm ?? 120, heightCm: piece.height_cm ?? 90, wallWidthCm: room.wall_width_cm },
  }
}
