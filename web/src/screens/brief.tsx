import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ChevronDown, Frame, Images, LoaderCircle, Palette, X } from 'lucide-react'
import { BriefDetails, QuestionForm } from '@/components/brief-details'
import { PresetPicker } from '@/components/preset-picker'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VoiceButtons, VoiceNote } from '@/components/voice-input'
import { answerQuestion, getPresets, makeConcepts, readBrief, type ConceptSet } from '@/lib/api'
import type { BriefResult, Preset } from '@/lib/brief'
import { cn } from '@/lib/utils'

const MAX_REFERENCES = 6

function Chip({ icon, label, onRemove }: { icon: ReactNode; label: string; onRemove: () => void }) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-md bg-muted pr-0.5 pl-2 text-xs">
      {icon}
      <span className="max-w-40 truncate">{label}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${label}`} onClick={onRemove}><X /></Button>
    </span>
  )
}

// One box takes the client's brief (voice note or text), the wall photo and the style;
// the structured brief comes back below it, to check before making concepts.
export function BriefScreen({ onConcepts }: { onConcepts: (set: ConceptSet) => void }) {
  const [audio, setAudio] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [wall, setWall] = useState<File | null>(null)
  const [refs, setRefs] = useState<File[]>([])
  const [preset, setPreset] = useState<string | null>(null)
  const [styleOpen, setStyleOpen] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [result, setResult] = useState<BriefResult | null>(null)
  const [making, setMaking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const wallInput = useRef<HTMLInputElement>(null)
  const refsInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getPresets().then(p => setPresets(p.presets)).catch(() => setError("Couldn't reach the server. Is the API running?"))
  }, [])

  const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.')
  const presetName = preset && presets.find(p => p.key === preset)?.name
  const style = [presetName, refs.length && `${refs.length} picture${refs.length > 1 ? 's' : ''}`].filter(Boolean).join(' + ')
  const canRead = (!!audio || text.trim().length > 0) && !phase && !making

  const read = async () => {
    if (!canRead) return
    setError(null)
    setResult(null)
    try {
      setResult(await readBrief({ audio, text, wall }, setPhase))
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
      onConcepts(await makeConcepts(result, { preset, references: refs }, setMaking))
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
        {(wall || refs.length > 0 || presetName) && (
          <div className="flex flex-wrap gap-1.5">
            {wall && <Chip icon={<Frame className="size-3.5" aria-hidden />} label={`Wall: ${wall.name}`} onRemove={() => setWall(null)} />}
            {refs.map((r, i) => (
              <Chip key={r.name + i} icon={<Images className="size-3.5" aria-hidden />} label={r.name} onRemove={() => setRefs(refs.filter((_, j) => j !== i))} />
            ))}
            {presetName && <Chip icon={<Palette className="size-3.5" aria-hidden />} label={presetName} onRemove={() => setPreset(null)} />}
          </div>
        )}
        {audio ? (
          <VoiceNote file={audio} onRemove={() => setAudio(null)} />
        ) : (
          <textarea
            aria-label="The client's brief"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); read() } }}
            placeholder="Paste the client's message, or record their voice note below…"
            rows={3}
            className="field-sizing-content max-h-60 min-h-20 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground"
          />
        )}
        <div className="flex flex-wrap items-center gap-1">
          {!audio && <VoiceButtons onFile={setAudio} />}
          <Button type="button" variant="ghost" onClick={() => wallInput.current?.click()}><Frame /> Wall photo</Button>
          <Button type="button" variant="ghost" onClick={() => refsInput.current?.click()}><Images /> Style pictures</Button>
          <Popover open={styleOpen} onOpenChange={setStyleOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost"><Palette /> {presetName ?? 'Style'} <ChevronDown /></Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(560px,90vw)] p-3">
              <PresetPicker presets={presets} value={preset} onChange={k => { setPreset(k); setStyleOpen(false) }} />
            </PopoverContent>
          </Popover>
          <Button type="submit" size="icon-lg" aria-label="Read the brief" disabled={!canRead} className="ml-auto rounded-full">
            {phase ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
          <input ref={wallInput} type="file" accept="image/*" hidden onChange={e => setWall(e.target.files?.[0] ?? null)} />
          <input
            ref={refsInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={e => setRefs([...refs, ...(e.target.files ?? [])].slice(0, MAX_REFERENCES))}
          />
        </div>
      </form>
      {!result && !phase && (
        <p className="-mt-4 text-center text-xs text-muted-foreground">
          Enter to read it. No style picked means Flowing Bands, unless you add style pictures.
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
              <span className="text-xs text-muted-foreground">Style: {style || 'Flowing Bands (default)'}</span>
            </div>
          </article>
        )}
      </section>
    </main>
  )
}
