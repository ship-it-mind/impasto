// What the screens ask the backend for (backend/impasto/api.py, proxied at /api).
//
// Model calls run as jobs on the server: each call here starts one and polls it,
// passing the server's phase ("Reading the brief…") to `onPhase`.

import type { CheckIn, CheckInInput, Point } from './checkin'
import type { Asked, Checks, MixCheck, StepCheck } from './checks'
import type { Concept, Piece, Segment } from './concepts'
import type { BriefResult } from './brief'
import type { Guide } from './guide'
import type { MixSettings, PasteAdvice, Recipe } from './recipe'
import type { HaveMap, Supplies } from './supplies'
import type { Mockup, SizeCm } from './wall'

export type BriefInput = { text: string; wall: File | null }
// exact: a picture to paint as it is, in place of style pictures; corners: the painting's corners in it, in its own pixels.
export type StyleInput = { references: File[]; without?: string[]; exact?: File; corners?: Point[] }
export type ConceptSet = { run: string; concepts: Concept[]; canvasPx: [number, number]; piece: Piece }
export type Presets = { tubes: string[] }

export type Account = { id: string; email: string }

const POLL_MS = 700

let signedOutListener: (() => void) | null = null

// Told when the server stops recognizing this browser's session. Returns how to stop listening.
export function whenSignedOut(listener: () => void): () => void {
  signedOutListener = listener
  return () => { signedOutListener = null }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api${path}`, init)
  // A 401 from signing in only means the password was wrong.
  if (response.status === 401 && !path.startsWith('/auth/')) signedOutListener?.()
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

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

// Who's signed in on this browser, if anyone.
export async function currentAccount(): Promise<Account | null> {
  return (await request<{ user: Account | null }>('/auth/me')).user
}

export async function signIn(email: string, password: string): Promise<Account> {
  return (await postJson<{ user: Account }>('/auth/signin', { email, password })).user
}

export async function signUp(email: string, password: string, invite: string): Promise<Account> {
  return (await postJson<{ user: Account }>('/auth/signup', { email, password, invite })).user
}

export async function signOut(): Promise<void> {
  await send('/auth/signout', { method: 'POST' })
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

type ConceptsRecord = { run: string; canvas_px: [number, number]; concepts: (Concept & { warnings: string[]; index: number })[] }
// The concepts, and the brief at the size they were made for.
export type MadeConcepts = { set: ConceptSet; brief: BriefResult }
// The size settled on, and where the piece hangs at it: kept once the concepts are made.
export type Settled = { size: SizeCm; mockup?: Mockup | null }

// Spark drafts 3 band specs, steered by the style pictures if any; each band gets its Mixbox mix.
// An exact picture gives one concept instead, read straight off the picture.
export function makeConcepts(result: BriefResult, style: StyleInput, settled: Settled, onPhase?: (phase: string) => void): Promise<MadeConcepts> {
  const form = new FormData()
  form.append('brief_id', result.id)
  form.append('width_cm', String(settled.size.w))
  form.append('height_cm', String(settled.size.h))
  if (settled.mockup) form.append('mockup', JSON.stringify(settled.mockup))
  style.references.forEach(file => form.append('references', file))
  style.without?.forEach(tube => form.append('without', tube))
  if (style.exact) form.append('exact', style.exact)
  style.corners?.forEach(c => form.append('corners', c.join(',')))
  return usableConcepts(request('/concepts', { method: 'POST', body: form }), onPhase)
}

// The painting's corners in a picture to paint, in its own pixels. null: nothing around it to cut away, or no clear painting.
export async function findPainting(picture: File): Promise<Point[] | null> {
  const form = new FormData()
  form.append('picture', picture)
  return (await poll<{ corners: Point[] | null }>(request('/images/painting', { method: 'POST', body: form }))).corners
}

// Concepts already being made for this piece, from before a reload.
export function joinConcepts(job: string, onPhase?: (phase: string) => void): Promise<MadeConcepts> {
  return usableConcepts(Promise.resolve({ job }), onPhase)
}

async function usableConcepts(start: Promise<{ job: string }>, onPhase?: (phase: string) => void): Promise<MadeConcepts> {
  const { brief, ...record } = await poll<ConceptsRecord & { brief: BriefResult }>(start, onPhase)
  const set = conceptSet(record, brief)
  if (set.concepts.length === 0) throw new Error("None of the concepts came out usable. Make them again.")
  return { set, brief }
}

// A concept that broke the spec (no valid color, no composition) can't be painted.
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

// A change the painter asked for: Muse Image repaints the concept, and it comes back as a new version in the run.
export type ConceptChange = { message: string; segments: Segment[] }

export async function editConcept(result: BriefResult, set: ConceptSet, concept: Concept, change: ConceptChange, onPhase?: (phase: string) => void): Promise<Concept> {
  const edited = await poll<{ concept: Concept; index: number }>(request(`/concepts/${result.id}/${set.run}/${concept.index}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  }), onPhase)
  return { ...edited.concept, index: edited.index }
}

