import { useEffect, useState } from 'react'
import { listPieces, type PieceSummary } from '@/lib/api'
import { when } from '@/lib/checkin'

function progress(p: PieceSummary): string {
  if (!p.concept) return p.concepts ? 'Concepts made' : 'Brief read'
  const checkins = p.concept.checkins
  return `${p.concept.title} · ${checkins ? `${checkins} check-in${checkins > 1 ? 's' : ''}` : 'recipe made'}`
}

// Pieces read before, latest first, to carry on with one.
export function PieceList({ onOpen }: { onOpen: (id: string) => void }) {
  const [pieces, setPieces] = useState<PieceSummary[]>([])
  useEffect(() => { listPieces().then(setPieces).catch(() => {}) }, [])
  if (pieces.length === 0) return null

  return (
    <section className="flex flex-col gap-2" aria-labelledby="pieces">
      <h2 id="pieces" className="text-xs font-medium text-muted-foreground">Carry on with a piece</h2>
      <ul>
        {pieces.map(p => (
          <li key={p.id}>
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
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{when(p.updated)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
