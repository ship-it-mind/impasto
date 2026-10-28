import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
import type { ConceptSet } from '@/lib/api'
import { BriefScreen } from '@/screens/brief'
import { ConceptsScreen } from '@/screens/concepts'

export default function App() {
  const [concepts, setConcepts] = useState<ConceptSet | null>(null)

  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.985_0.004_80)] text-sm">
      <AppHeader step={concepts ? 'Concepts' : 'Brief'} />
      {concepts ? (
        <ConceptsScreen
          concepts={concepts.concepts}
          canvasPx={concepts.canvasPx}
          piece={concepts.piece}
          onChoose={() => {}}
        />
      ) : (
        <BriefScreen onConcepts={setConcepts} />
      )}
    </div>
  )
}
