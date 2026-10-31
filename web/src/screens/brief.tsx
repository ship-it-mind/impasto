import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Crop, Frame, Images, LoaderCircle, X } from 'lucide-react'
import { BriefDetails } from '@/components/brief-details'
import { DictateButton } from '@/components/dictate-button'
import { NO_TAPS, PhotoStage } from '@/components/photo-stage'
import { PieceList } from '@/components/piece-list'
import { PieceSize, sizeFrom, type SizeText } from '@/components/piece-size'
import { Button } from '@/components/ui/button'
import { getMockup, joinConcepts, makeConcepts, readBrief, saveMockup, webImage, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import type { Point } from '@/lib/checkin'
import { useObjectUrl } from '@/lib/use-object-url'
import { cn } from '@/lib/utils'
import { pxPerCm, quadCm, resizeQuad, type Mockup, type SizeCm } from '@/lib/wall'

const MAX_REFERENCES = 6
const IMAGE_TYPES = 'image/*,.heic,.heif'

// A picked picture: a thumbnail, what it's for, and a way to remove it.
function Thumbnail({ file, label, onRemove }: { file: File; label: string; onRemove: () => void }) {
  const url = useObjectUrl(file)
  return (
    <figure className="relative flex w-20 flex-col gap-1">
      {url && <img src={url} alt={file.name} title={file.name} className="size-20 rounded-lg object-cover -outline-offset-1 outline-1 outline-black/10" />}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      <Button
        type="button"
        variant="secondary"
        size="icon-xs"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className="absolute top-1 right-1 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
      >
        <X />
      </Button>
    </figure>
  )
}

// The picture to paint as it is. A photo of a painting shows what's around it too, so its corners can be marked.
function ExactPicture({ file, corners, disabled, onCorners }: { file: File; corners: Point[]; disabled: boolean; onCorners: (corners: Point[]) => void }) {
  const url = useObjectUrl(file)
  const done = corners.length === 4
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="text-xs font-medium text-muted-foreground">The picture to paint</h2>
        {corners.length > 0 && !disabled && <Button type="button" variant="ghost" size="xs" onClick={() => onCorners([])}>Clear the corners</Button>}
      </div>
      <p className="max-w-[65ch] text-xs text-pretty text-muted-foreground">
        {done
          ? "Only what's inside these corners will be painted, straightened to the canvas."
          : corners.length > 0
            ? `${corners.length} of 4 corners tapped.`
            : 'Does it show more than the painting, like a wall or floor? Tap the painting\'s 4 corners. Otherwise all of it is used, cropped to the canvas\'s shape.'}
      </p>
      {url && (
        <PhotoStage
          url={url}
          alt="The picture to paint"
          taps={{ ...NO_TAPS, corners }}
          target={disabled || done ? null : 'corners'}
          onTap={p => onCorners([...corners, p])}
        />
      )}
    </section>
  )
}

type BriefProps = {
  // A piece reopened at its brief: shown as read, ready to make concepts again.
  initial?: BriefResult
  // The job still making this piece's concepts, from before a reload.
  joining?: string
  openError?: string | null
  // This piece already has concepts: showing them is free, making new ones isn't.
  hasConcepts: boolean
  onShowConcepts: () => void
  onOpen: (id: string) => void
  onBrief: (brief: BriefResult) => void
  onConcepts: (set: ConceptSet, brief: BriefResult) => void
}

