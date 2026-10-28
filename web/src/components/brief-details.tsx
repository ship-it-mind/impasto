import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Brief } from '@/lib/brief'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

// What Spark read from the client's brief, field by field.
export function BriefDetails({ brief }: { brief: Brief }) {
  const { piece, palette, room } = brief
  const size = piece.width_cm && piece.height_cm ? `${piece.width_cm} × ${piece.height_cm} cm, ${piece.orientation}` : null
  const tone = [palette.temperature, palette.intensity].filter(Boolean).join(', ')
  return (
    <dl className="flex flex-col">
      <Row label="Size">{size ?? <span className="text-amber-700">Not given yet</span>}</Row>
      <Row label="Colors">
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {palette.colors.map(c => (
            <span key={c.name} className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: c.approx_hex }} />
              {c.name}
            </span>
          ))}
        </span>
        {(tone || palette.avoid.length > 0) && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {[tone, palette.avoid.length && `no ${palette.avoid.join(', ')}`].filter(Boolean).join(' · ')}
          </span>
        )}
      </Row>
      <Row label="Mood & style">{[...brief.mood, ...brief.style].join(', ') || '—'}</Row>
      <Row label="Room">
        {[room.name, room.placement, room.wall_width_cm && `wall ${room.wall_width_cm} cm wide`].filter(Boolean).join(', ') || '—'}
        {room.wall_color_hex && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-3 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: room.wall_color_hex }} />
            Wall color from the photo
          </span>
        )}
      </Row>
      <Row label="Budget">{brief.budget ?? '—'}</Row>
      <Row label="Deadline">{brief.deadline ?? '—'}</Row>
    </dl>
  )
}

// The one follow-up Spark may ask: the size, when the client didn't give it.
export function QuestionForm({ question, onAnswer }: { question: string; onAnswer: (answer: string) => Promise<void> }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()
  return (
    <form
      className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3"
      onSubmit={async e => {
        e.preventDefault()
        if (!answer.trim()) return
        setBusy(true)
        await onAnswer(answer)
        setBusy(false)
      }}
    >
      <label htmlFor={id} className="text-amber-950">{question}</label>
      <div className="flex gap-2">
        <input
          id={id}
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="e.g. 120 × 80"
          autoComplete="off"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 rounded-md bg-background px-3 text-base shadow-[0_0_0_1px_rgb(0_0_0/0.12)] outline-none focus-visible:shadow-[0_0_0_2px_var(--foreground)] md:text-sm"
        />
        <Button type="submit" disabled={busy || !answer.trim()}>{busy ? 'Updating…' : 'Answer'}</Button>
      </div>
    </form>
  )
}