// A piece read earlier, for the list to reopen it from.
export type PieceSummary = {
  id: string
  summary: string
  updated: string
  concepts: boolean
  concept: { title: string; image: string | null; recipe: boolean; checkins: number } | null
}

export async function listPieces(): Promise<PieceSummary[]> {
  return (await request<{ pieces: PieceSummary[] }>('/pieces')).pieces
}

// A piece as it was left: the brief, its latest concepts, the chosen concept (its place
// among the usable ones, as the screens count them) with its saved recipe, and the job
// making its next concepts, if one is running.
export type OpenedPiece = { brief: BriefResult; set?: ConceptSet; pick?: number; recipe?: Recipe; making?: string }

export async function openPiece(id: string): Promise<OpenedPiece> {
  const saved = await request<{ brief: BriefResult; concepts?: ConceptsRecord; chosen?: number; recipe?: Recipe | null; making: string | null }>(`/pieces/${id}`)
  const making = saved.making ?? undefined
  if (!saved.concepts) return { brief: saved.brief, making }
  const set = conceptSet(saved.concepts, saved.brief)
  const pick = set.concepts.findIndex(c => c.index === saved.chosen)
  return pick < 0 ? { brief: saved.brief, set, making } : { brief: saved.brief, set, pick, recipe: saved.recipe ?? undefined, making }
}

// Keep the concept (and mixing settings) picked to paint, and get the recipe already made
// for them, if any. With no settings, the ones this concept last used.
export async function chooseRecipe(result: BriefResult, set: ConceptSet, concept: Concept, settings?: MixSettings): Promise<Recipe | null> {
  return (await request<{ recipe: Recipe | null }>(`/pieces/${result.id}/choice`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      run: set.run, concept: concept.index,
      ...(settings && { without: settings.without, paste_in_mix: settings.pasteInMix }),
    }),
  })).recipe
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

// Paste mixed in or underneath: which suits this painting, and what each way can mix from these tubes.
export function getPasteAdvice(result: BriefResult, set: ConceptSet, concept: Concept, without: string[]): Promise<PasteAdvice> {
  const query = new URLSearchParams({ run: set.run, concept: String(concept.index) })
  without.forEach(tube => query.append('without', tube))
  return request(`/pieces/${result.id}/method?${query}`)
}

// The tools this painting needs with this paste method, and what's already owned for this piece.
export function getSupplies(result: BriefResult, set: ConceptSet, concept: Concept, pasteInMix: boolean): Promise<Supplies> {
  const query = new URLSearchParams({ run: set.run, concept: String(concept.index), paste_in_mix: String(pasteInMix) })
  return request(`/pieces/${result.id}/supplies?${query}`)
}

