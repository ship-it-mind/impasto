import { useEffect, useState } from 'react'
import { listPieces, type PieceSummary } from '@/lib/api'
import { when } from '@/lib/checkin'

function progress(p: PieceSummary): string {
  if (!p.concept) return p.concepts ? 'Concepts made' : 'Brief read'
  const checkins = p.concept.checkins
  if (checkins) return `${p.concept.title} · ${checkins} check-in${checkins > 1 ? 's' : ''}`
  return p.concept.recipe ? `${p.concept.title} · recipe made` : p.concept.title
}

function Row({ piece: p, onOpen }: { piece: PieceSummary; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(p.id)}
        className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 border-b py-2.5 text-left"
      >
        {p.concept?.image
          ? <img src={p.concept.image} alt="" className="h-9 w-12 rounded-sm object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />
          : <span aria-hidden className="h-9 w-12 rounded-sm bg-muted" />}
        <span className="flex min-w-0 flex-col">
          <span className="truncate group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{p.summary}</span>
          <span className="truncate text-xs text-muted-foreground">{progress(p)}</span>
        </span>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{p.example ? 'Example' : when(p.updated)}</span>
      </button>
    </li>
  )
}

// The example piece, to look through a finished one, then pieces read before, latest first, to carry on with one.
export function PieceList({ onOpen }: { onOpen: (id: string) => void }) {
  const [pieces, setPieces] = useState<PieceSummary[]>([])
  useEffect(() => { listPieces().then(setPieces).catch(() => {}) }, [])
  const examples = pieces.filter(p => p.example), own = pieces.filter(p => !p.example)

  return (
    <>
      {examples.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="example">
          <h2 id="example" className="text-xs font-medium text-muted-foreground">See it all the way through</h2>
          <p className="text-xs text-pretty text-muted-foreground">A real painting, recorded from the first brief to the last check-in. Open it to look through every step, without your own photos.</p>
          <ul>{examples.map(p => <Row key={p.id} piece={p} onOpen={onOpen} />)}</ul>
        </section>
      )}
      {own.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="pieces">
          <h2 id="pieces" className="text-xs font-medium text-muted-foreground">Carry on with a piece</h2>
          <ul>{own.map(p => <Row key={p.id} piece={p} onOpen={onOpen} />)}</ul>
        </section>
      )}
    </>
  )
}
