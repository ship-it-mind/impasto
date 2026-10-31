import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AppHeader, type Step } from '@/components/app-header'
import { editConcept, getPresets, openPiece, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import type { Recipe } from '@/lib/recipe'
import { CheckInsScreen } from '@/screens/checkins'
import { BriefScreen } from '@/screens/brief'
import { ConceptsScreen } from '@/screens/concepts'
import { PaintScreen } from '@/screens/paint'
import { RecipeScreen } from '@/screens/recipe'

// One piece as far as it has got: its brief, concepts, the chosen one and its recipe.
type Piece = { brief?: BriefResult; set?: ConceptSet; pick?: number; recipe?: Recipe; making?: string }

const SLUGS: Record<Step, string> = { Brief: 'brief', Concepts: 'concepts', Recipe: 'recipe', Paint: 'paint', 'Check-ins': 'checkins' }

function reachable(p: Piece): Step[] {
  return [
    'Brief',
    ...(p.set ? ['Concepts' as const] : []),
    ...(p.set && p.pick !== undefined ? ['Recipe' as const] : []),
    ...(p.recipe ? ['Paint' as const, 'Check-ins' as const] : []),
  ]
}

// The address says which piece and step is open, so a reload or the back button comes back to it.
function readUrl(): { id: string | null; step: Step | null } {
  const params = new URLSearchParams(location.search)
  const slug = params.get('step')
  return { id: params.get('piece'), step: (Object.keys(SLUGS) as Step[]).find(s => SLUGS[s] === slug) ?? null }
}

// A screen mounts on its first visit and then stays, hidden, while you're elsewhere, so
// coming back finds it as you left it: what you typed and picked, jobs still running.
function Kept({ active, children }: { active: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(active)
  if (active && !seen) setSeen(true)
  return seen ? <div className={active ? 'contents' : 'hidden'}>{children}</div> : null
}

export default function App() {
  const [piece, setPiece] = useState<Piece>({})
  const [step, setStep] = useState<Step>('Brief')
  // Goes up when another piece opens, which starts every screen afresh.
  const [session, setSession] = useState(0)
  const [opening, setOpening] = useState(() => readUrl().id !== null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [tubes, setTubes] = useState<string[]>([])
  useEffect(() => { getPresets().then(p => setTubes(p.tubes)).catch(() => {}) }, [])

  const go = useCallback((next: Step, p: Piece) => {
    setPiece(p)
    setStep(next)
    const url = p.brief ? `?piece=${p.brief.id}&step=${SLUGS[next]}` : location.pathname
    if (url !== location.search) history.pushState(null, '', url)
    window.scrollTo(0, 0)
  }, [])

  // Open the piece the address names, at its step, or as far as it got.
  const fromUrl = useCallback(async (loaded: Piece) => {
    const { id, step: wanted } = readUrl()
    if (!id) { setPiece({}); setStep('Brief'); setSession(s => s + 1); return }
    let p = loaded
    if (loaded.brief?.id !== id) {
      setOpening(true)
      setOpenError(null)
      try {
        p = await openPiece(id)
      } catch (e) {
        setOpenError(e instanceof Error ? e.message : "Couldn't open that piece.")
        p = {}
      } finally {
        setOpening(false)
      }
      setSession(s => s + 1)
    }
    const steps = reachable(p)
    const next = wanted && steps.includes(wanted) ? wanted : steps[steps.length - 1]
    setPiece(p)
    setStep(next)
    if (p.brief) history.replaceState(null, '', `?piece=${p.brief.id}&step=${SLUGS[next]}`)
  }, [])

  useEffect(() => { fromUrl({}) }, [fromUrl])
  useEffect(() => {
    const back = () => { fromUrl(piece) }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [fromUrl, piece])

  const { brief, set, pick, recipe } = piece
  const concept = set && pick !== undefined ? set.concepts[pick] : undefined

  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.985_0.004_80)] text-sm">
      <AppHeader step={step} reachable={reachable(piece)} onStep={s => go(s, piece)} onHome={() => { setSession(s => s + 1); go('Brief', {}) }} />
      {opening && <p className="px-6 py-10 text-center text-muted-foreground lg:px-10">Opening the piece…</p>}
      {!opening && (
        <Kept key={`brief-${session}`} active={step === 'Brief'}>
          <BriefScreen
            initial={brief}
            joining={piece.making}
            openError={openError}
            hasConcepts={!!set}
            onShowConcepts={() => go('Concepts', piece)}
            onOpen={id => { history.pushState(null, '', `?piece=${id}`); fromUrl({}) }}
            onBrief={b => go('Brief', brief?.id === b.id ? { ...piece, brief: b } : { brief: b })}
            onConcepts={(newSet, newBrief) => go('Concepts', { brief: newBrief, set: newSet })}
          />
        </Kept>
      )}
      {!opening && brief && set && (
        <Kept key={`concepts-${session}`} active={step === 'Concepts'}>
          <ConceptsScreen
            key={set.run}
            concepts={set.concepts}
            canvasPx={set.canvasPx}
            piece={set.piece}
            initialPick={pick}
            active={step === 'Concepts'}
            photo={brief.wall ? { briefId: brief.id, url: brief.wall } : undefined}
            onChoose={p => go('Recipe', p === pick ? piece : { brief, set, pick: p })}
            onEdit={async (c, change, onPhase) => {
              const edited = await editConcept(brief, set, c, change, onPhase)
              setPiece(p => (p.set?.run === set.run ? { ...p, set: { ...p.set, concepts: [...p.set.concepts, edited] } } : p))
              return edited
            }}
          />
        </Kept>
      )}
      {!opening && brief && set && concept && pick !== undefined && (
        <Kept key={`recipe-${session}`} active={step === 'Recipe'}>
          <RecipeScreen
            key={`${set.run}-${pick}`}
            brief={brief}
            set={set}
            concept={concept}
            seed={pick + 1}
            tubes={tubes}
            initialRecipe={recipe}
            onRecipe={r => setPiece(p => (p.set?.run === set.run && p.pick === pick ? { ...p, recipe: r } : p))}
            onBack={() => go('Concepts', piece)}
            onPaint={() => go('Paint', piece)}
          />
        </Kept>
      )}
      {!opening && brief && set && concept && pick !== undefined && recipe && (
        <Kept key={`paint-${session}`} active={step === 'Paint'}>
          <PaintScreen
            key={`${set.run}-${pick}-${recipe.mixing.paste_in_mix}-${recipe.mixing.without.join()}`}
            brief={brief}
            set={set}
            concept={concept}
            seed={pick + 1}
            recipe={recipe}
            active={step === 'Paint'}
            onBack={() => go('Recipe', piece)}
            onCheckIns={() => go('Check-ins', piece)}
          />
        </Kept>
      )}
      {!opening && brief && set && concept && pick !== undefined && recipe && (
        <Kept key={`checkins-${session}`} active={step === 'Check-ins'}>
          <CheckInsScreen
            key={`${set.run}-${pick}`}
            brief={brief}
            set={set}
            concept={concept}
            seed={pick + 1}
            recipe={recipe}
            onBack={() => go('Paint', piece)}
          />
        </Kept>
      )}
    </div>
  )
}
