import { useRef, useState } from 'react'
import { ArrowUp, Frame, Images, LoaderCircle, X } from 'lucide-react'
import { BriefDetails, QuestionForm } from '@/components/brief-details'
import { DictateButton } from '@/components/dictate-button'
import { PieceList } from '@/components/piece-list'
import { Button } from '@/components/ui/button'
import { answerQuestion, makeConcepts, readBrief, webImage, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { useObjectUrl } from '@/lib/use-object-url'
import { cn } from '@/lib/utils'

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

type BriefProps = {
  // A piece reopened at its brief: shown as read, ready to make concepts again.
  initial?: BriefResult
  openError?: string | null
  onOpen: (id: string) => void
  onConcepts: (set: ConceptSet, brief: BriefResult) => void
}

// One box takes the client's brief (typed or dictated), the wall photo and the style pictures;
// the structured brief comes back below it, to check before making concepts. Under an
// empty box, the pieces read before, to carry on with one.
export function BriefScreen({ initial, openError = null, onOpen, onConcepts }: BriefProps) {
  const [text, setText] = useState('')
  const [wall, setWall] = useState<File | null>(null)
  const [refs, setRefs] = useState<File[]>([])
  const [converting, setConverting] = useState(0)
  const [dictating, setDictating] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [result, setResult] = useState<BriefResult | null>(initial ?? null)
  const [making, setMaking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(openError)
  const box = useRef<HTMLTextAreaElement>(null)
  const wallInput = useRef<HTMLInputElement>(null)
  const refsInput = useRef<HTMLInputElement>(null)

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
    setError(null)
    setResult(null)
    try {
      setResult(await readBrief({ text, wall }, setPhase))
    } catch (e) {
      setError(message(e))
    } finally {
      setPhase(null)
    }
  }
  const answer = async (a: string) => {
    if (!result) return
    setError(null)
    try {
      setResult(await answerQuestion(result, a))
    } catch (e) {
      setError(message(e))
    }
  }
  const make = async () => {
    if (!result) return
    setError(null)
    setMaking('Starting…')
    try {
      onConcepts(await makeConcepts(result, { references: refs }, setMaking), result)
    } catch (e) {
      setError(message(e))
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
        {(wall || refs.length > 0 || converting > 0) && (
          <div className="flex flex-wrap gap-2">
            {wall && <Thumbnail file={wall} label="Wall" onRemove={() => setWall(null)} />}
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
          placeholder="Paste the client's message, or dictate it…"
          rows={3}
          className="field-sizing-content max-h-60 min-h-20 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
        />
        <div className="flex flex-wrap items-center gap-1">
          <DictateButton onText={dictated} onBusy={setDictating} />
          <Button type="button" variant="ghost" onClick={() => wallInput.current?.click()}><Frame /> Wall photo</Button>
          <Button type="button" variant="ghost" onClick={() => refsInput.current?.click()}><Images /> Style pictures</Button>
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
        </div>
      </form>
      {!result && !phase && (
        <p className="-mt-4 text-center text-xs text-muted-foreground">
          Enter to read it. Add style pictures to steer the look.
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
            {result.brief.clarifying_question && <QuestionForm question={result.brief.clarifying_question} onAnswer={answer} />}
            <BriefDetails brief={result.brief} />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Transcript</summary>
              <p className="mt-2 max-w-[65ch] text-pretty">{result.transcript}</p>
            </details>
            <div className="flex items-center gap-3">
              <Button size="lg" onClick={make} disabled={!!making || !!result.brief.clarifying_question}>
                {making ? <><LoaderCircle className="animate-spin" /> {making}</> : 'Make 3 concepts'}
              </Button>
              <span className="text-xs text-muted-foreground">
                Style: {refs.length ? `${refs.length} picture${refs.length > 1 ? 's' : ''}` : 'Flowing Bands (default)'}
              </span>
            </div>
          </article>
        )}
      </section>

      {!result && !phase && <PieceList onOpen={onOpen} />}
    </main>
  )
}
