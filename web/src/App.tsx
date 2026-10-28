import { useEffect, useState } from 'react'
import { AppHeader, type Step } from '@/components/app-header'
import { getPresets, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { BriefScreen } from '@/screens/brief'
import { ConceptsScreen } from '@/screens/concepts'
import { RecipeScreen } from '@/screens/recipe'

type Flow =
  | { step: 'Brief' }
  | { step: 'Concepts'; brief: BriefResult; set: ConceptSet; pick?: number }
  | { step: 'Recipe'; brief: BriefResult; set: ConceptSet; pick: number }

export default function App() {
  const [flow, setFlow] = useState<Flow>({ step: 'Brief' })
  const [tubes, setTubes] = useState<string[]>([])
  useEffect(() => { getPresets().then(p => setTubes(p.tubes)).catch(() => {}) }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.985_0.004_80)] text-sm">
      <AppHeader step={flow.step as Step} />
      {flow.step === 'Brief' && <BriefScreen onConcepts={(set, brief) => setFlow({ step: 'Concepts', brief, set })} />}
      {flow.step === 'Concepts' && (
        <ConceptsScreen
          concepts={flow.set.concepts}
          canvasPx={flow.set.canvasPx}
          piece={flow.set.piece}
          initialPick={flow.pick}
          onChoose={pick => setFlow({ step: 'Recipe', brief: flow.brief, set: flow.set, pick })}
        />
      )}
      {flow.step === 'Recipe' && (
        <RecipeScreen
          brief={flow.brief}
          set={flow.set}
          concept={flow.set.concepts[flow.pick]}
          seed={flow.pick + 1}
          tubes={tubes}
          onBack={() => setFlow({ step: 'Concepts', brief: flow.brief, set: flow.set, pick: flow.pick })}
        />
      )}
    </div>
  )
}