// One box takes the client's brief (typed or dictated), the wall photo and the style pictures;
// the structured brief comes back below it, to check before making concepts. Under an
// empty box, the pieces read before, to carry on with one.
export function BriefScreen({ initial, joining, openError = null, hasConcepts, onShowConcepts, onOpen, onBrief, onConcepts }: BriefProps) {
  const [text, setText] = useState('')
  const [wall, setWall] = useState<File | null>(null)
  const [refs, setRefs] = useState<File[]>([])
  const [exact, setExact] = useState<File | null>(null)
  const [corners, setCorners] = useState<Point[]>([])
  const [converting, setConverting] = useState(0)
  const [dictating, setDictating] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [result, setResult] = useState<BriefResult | null>(initial ?? null)
  const [making, setMaking] = useState<string | null>(joining ? 'Starting…' : null)
  const [error, setError] = useState<string | null>(openError)
  const [size, setSize] = useState<SizeText>({ w: '', h: '' })
  // Where the piece hangs on the wall photo. undefined: not loaded yet.
  const [mockup, setMockup] = useState<Mockup | null | undefined>(undefined)
  const box = useRef<HTMLTextAreaElement>(null)
  const wallInput = useRef<HTMLInputElement>(null)
  const refsInput = useRef<HTMLInputElement>(null)
  const exactInput = useRef<HTMLInputElement>(null)
  // What's on screen was read from this, so reading it again would change nothing.
  const lastRead = useRef<{ text: string; wall: File | null } | null>(null)
  // Left this piece for another: a job finishing now mustn't pull the app back to it.
  const left = useRef(false)
  useEffect(() => {
    left.current = false
    return () => { left.current = true }
  }, [])
  const concepts = useRef(onConcepts)
  useEffect(() => { concepts.current = onConcepts })

  useEffect(() => {
    if (!joining || !initial) return
    let stop = false
    joinConcepts(joining, setMaking)
      .then(made => { if (!stop) concepts.current(made.set, made.brief) })
      .catch(e => { if (!stop) setError(e instanceof Error ? e.message : 'Something went wrong. Try again.') })
      .finally(() => { if (!stop) setMaking(null) })
    return () => { stop = true }
  }, [joining, initial])

  // A brief that's been read: the size starts as the client's, else what was marked on the wall, else
  // what Spark recommends for it. What hangs on the wall is drawn at that size.
  const briefId = result?.id
  const hasWall = !!result?.wall
  const opened = useRef(result)
  opened.current = result
  useEffect(() => {
    const read = opened.current
    if (!briefId || !read) return
    let stop = false
    const start = (saved: Mockup | null) => {
      if (stop) return
      const { piece, wall_fit: fit } = read.brief
      const chosen: SizeCm | null = piece.width_cm && piece.height_cm
        ? { w: piece.width_cm, h: piece.height_cm }
        : saved ? quadCm(saved) : fit ? { w: fit.width_cm, h: fit.height_cm } : null
      setSize(chosen ? { w: String(chosen.w), h: String(chosen.h) } : { w: '', h: '' })
      setMockup(saved && chosen ? { ...saved, corners: resizeQuad(saved.corners, chosen.w * pxPerCm(saved), chosen.h * pxPerCm(saved)) } : saved)
    }
    if (hasWall) getMockup(briefId).then(start).catch(() => start(null))
    else start(null)
    return () => { stop = true }
  }, [briefId, hasWall])

  // The size the concepts on show were made for, if any: changing it means making new ones.
  const madeSize = hasConcepts && result?.brief.piece.width_cm && result.brief.piece.height_cm
    ? { w: result.brief.piece.width_cm, h: result.brief.piece.height_cm } : null
  const settledSize = sizeFrom(size)
  const sizeChanged = !!madeSize && (settledSize?.w !== madeSize.w || settledSize?.h !== madeSize.h)

  // Typing a size draws the piece at it.
  const typed = (next: SizeText) => {
    setSize(next)
    const cm = sizeFrom(next)
    if (cm && mockup) placed({ ...mockup, corners: resizeQuad(mockup.corners, cm.w * pxPerCm(mockup), cm.h * pxPerCm(mockup)) }, cm)
  }
  const placed = (next: Mockup, cm = settledSize) => {
    setMockup(next)
    keepPlace(next, cm).catch(() => {})  // making the concepts sends it again
  }
  // Saved as soon as it can't disagree with the concepts on show; otherwise once new ones are made.
  const keepPlace = async (next: Mockup, cm = settledSize) => {
    if (!result) return
    if (madeSize && (cm?.w !== madeSize.w || cm?.h !== madeSize.h)) return
    await saveMockup(result.id, next)
  }

  const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.')
  const canRead = text.trim().length > 0 && !phase && !making && !dictating && converting === 0

  // Dictated words go where the caret is, and the caret stays after them, ready to correct or carry on.
  const dictated = (words: string) => {
    const el = box.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    el.setRangeText(`${before && !/\s$/.test(before) ? ' ' : ''}${words}`, el.selectionStart, el.selectionEnd, 'end')
    setText(el.value)
    el.focus()
  }

  // HEIC photos are converted first, so the thumbnail and everything after it can read them.
  const pick = async (files: File[], add: (images: File[]) => void) => {
    setError(null)
    setConverting(n => n + files.length)
    try {
      add(await Promise.all(files.map(webImage)))
    } catch (e) {
      setError(message(e))
    } finally {
      setConverting(n => n - files.length)
    }
  }

  const read = async () => {
    if (!canRead) return
    if (result && lastRead.current?.text === text.trim() && lastRead.current.wall === wall) return
    setError(null)
    setResult(null)
    setMockup(undefined)
    try {
      const read = await readBrief({ text, wall }, setPhase)
      lastRead.current = { text: text.trim(), wall }
      setResult(read)
      onBrief(read)
    } catch (e) {
      setError(message(e))
    } finally {
      setPhase(null)
    }
  }
  const make = async () => {
    if (!result || !settledSize) return
    setError(null)
    setMaking('Starting…')
    try {
      const made = await makeConcepts(result, exact ? { references: [], exact, corners } : { references: refs }, { size: settledSize, mockup }, setMaking)
      if (left.current) return
      setResult(made.brief)
      onConcepts(made.set, made.brief)
    } catch (e) {
      setError(message(e))
    } finally {
      setMaking(null)
    }
  }

  return (
    <main className={cn('mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16', result || phase ? 'pt-6' : 'pt-[14vh]')}>
      <h1 className="text-center text-3xl font-semibold tracking-tight text-balance">What did the client ask for?</h1>

      <form
        onSubmit={e => { e.preventDefault(); read() }}
        className="flex flex-col gap-2 rounded-2xl bg-background p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_6px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.12)]"
      >
        {(wall || exact || refs.length > 0 || converting > 0) && (
          <div className="flex flex-wrap gap-2">
            {wall && <Thumbnail file={wall} label="Wall" onRemove={() => setWall(null)} />}
            {exact && <Thumbnail file={exact} label="Exact" onRemove={() => { setExact(null); setCorners([]) }} />}
            {refs.map((r, i) => (
              <Thumbnail key={r.name + i} file={r} label="Style" onRemove={() => setRefs(refs.filter((_, j) => j !== i))} />
            ))}
            {Array.from({ length: converting }, (_, i) => (
              <div key={i} role="status" aria-label="Preparing the photo" className="flex size-20 items-center justify-center rounded-lg bg-muted">
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={box}
          aria-label="The client's brief"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); read() } }}
          placeholder={exact ? 'Give the canvas size, and anything else the client said…' : "Paste the client's message, or dictate it…"}
          rows={3}
          className="field-sizing-content max-h-60 min-h-20 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-wrap items-center gap-1">
          <DictateButton onText={dictated} onBusy={setDictating} />
          <Button type="button" variant="ghost" onClick={() => wallInput.current?.click()}><Frame /> Wall photo</Button>
          {!exact && <Button type="button" variant="ghost" onClick={() => refsInput.current?.click()}><Images /> Style pictures</Button>}
          <Button type="button" variant="ghost" onClick={() => exactInput.current?.click()}><Crop /> Exact picture</Button>
          <Button type="submit" size="icon-lg" aria-label="Read the brief" disabled={!canRead} className="ml-auto rounded-full">
            {phase ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
          <input
            ref={wallInput}
            type="file"
            accept={IMAGE_TYPES}
            hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) pick([f], ([image]) => setWall(image)); e.target.value = '' }}
          />
          <input
            ref={refsInput}
            type="file"
            accept={IMAGE_TYPES}
            multiple
            hidden
            onChange={e => { pick([...(e.target.files ?? [])], images => setRefs(r => [...r, ...images].slice(0, MAX_REFERENCES))); e.target.value = '' }}
          />
          <input
            ref={exactInput}
            type="file"
            accept={IMAGE_TYPES}
            hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) pick([f], ([image]) => { setExact(image); setCorners([]); setRefs([]) }); e.target.value = '' }}
          />
        </div>
      </form>
      {!result && !phase && (
        <p className="-mt-4 text-center text-xs text-muted-foreground">
          {exact ? 'Enter to read it.' : 'Enter to read it. Add style pictures to steer the look, or an exact picture to paint it as it is.'}
        </p>
      )}

      <section aria-live="polite" className="flex flex-col gap-5">
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {phase && (
          <p className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{phase}</p>
        )}
        {result && (
          <article className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-medium text-muted-foreground">The brief</h2>
              <p className="text-xl leading-snug text-pretty">{result.brief.summary}</p>
            </div>
            <PieceSize
              size={size}
              disabled={!!making}
              fit={result.brief.wall_fit}
              wall={result.wall}
              mockup={mockup}
              wallWidthCm={result.brief.room.wall_width_cm}
              onTyped={typed}
              onSize={cm => setSize({ w: String(cm.w), h: String(cm.h) })}
              onMockup={setMockup}
              onMockupDone={next => keepPlace(next, quadCm(next))}
            />
            <BriefDetails brief={result.brief} />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Transcript</summary>
              <p className="mt-2 max-w-[65ch] text-pretty">{result.transcript}</p>
            </details>
            {exact && <ExactPicture file={exact} corners={corners} disabled={!!making} onCorners={setCorners} />}
            <div className="flex items-center gap-3">
              {hasConcepts && !making && <Button size="lg" variant={sizeChanged ? 'ghost' : 'default'} onClick={onShowConcepts}>See the concepts</Button>}
              <Button size="lg" variant={hasConcepts && !exact && !sizeChanged ? 'ghost' : 'default'} onClick={make} disabled={!!making || !settledSize || (corners.length > 0 && corners.length < 4)}>
                {making ? <><LoaderCircle className="animate-spin" /> {making}</> : exact ? 'Plan this picture' : hasConcepts ? 'Make 3 new ones' : 'Make 3 concepts'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {!settledSize
                  ? 'Give the width and height first'
                  : sizeChanged && madeSize
                    ? `The concepts on show are for ${madeSize.w} × ${madeSize.h} cm. New ones are needed at this size.`
                    : exact ? 'Painted as it is, no new concepts' : `Style: ${refs.length ? `${refs.length} picture${refs.length > 1 ? 's' : ''}` : 'Flowing Bands (default)'}`}
              </span>
            </div>
          </article>
        )}
      </section>

      {!result && !phase && <PieceList onOpen={onOpen} />}
    </main>
  )
}