export async function saveSupplies(briefId: string, have: HaveMap): Promise<void> {
  await send(`/pieces/${briefId}/supplies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ have }),
  })
}

// How to paint the concept, for one recipe. Spark writes it the first time; after that it comes back as it was.
export function makeGuide(result: BriefResult, set: ConceptSet, concept: Concept, settings: MixSettings, onPhase?: (phase: string) => void): Promise<Guide> {
  return poll(request('/guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief_id: result.id, run: set.run, concept: concept.index, without: settings.without, paste_in_mix: settings.pasteInMix }),
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
  if (input.white) form.append('white', input.white.join(','))
  input.corners.forEach(c => form.append('corners', c.join(',')))
  if (input.ground) form.append('ground', input.ground.join(','))
  return poll(request('/checkins', { method: 'POST', body: form }), onPhase)
}

// Every check-in on this concept so far, oldest first.
export async function listCheckIns(result: BriefResult, set: ConceptSet, concept: Concept): Promise<CheckIn[]> {
  const query = new URLSearchParams({ brief_id: result.id, run: set.run, concept: String(concept.index) })
  return (await request<{ checkins: CheckIn[] }>(`/checkins?${query}`)).checkins
}

// Step and mix checks on this concept, oldest first, and the chat.
export function listChecks(result: BriefResult, set: ConceptSet, concept: Concept): Promise<Checks> {
  const query = new URLSearchParams({ brief_id: result.id, run: set.run, concept: String(concept.index) })
  return request(`/checks?${query}`)
}

function checkForm(result: BriefResult, set: ConceptSet, concept: Concept, photo: File): FormData {
  const form = new FormData()
  form.append('brief_id', result.id)
  form.append('run', set.run)
  form.append('concept', String(concept.index))
  form.append('photo', photo)
  return form
}

// Spark's look at a photo of one guide step. expected: how the canvas should look after it, as the guide draws it.
export function checkStep(result: BriefResult, set: ConceptSet, concept: Concept, step: string, photo: File, expected: Blob, onPhase?: (phase: string) => void): Promise<StepCheck> {
  const form = checkForm(result, set, concept, photo)
  form.append('step', step)
  form.append('expected', expected, 'expected.jpg')
  return poll(request('/step-checks', { method: 'POST', body: form }), onPhase)
}

// The paint in the bowl, measured against the recipe. Paint and white are found in the photo; marks, in its own pixels, override them.
export function checkMix(result: BriefResult, set: ConceptSet, concept: Concept, photo: File, band: number, marks: { paint?: Point; white?: Point }, onPhase?: (phase: string) => void): Promise<MixCheck> {
  const form = checkForm(result, set, concept, photo)
  form.append('band', String(band))
  if (marks.paint) form.append('paint', marks.paint.join(','))
  if (marks.white) form.append('white', marks.white.join(','))
  return poll(request('/mix-checks', { method: 'POST', body: form }), onPhase)
}

// A question for Spark about this painting. section: what the painter has open as they ask.
export function askQuestion(result: BriefResult, set: ConceptSet, concept: Concept, question: string, section: string | null, onPhase?: (phase: string) => void): Promise<Asked> {
  return poll(request('/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief_id: result.id, run: set.run, concept: concept.index, question, section }),
  }), onPhase)
}

// How the piece hangs on the client's wall photo.
export async function getMockup(briefId: string): Promise<Mockup | null> {
  return (await request<{ mockup: Mockup | null }>(`/pieces/${briefId}/mockup`)).mockup
}

// Muse Image's photo of the piece really hung on the wall, from the flat mockup and the painting on its own. Its URL.
export async function hangOnWall(briefId: string, mockup: Blob, painting: Blob, onPhase?: (phase: string) => void): Promise<string> {
  const form = new FormData()
  form.append('mockup', mockup, 'mockup.png')
  form.append('painting', painting, 'painting.png')
  return (await poll<{ url: string }>(request(`/pieces/${briefId}/wall/hung`, { method: 'POST', body: form }), onPhase)).url
}

export async function saveMockup(briefId: string, mockup: Mockup): Promise<Mockup> {
  return (await request<{ mockup: Mockup }>(`/pieces/${briefId}/mockup`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockup),
  })).mockup
}
