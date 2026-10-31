import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowUp, LoaderCircle, SquareDashedMousePointer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Area, Concept } from '@/lib/concepts'
import { cn } from '@/lib/utils'

// A drag smaller than this share of the canvas is a slip, not a selection.
const MIN_AREA = 0.02

// The painting, large, to drag an area on: small on the wall, it would be hard to hit.
export function AreaPicker({ ratio, area, onArea, children }: { ratio: number; area: Area | null; onArea: (area: Area | null) => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const start = useRef<[number, number] | null>(null)
  const [dragged, setDragged] = useState<Area | null>(null)
  const shown = dragged ?? area

  const at = (e: PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }
  const between = (a: [number, number], b: [number, number]): Area => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]

  return (
    <div
      ref={box}
      onPointerDown={e => { start.current = at(e); setDragged(null); e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { if (start.current) setDragged(between(start.current, at(e))) }}
      onPointerUp={e => {
        if (!start.current) return
        const next = between(start.current, at(e))
        start.current = null
        setDragged(null)
        onArea(next[2] - next[0] > MIN_AREA && next[3] - next[1] > MIN_AREA ? next : null)
      }}
      onPointerCancel={() => { start.current = null; setDragged(null) }}
      className="relative mx-auto w-full cursor-crosshair touch-none overflow-hidden rounded-xl select-none"
      style={{ maxWidth: `calc((100dvh - 12rem) * ${ratio})` }}
    >
      <div className="pointer-events-none">{children}</div>
      {shown && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6),0_0_0_100vmax_rgb(0_0_0/0.35)]"
          style={{ left: `${shown[0] * 100}%`, top: `${shown[1] * 100}%`, width: `${(shown[2] - shown[0]) * 100}%`, height: `${(shown[3] - shown[1]) * 100}%` }}
        />
      )}
    </div>
  )
}

type ConceptChatProps = {
  // The concept's versions, the original first.
  versions: Concept[]
  current: Concept
  onShow: (version: Concept) => void
  area: Area | null
  selecting: boolean
  onSelecting: (selecting: boolean) => void
  onClearArea: () => void
  // Rejects with what went wrong. onPhase says what it's doing.
  onSend: (message: string, onPhase: (phase: string) => void) => Promise<void>
  onBusy: (busy: boolean) => void
}

// A chat to change the painting, about all of it or a selected area. Each answer is a new
// version of the painting, and any earlier one can be gone back to.
export function ConceptChat({ versions, current, onShow, area, selecting, onSelecting, onClearArea, onSend, onBusy }: ConceptChatProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ message: string; onArea: boolean } | null>(null)
  const [phase, setPhase] = useState('Starting…')
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0 && !pending

  const send = async () => {
    if (!canSend) return
    const message = text.trim()
    setError(null)
    setPending({ message, onArea: !!area })
    setPhase('Starting…')
    setText('')
    onBusy(true)
    try {
      await onSend(message, setPhase)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the painting. Try again.")
      setText(message)
    } finally {
      setPending(null)
      onBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Change the painting">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Change something</h2>
        {versions.length === 1 && !pending && (
          <p className="text-xs text-pretty text-muted-foreground">Say what to change in the painting, or select an area first to comment on just that part.</p>
        )}
      </div>

      {(versions.length > 1 || pending) && (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {versions.map((version, i) => (
            <li key={version.index} className="flex flex-col gap-2">
              {version.edit && <Asked message={version.edit.message} onArea={!!version.edit.area} />}
              <button
                type="button"
                aria-pressed={version === current}
                onClick={() => onShow(version)}
                className={cn(
                  'flex items-center gap-2 self-start rounded-lg p-1 pr-3 text-xs transition-colors duration-150 ease-out',
                  version === current ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {version.layout && <img src={version.layout.image} alt="" draggable={false} className="size-9 rounded object-cover -outline-offset-1 outline-1 outline-black/10" />}
                {i === 0 ? 'Original' : `Version ${i + 1}`}
                {version === current && <span className="text-muted-foreground">· showing</span>}
              </button>
            </li>
          ))}
          {pending && (
            <li className="flex flex-col gap-2">
              <Asked message={pending.message} onArea={pending.onArea} />
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />{phase}</p>
            </li>
          )}
        </ol>
      )}

      {error && <p role="alert" className="text-xs text-pretty text-destructive">{error}</p>}

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="flex flex-col gap-1 rounded-xl bg-background p-2 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.05)]"
      >
        {area && (
          <span className="flex items-center gap-1 self-start rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs">
            Selected area
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear the selected area" onClick={onClearArea}><X /></Button>
          </span>
        )}
        <textarea
          ref={box}
          aria-label={area ? 'What to change in the selected area' : 'What to change in the painting'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={area ? 'What should change here?' : 'What should change?'}
          rows={2}
          maxLength={1000}
          className="field-sizing-content max-h-40 min-h-12 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant={selecting ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={selecting}
            onClick={() => { onSelecting(!selecting); box.current?.focus() }}
          >
            <SquareDashedMousePointer /> {selecting ? 'Done selecting' : area ? 'Change the area' : 'Select an area'}
          </Button>
          <Button type="submit" size="icon-sm" aria-label="Send" disabled={!canSend} className="rounded-full">
            {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </form>
    </section>
  )
}

function Asked({ message, onArea }: { message: string; onArea: boolean }) {
  return (
    <p className="max-w-[90%] self-end rounded-lg bg-muted px-3 py-2 text-pretty">
      {onArea && <span className="mb-0.5 block text-xs text-muted-foreground">On the selected area</span>}
      {message}
    </p>
  )
}
