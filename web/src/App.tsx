import { useCallback, useEffect, useState } from 'react'
import { AppHeader, type Step } from '@/components/app-header'
import { getPresets, openPiece, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import type { Recipe } from '@/lib/recipe'
import { CheckInsScreen } from '@/screens/checkins'
import { BriefScreen } from '@/screens/brief'
import { ConceptsScreen } from '@/screens/concepts'
import { RecipeScreen } from '@/screens/recipe'

// One piece as far as it has got: its brief, concepts, the chosen one and its recipe.
type Piece = { brief?: BriefResult; set?: ConceptSet; pick?: number; recipe?: Recipe }

const SLUGS: Record<Step, string> = { Brief: 'brief', Concepts: 'concepts', Recipe: 'recipe', 'Check-ins': 'checkins' }

function reachable(p: Piece): Step[] {
  return [
    'Brief',
    ...(p.set ? ['Concepts' as const] : []),
    ...(p.set && p.pick !== undefined ? ['Recipe' as const] : []),
    ...(p.recipe ? ['Check-ins' as const] : []),
  ]
}

// The address says which piece and step is open, so a reload or the back button comes back to it.
function readUrl(): { id: string | null; step: Step | null } {
  const params = new URLSearchParams(location.search)
  const slug = params.get('step')
  return { id: params.get('piece'), step: (Object.keys(SLUGS) as Step[]).find(s => SLUGS[s] === slug) ?? null }
}

export default function App() {
  const [piece, setPiece] = useState<Piece>({})
  const [step, setStep] = useState<Step>('Brief')
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
    if (!id) { setPiece({}); setStep('Brief'); return }
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
      <AppHeader step={step} reachable={reachable(piece)} onStep={s => go(s, piece)} onHome={() => go('Brief', {})} />
      {opening && <p className="px-6 py-10 text-center text-muted-foreground lg:px-10">Opening the piece…</p>}
      {!opening && step === 'Brief' && (
        <BriefScreen
          key={brief?.id ?? 'new'}
          initial={brief}
          openError={openError}
          onOpen={id => { history.pushState(null, '', `?piece=${id}`); fromUrl({}) }}
          onConcepts={(newSet, newBrief) => go('Concepts', { brief: newBrief, set: newSet })}
        />
      )}
      {!opening && step === 'Concepts' && brief && set && (
        <ConceptsScreen
          concepts={set.concepts}
          canvasPx={set.canvasPx}
          piece={set.piece}
          initialPick={pick}
          photo={brief.wall ? { briefId: brief.id, url: brief.wall } : undefined}
          onChoose={p => go('Recipe', p === pick ? piece : { brief, set, pick: p })}
        />
      )}
      {!opening && step === 'Recipe' && brief && set && concept && pick !== undefined && (
        <RecipeScreen
          key={`${set.run}-${pick}`}
          brief={brief}
          set={set}
          concept={concept}
          seed={pick + 1}
          tubes={tubes}
          initialRecipe={recipe}
          onRecipe={r => setPiece(p => ({ ...p, recipe: r }))}
          onBack={() => go('Concepts', piece)}
          onCheckIns={() => go('Check-ins', piece)}
        />
      )}
      {!opening && step === 'Check-ins' && brief && set && concept && pick !== undefined && recipe && (
        <CheckInsScreen
          brief={brief}
          set={set}
          concept={concept}
          seed={pick + 1}
          recipe={recipe}
          onBack={() => go('Recipe', piece)}
        />
      )}
    </div>
  )
}
