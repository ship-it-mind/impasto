// What the screens ask the backend for.
//
// TEMPORARY: there is no API yet, so these answer from the sample output in
// src/sample (the test voice note and the Layered Horizon concepts). The FastAPI
// layer (OUR-142) replaces each function with a real call; the signatures stay.

import type { Concept, Piece } from './concepts'
import type { BriefResult, Preset } from './brief'
import sampleBrief from '@/sample/brief.json'
import sampleConcepts from '@/sample/concepts.json'
import samplePresets from '@/sample/presets.json'

export type BriefInput = { audio: File | null; text: string; wall: File | null }
export type StyleInput = { preset: string | null; references: File[] }
export type ConceptSet = { concepts: Concept[]; canvasPx: [number, number]; piece: Piece }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const SIZE = /(\d{2,3})\s*(?:x|×|by)\s*(\d{2,3})/i

export const PRESETS = samplePresets.presets as Preset[]

// Voice Transcribe (if there is a voice note), then Spark reads the brief.
export async function readBrief(input: BriefInput, onPhase: (phase: string) => void): Promise<BriefResult> {
  let transcript = input.text.trim()
  if (input.audio) {
    onPhase('Transcribing the voice note…')
    await sleep(1600)
    transcript = sampleBrief.transcript
  }
  onPhase(input.wall ? 'Reading the brief and the wall photo…' : 'Reading the brief…')
  await sleep(1800)
  const brief = structuredClone(sampleBrief.brief) as BriefResult['brief']
  if (!input.audio) {
    const size = transcript.match(SIZE)
    brief.summary = transcript.length > 200 ? `${transcript.slice(0, 200).trimEnd()}…` : transcript
    brief.piece = size ? piece(+size[1], +size[2]) : { width_cm: null, height_cm: null, orientation: null }
    brief.clarifying_question = size ? null : 'How big would you like the piece? Width by height in cm is perfect.'
  }
  return { transcript, brief }
}

// The client's answer to Spark's one clarifying question (the size).
export async function answerQuestion(result: BriefResult, answer: string): Promise<BriefResult> {
  await sleep(1200)
  const size = answer.match(SIZE)
  const brief = structuredClone(result.brief)
  if (size) brief.piece = piece(+size[1], +size[2])
  brief.clarifying_question = null
  return { ...result, brief }
}

// Spark drafts 3 band specs in the chosen style; each band gets its Mixbox mix.
export async function makeConcepts(result: BriefResult, _style: StyleInput): Promise<ConceptSet> {
  await sleep(2200)
  const { width_cm, height_cm } = result.brief.piece
  return {
    concepts: sampleConcepts.concepts as Concept[],
    canvasPx: sampleConcepts.canvas_px as [number, number],
    piece: {
      widthCm: width_cm ?? sampleConcepts.piece.widthCm,
      heightCm: height_cm ?? sampleConcepts.piece.heightCm,
      wallWidthCm: result.brief.room.wall_width_cm,
    },
  }
}

function piece(width: number, height: number): BriefResult['brief']['piece'] {
  return { width_cm: width, height_cm: height, orientation: width === height ? 'square' : width > height ? 'landscape' : 'portrait' }
}
