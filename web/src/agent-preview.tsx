// A throwaway mock of the check-ins chat as an agent. Everything is scripted and made up: no API or model calls.
// Open /agent-preview.html and press send. ?at=1..6 freezes one moment.
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowUp, Check, ChevronDown, ImagePlus, LoaderCircle, Mic, RotateCcw } from 'lucide-react'
import './index.css'
import { AppHeader } from '@/components/app-header'
import { Accordion, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const QUESTION = "I'm nearly out of Mars Black and this slate looks too warm. Can I still finish it?"

const STEPS = [
  { running: 'Measuring the paint in your photo…', done: 'Measured the paint in your photo', detail: 'Slate: ΔE 6.2, warmer than the mix' },
  { running: 'Looking up what’s left to paint…', done: 'Looked up what’s left to paint', detail: 'Slate and Charcoal Edge still need Mars Black, 136 g of paint in all' },
  { running: 'Re-mixing those colors without Mars Black…', done: 'Re-mixed those colors without Mars Black', detail: 'Burnt Sienna gets both within ΔE 2.1 of the plan' },
]

const CHANGES = [
  { band: 'Slate', from: '#6f7683', to: '#71777f', mix: '6 Titanium White : 2 Ultramarine Blue : 1 Burnt Sienna', note: 'ΔE 1.8 from the plan · 96 g left' },
  { band: 'Charcoal Edge', from: '#33363b', to: '#393a3e', mix: '3 Ultramarine Blue : 2 Burnt Sienna', note: 'ΔE 2.1 from the plan · 40 g left' },
]

const GUIDE = [
  { title: 'Mark where the bands go', status: 'On track' },
  { title: 'Mix the tinted paste', status: 'On track' },
  { title: 'Lay Warm Cream', status: 'On track' },
  { title: 'Lay Clay and Dusty Rose', status: 'On track' },
  { title: 'Lay Slate', changes: true },
  { title: 'Lay Charcoal Edge', changes: true },
  { title: 'Varnish when it’s dry' },
]

// The stages of the script: 0 waiting to send, 1-3 a step running, 4 writing, 5 the answer, 6 applied, 7 kept.
const ANSWER = 5
const APPLIED = 6
const KEPT = 7

function Row({ id, title, note, status, tone }: { id: string; title: ReactNode; note?: string; status?: string; tone?: string }) {
  return (
    <AccordionItem value={id}>
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-3 text-base font-medium text-pretty">{title}</span>
          {note && <span className="text-pretty text-muted-foreground">{note}</span>}
        </span>
        {status && <span className={cn('shrink-0 text-right text-xs tabular-nums', tone ?? 'text-muted-foreground')}>{status}</span>}
      </AccordionTrigger>
    </AccordionItem>
  )
}

function Painting() {
  return (
    <svg viewBox="0 0 80 60" className="block w-full" aria-hidden>
      <rect width="80" height="60" fill="#e9e0cf" />
      <path d="M0 22 C22 8 52 10 80 26 V60 H0Z" fill="#b9805f" />
      <path d="M0 33 C24 20 52 22 80 37 V60 H0Z" fill="#c99c94" />
      <path d="M0 43 C24 32 54 33 80 46 V60 H0Z" fill="#6f7683" />
      <path d="M0 53 C26 45 54 46 80 55 V60 H0Z" fill="#33363b" />
    </svg>
  )
}

function BowlPhoto({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 72" className={className} role="img" aria-label="Photo of the slate paint in a bowl">
      <rect width="96" height="72" fill="#a4927b" />
      <path d="M62 -2 L100 8 L100 40 L72 30Z" fill="#f4f1ea" />
      <ellipse cx="42" cy="40" rx="33" ry="25" fill="#e6e2da" />
      <ellipse cx="42" cy="39" rx="27" ry="20" fill="#7c746f" />
      <path d="M22 37 C31 28 46 47 62 34" fill="none" stroke="#8c8580" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Swatch({ color, label }: { color: string; label: string }) {
  return <span title={label} className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: color }} />
}

function Steps({ stage }: { stage: number }) {
  const [open, setOpen] = useState(true)
  const finished = stage >= 4
  return (
    <div className="flex flex-col gap-2">
      {finished && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="flex items-center gap-1 self-start text-xs text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground">
          Checked {STEPS.length} things
          <ChevronDown className={cn('size-3.5 transition-transform duration-150 ease-out', open && 'rotate-180')} aria-hidden />
        </button>
      )}
      {open && (
        <ol className="flex flex-col gap-2 border-l pl-3">
          {STEPS.slice(0, Math.min(stage, STEPS.length)).map((step, i) => {
            const done = stage > i + 1
            return (
              <li key={step.done} className="grid animate-in grid-cols-[1rem_1fr] gap-2 duration-200 ease-out fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
                {done
                  ? <Check className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden />
                  : <LoaderCircle className="mt-0.5 size-3.5 animate-spin text-muted-foreground" aria-hidden />}
                <div className="flex min-w-0 flex-col text-xs text-pretty">
                  <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{done ? step.done : step.running}</span>
                  {done && <span className="text-muted-foreground tabular-nums">{step.detail}</span>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function Proposal({ onApply, onKeep }: { onApply: () => void; onKeep: () => void }) {
  return (
    <div className="flex animate-in flex-col gap-3 rounded-xl bg-background p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.05)] duration-200 ease-out fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
      <p className="font-medium text-pretty">Swap Mars Black for Burnt Sienna in 2 colors?</p>
      <ul className="flex flex-col gap-3">
        {CHANGES.map(c => (
          <li key={c.band} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 font-medium">
              <Swatch color={c.from} label="In the plan" />
              <span className="text-muted-foreground" aria-hidden>→</span>
              <Swatch color={c.to} label="With the new mix" />
              <span className="ml-0.5">{c.band}</span>
            </span>
            <span className="text-xs text-pretty">{c.mix}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{c.note}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onApply}>Update the recipe</Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onKeep}>Keep it as it is</Button>
      </div>
    </div>
  )
}

function Chat({ stage, setStage }: { stage: number; setStage: (s: number) => void }) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [stage])
  const idle = stage === 0
  const working = stage >= 1 && stage < ANSWER

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Ask a question">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Ask a question</h2>
        {idle && <p className="text-xs text-pretty text-muted-foreground">Or ask for something done. It can check your photos against the plan, and suggest changes to the recipe for you to approve.</p>}
      </div>

      {!idle && (
        <ol ref={list} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain" aria-live="polite">
          <li className="flex flex-col gap-3">
            <div className="flex max-w-[90%] flex-col gap-2 self-end rounded-lg bg-muted px-3 py-2">
              <BowlPhoto className="w-24 rounded-md" />
              <p className="text-pretty">{QUESTION}</p>
            </div>
            <Steps stage={stage} />
            {stage === 4 && (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" aria-hidden />Writing the answer…</p>
            )}
            {stage >= ANSWER && (
              <>
                <p className="animate-in text-pretty duration-200 ease-out fade-in motion-reduce:animate-none">
                  Yes, you can finish it. Your bowl reads warm because it’s short on blue: work in about 1 part Ultramarine Blue to 20 parts of it, then send another photo. For the rest, Burnt Sienna can replace Mars Black in both colors.
                </p>
                {stage === ANSWER && <Proposal onApply={() => setStage(APPLIED)} onKeep={() => setStage(KEPT)} />}
                {stage === APPLIED && (
                  <div className="flex animate-in items-start justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 duration-200 ease-out fade-in motion-reduce:animate-none">
                    <p className="flex gap-2 text-pretty"><Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />Recipe updated. Steps 05 and 06 now use Burnt Sienna.</p>
                    <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => setStage(ANSWER)}>Undo</button>
                  </div>
                )}
                {stage === KEPT && <p className="text-xs text-muted-foreground">Kept the recipe as it is.</p>}
              </>
            )}
          </li>
        </ol>
      )}

      {idle && <div className="flex-1" />}

      <form
        onSubmit={e => { e.preventDefault(); if (idle) setStage(1) }}
        className="flex shrink-0 flex-col gap-1 rounded-xl bg-background p-2 shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.05)]"
      >
        {idle && <BowlPhoto className="ml-1 w-14 rounded-md" />}
        <textarea
          aria-label="Your question"
          readOnly
          value={idle ? QUESTION : ''}
          placeholder="Ask anything about this painting"
          rows={2}
          className="field-sizing-content max-h-40 min-h-12 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Add a photo" className="text-muted-foreground"><ImagePlus /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Dictate" className="text-muted-foreground"><Mic /></Button>
          </div>
          <Button type="submit" size="icon-sm" aria-label="Send" disabled={!idle} className="rounded-full">
            {working ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </form>
    </section>
  )
}

function Preview() {
  const frozen = new URLSearchParams(location.search).get('at')
  const [stage, setStage] = useState(frozen ? Number(frozen) : 0)

  useEffect(() => {
    if (frozen || stage < 1 || stage >= ANSWER) return
    const timer = setTimeout(() => setStage(stage + 1), stage === 4 ? 900 : 1300)
    return () => clearTimeout(timer)
  }, [stage, frozen])

  const measured = stage >= 2
  const applied = stage === APPLIED

  return (
    <div className="flex min-h-dvh flex-col bg-[oklch(0.985_0.004_80)] text-sm">
      <AppHeader step="Check-ins" reachable={['Brief', 'Concepts', 'Recipe', 'Paint', 'Check-ins']} email="painter@example.com" onStep={() => {}} onHome={() => {}} onSignOut={() => {}} />
      <main className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 lg:px-10">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground"><ArrowLeft /> How to paint it</Button>
            <h1 className="text-3xl font-semibold tracking-tight">Check-ins</h1>
            <p className="max-w-[60ch] text-pretty text-muted-foreground">Open only what you want help with. These follow your steps, and none of them is required.</p>
          </header>
          <Accordion type="single" collapsible className="flex flex-col gap-6">
            <section className="flex flex-col">
              <h2 className="border-b pb-2 text-xs font-medium text-muted-foreground">Any time</h2>
              <Row id="mix" title="Tinted paste mixes" note="Is the tinted paste in the bowl the right color?" status={measured ? '1 off' : '3 of 5 checked'} tone={measured ? 'text-amber-800' : undefined} />
              <Row id="canvas" title="Whole canvas" note="How much is painted, and each band's color on the canvas" status="58% painted" />
            </section>
            <section className="flex flex-col">
              <h2 className="border-b pb-2 text-xs font-medium text-muted-foreground">Your steps, with the paste mixed into the color</h2>
              {GUIDE.map((g, i) => {
                const changed = applied && g.changes
                return (
                  <Row
                    key={g.title}
                    id={g.title}
                    title={<><span className="font-light text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span><span className="min-w-0">{g.title}</span></>}
                    status={changed ? 'Recipe changed' : g.status}
                    tone={changed ? 'text-foreground font-medium' : g.status ? 'text-emerald-800' : undefined}
                  />
                )
              })}
            </section>
          </Accordion>
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:h-[calc(100dvh-5rem)] lg:self-start lg:pt-9">
          <div className="flex shrink-0 items-center gap-3">
            <div className="w-16 shrink-0 overflow-hidden rounded-sm shadow-[0_1px_2px_rgb(0_0_0/0.15)]"><Painting /></div>
            <div className="min-w-0">
              <p className="truncate font-medium">Evening Slate</p>
              <p className="text-muted-foreground tabular-nums">90 × 60 cm</p>
            </div>
          </div>
          <Chat stage={stage} setStage={setStage} />
        </aside>
      </main>

      {!frozen && (
        <button type="button" onClick={() => setStage(0)} className="fixed bottom-4 left-4 flex items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-md">
          <RotateCcw className="size-3" aria-hidden /> Mock with made-up data · Replay
        </button>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
