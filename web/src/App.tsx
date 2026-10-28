import { AppHeader } from '@/components/app-header'
import type { Concept, Piece } from '@/lib/concepts'
import { ConceptsScreen } from '@/screens/concepts'
// Sample output of impasto.concepts (Layered Horizon test brief, without Raw Umber
// and Burnt Sienna) until the API serves real runs.
import sample from '@/sample/concepts.json'

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.985_0.004_80)] text-sm">
      <AppHeader step="Concepts" />
      <ConceptsScreen
        concepts={sample.concepts as Concept[]}
        canvasPx={sample.canvas_px as [number, number]}
        piece={sample.piece as Piece}
        onChoose={() => {}}
      />
    </div>
  )
}
