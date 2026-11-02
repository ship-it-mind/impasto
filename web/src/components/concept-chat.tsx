import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowUp, LoaderCircle, MousePointerClick, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadLayout } from '@/lib/band-map'
import type { Concept, Segment } from '@/lib/concepts'
import { drawSegments, findSegments, labelAt, type SegmentMap } from '@/lib/segments'
import { cn } from '@/lib/utils'
import { useExample } from '@/lib/example'

// The painting, large, to tap segments on: small on the wall, they would be hard to hit. map: its band map.
export function SegmentPicker({ ratio, map, segments, onSegments, children }: { ratio: number; map: string; segments: Segment[]; onSegments: (segments: Segment[]) => void; children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [found, setFound] = useState<SegmentMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    let stop = false
    loadLayout(map).then(layout => { if (!stop) setFound(findSegments(layout)) }).catch(() => { if (!stop) setFailed(true) })
    return () => { stop = true }
  }, [map])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx && found) drawSegments(ctx, found, new Set(segments.map(s => labelAt(found, s))), hovered)
  }, [found, segments, hovered])

  // Where a pointer is, as shares of the canvas, at the middle of the map's pixel so it finds the same one on the server.
  const pointAt = (e: MouseEvent, { w, h }: SegmentMap): Segment => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * w)))
    const y = Math.min(h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * h)))
    return [(x + 0.5) / w, (y + 0.5) / h]
  }
  const toggle = (e: MouseEvent) => {
    if (!found) return
    const point = pointAt(e, found), label = labelAt(found, point)
    const others = segments.filter(s => labelAt(found, s) !== label)
    onSegments(others.length < segments.length ? others : [...segments, point])
  }

  return (
    <div className="flex flex-col gap-2">
      {failed && <p role="alert" className="text-xs text-destructive">Couldn't read this painting's segments. Try again.</p>}
      <div
        onClick={toggle}
        onPointerMove={e => { if (found && e.pointerType === 'mouse') setHovered(labelAt(found, pointAt(e, found))) }}
        onPointerLeave={() => setHovered(null)}
        className={cn('relative mx-auto w-full overflow-hidden rounded-xl select-none', found && 'cursor-pointer')}
        style={{ maxWidth: `calc((100dvh - 12rem) * ${ratio})` }}
      >
        <div className="pointer-events-none">{children}</div>
        {found && <canvas ref={canvas} aria-hidden width={found.w} height={found.h} className="pointer-events-none absolute inset-0 size-full" />}
      </div>
    </div>
  )
}

type ConceptChatProps = {
  // The concept's versions, the original first.
  versions: Concept[]
  current: Concept
  onShow: (version: Concept) => void
  segments: Segment[]
  selecting: boolean
  onSelecting: (selecting: boolean) => void
  onClearSegments: () => void
  // Rejects with what went wrong. onPhase says what it's doing.
  onSend: (message: string, onPhase: (phase: string) => void) => Promise<void>
  onBusy: (busy: boolean) => void
}

// A chat to change the painting, about all of it or selected segments. Each answer is a new
// version of the painting, and any earlier one can be gone back to.
export function ConceptChat({ versions, current, onShow, segments, selecting, onSelecting, onClearSegments, onSend, onBusy }: ConceptChatProps) {
  const example = useExample()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ message: string; onPart: boolean } | null>(null)
  const [phase, setPhase] = useState('Starting…')
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0 && !pending

  const send = async () => {
    if (!canSend) return
    const message = text.trim()
    setError(null)
    setPending({ message, onPart: segments.length > 0 })
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
        {versions.length === 1 && !pending && !example && (
          <p className="text-xs text-pretty text-muted-foreground">Say what to change in the painting, or select a segment first to change just that part.</p>
        )}
        {example && <p className="text-xs text-pretty text-muted-foreground">{versions.length > 1 ? 'What was asked when it was painted, and each version Muse Image made. Tap one to see it.' : 'Nothing was changed on this one when it was painted.'}</p>}
      </div>

      {(versions.length > 1 || pending) && (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {versions.map((version, i) => (
            <li key={version.index} className="flex flex-col gap-2">
              {version.edit && <Asked message={version.edit.message} onPart={!!version.edit.segments?.length || !!version.edit.area} />}
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
              <Asked message={pending.message} onPart={pending.onPart} />
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />{phase}</p>
            </li>
          )}
        </ol>
      )}

      {error && <p role="alert" className="text-xs text-pretty text-destructive">{error}</p>}

      {!example && <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="flex flex-col gap-1 rounded-xl bg-background p-2 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.05)]"
      >
        {segments.length > 0 && (
          <span className="flex items-center gap-1 self-start rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-xs tabular-nums">
            {segments.length === 1 ? '1 segment selected' : `${segments.length} segments selected`}
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Clear the selected segments" onClick={onClearSegments}><X /></Button>
          </span>
        )}
        <textarea
          ref={box}
          aria-label={segments.length ? 'What to change in the selected segments' : 'What to change in the painting'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={segments.length ? 'What should change here?' : 'What should change?'}
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
            <MousePointerClick /> {selecting ? 'Done selecting' : segments.length ? 'Change the selection' : 'Select a segment'}
          </Button>
          <Button type="submit" size="icon-sm" aria-label="Send" disabled={!canSend} className="rounded-full">
            {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </form>}
    </section>
  )
}

function Asked({ message, onPart }: { message: string; onPart: boolean }) {
  return (
    <p className="max-w-[90%] self-end rounded-lg bg-muted px-3 py-2 text-pretty">
      {onPart && <span className="mb-0.5 block text-xs text-muted-foreground">On the selected part</span>}
      {message}
    </p>
  )
}
