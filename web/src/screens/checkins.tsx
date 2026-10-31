import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { CanvasSection } from '@/components/checkin-canvas'
import { CheckInChat } from '@/components/checkin-chat'
import { MixSection } from '@/components/checkin-mix'
import { StepSection, VERDICT } from '@/components/checkin-step'
import { ConceptPainting } from '@/components/lit-painting'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { askQuestion, listCheckIns, listChecks, makeGuide, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { percent, type CheckIn } from '@/lib/checkin'
import { latestMixes, type Checks } from '@/lib/checks'
import type { Concept } from '@/lib/concepts'
import type { Guide } from '@/lib/guide'
import type { Recipe } from '@/lib/recipe'
import { DEFAULT_LIGHT } from '@/lib/relief'
import { cn } from '@/lib/utils'

const NO_CHECKS: Checks = { steps: [], mixes: [], questions: [] }
const CANVAS = 'canvas'
const MIX = 'mix'

// One optional section: a row to open it, with where it stands, and what's inside once it's been opened.
function Section({ id, title, note, status, tone, opened, children }: {
  id: string; title: ReactNode; note?: string; status?: string; tone?: string; opened: boolean; children: ReactNode
}) {
  return (
    <AccordionItem value={id}>
      <AccordionTrigger>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-3 text-base font-medium text-pretty">{title}</span>
          {note && <span className="text-pretty text-muted-foreground">{note}</span>}
        </span>
        {status && <span className={cn('shrink-0 text-right text-xs tabular-nums', tone ?? 'text-muted-foreground')}>{status}</span>}
      </AccordionTrigger>
      <AccordionContent>{opened && children}</AccordionContent>
    </AccordionItem>
  )
}

type CheckInsProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  seed: number
  recipe: Recipe
  // Only the screen on show asks for a guide: writing one costs a model call.
  active: boolean
  onBack: () => void
}

// Check-ins follow How to paint it: a section per step, one for the mixes in the bowl and one for the
// whole canvas, all optional, with a chat beside them for anything else.
export function CheckInsScreen({ brief, set, concept, seed, recipe, active, onBack }: CheckInsProps) {
  const [W, H] = set.canvasPx
  const [history, setHistory] = useState<CheckIn[]>([])
  const [checks, setChecks] = useState<Checks>(NO_CHECKS)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [guidePhase, setGuidePhase] = useState<string | null>(null)
  const [guideError, setGuideError] = useState<string | null>(null)
  const [guideTry, setGuideTry] = useState(0)
  const [open, setOpen] = useState('')
  // Sections stay mounted once opened, so a half-marked photo survives closing them, but draw nothing before.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [mixFocus, setMixFocus] = useState<{ band: number; nonce: number } | null>(null)
  const landed = useRef(false)

  const tinted = recipe.mixing.paste_in_mix
  const tubesKey = recipe.mixing.without.join()

  const show = (id: string) => {
    setOpen(id)
    if (id) setOpened(s => new Set(s).add(id))
  }

  useEffect(() => {
    let alive = true
    // Either can fail alone: past check-ins still show without the rest.
    Promise.all([listCheckIns(brief, set, concept).catch(() => []), listChecks(brief, set, concept).catch(() => NO_CHECKS)])
      .then(([canvas, rest]) => {
        if (!alive) return
        setHistory(canvas)
        setChecks(rest)
        if (landed.current) return
        landed.current = true
        // Come back to whichever section was last used; a first visit opens nothing, since all of them are optional.
        const last = [
          ...canvas.map(c => ({ id: CANVAS, at: c.taken_at })),
          ...rest.mixes.filter(m => m.paste_in_mix === tinted).map(m => ({ id: MIX, at: m.taken_at })),
          ...rest.steps.filter(s => s.paste_in_mix === tinted).map(s => ({ id: s.step, at: s.taken_at })),
        ].sort((a, b) => a.at.localeCompare(b.at)).at(-1)
        if (last) show(last.id)
      })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per concept; the method only picks where to land
  }, [brief, set, concept])

  useEffect(() => {
    if (!active) return
    let alive = true
    setGuide(null)
    setGuideError(null)
    setGuidePhase('Writing the steps…')
    makeGuide(brief, set, concept, { without: recipe.mixing.without, pasteInMix: tinted }, phase => { if (alive) setGuidePhase(phase) })
      .then(made => { if (alive) setGuide(made) })
      .catch(e => { if (alive) setGuideError(e instanceof Error ? e.message : 'Something went wrong. Try again.') })
      .finally(() => { if (alive) setGuidePhase(null) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recipe.mixing is read through its two keys
  }, [active, brief, set, concept, tinted, tubesKey, guideTry])

  // The plan in the mixes the recipe gives, as on the Recipe screen.
  const planned = useMemo<Concept>(() => ({
    ...concept, bands: concept.bands.map((b, i) => ({ ...b, mix: { ...b.mix, hex: recipe.bands[i]?.mix_hex ?? b.mix.hex } })),
  }), [concept, recipe])

  // Checks made under the other paste method were against other steps and other colors.
  const stepChecks = useMemo(() => checks.steps.filter(c => c.paste_in_mix === tinted), [checks.steps, tinted])
  const mixChecks = useMemo(() => checks.mixes.filter(c => c.paste_in_mix === tinted), [checks.mixes, tinted])
  const mixes = useMemo(() => latestMixes(mixChecks), [mixChecks])
  const mixesOff = [...mixes.values()].filter(m => m.result.state === 'off').length
  const lastCanvas = history.at(-1) ?? null

  const mixTitle = tinted ? 'Tinted paste mixes' : 'Color mixes'
  const openLabel = open === CANVAS ? 'Whole canvas' : open === MIX ? mixTitle : guide?.steps.find(s => s.id === open)?.title ?? null

  const common = { brief, set, concept }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 lg:px-10">
      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onBack}>
            <ArrowLeft /> How to paint it
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight">Check-ins</h1>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            Open only what you want help with. These follow your steps, and none of them is required.
          </p>
        </header>

        <Accordion type="single" collapsible value={open} onValueChange={show} className="flex flex-col gap-6">
          <section className="flex flex-col" aria-labelledby="any-time">
            <h2 id="any-time" className="border-b pb-2 text-xs font-medium text-muted-foreground">Any time</h2>
            <Section
              id={MIX}
              title={mixTitle}
              note={tinted ? 'Is the tinted paste in the bowl the right color?' : 'Is the paint in the bowl the right color?'}
              status={mixes.size === 0 ? undefined : mixesOff ? `${mixesOff} off` : `${mixes.size} of ${recipe.bands.length} checked`}
              tone={mixesOff ? 'text-amber-800' : undefined}
              opened={opened.has(MIX)}
            >
              <MixSection
                {...common}
                recipe={recipe}
                checks={mixChecks}
                focus={mixFocus}
                onCheck={check => setChecks(c => ({ ...c, mixes: [...c.mixes, check] }))}
              />
            </Section>
            <Section
              id={CANVAS}
              title="Whole canvas"
              note="How much is painted, and each band's color on the canvas"
              status={lastCanvas ? `${percent(lastCanvas.coverage)} painted` : undefined}
              opened={opened.has(CANVAS)}
            >
              <CanvasSection {...common} planned={planned} seed={seed} history={history} onCheckIn={c => setHistory(h => [...h, c])} />
            </Section>
          </section>

          <section className="flex flex-col" aria-labelledby="by-step">
            <h2 id="by-step" className="border-b pb-2 text-xs font-medium text-muted-foreground">
              Your steps{tinted ? ', with the paste mixed into the color' : ', with the paste underneath'}
            </h2>
            {guidePhase && !guide && (
              <p className="flex items-center gap-2 py-4 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{guidePhase}</p>
            )}
            {guideError && (
              <div className="flex flex-col items-start gap-3 py-4">
                <p role="alert" className="text-destructive">{guideError}</p>
                <Button variant="outline" onClick={() => setGuideTry(n => n + 1)}>Try again</Button>
              </div>
            )}
            {guide?.steps.map((step, i) => {
              const own = stepChecks.filter(c => c.step === step.id)
              const previous = guide.steps[i - 1] ?? null
              const last = own.at(-1)
              const band = step.band !== null ? lastCanvas?.bands[step.band] : undefined
              return (
                <Section
                  key={step.id}
                  id={step.id}
                  title={<>
                    <span className="font-light text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0">{step.title}</span>
                  </>}
                  status={last && VERDICT[last.review.verdict].label}
                  tone={last && VERDICT[last.review.verdict].tone}
                  opened={opened.has(step.id)}
                >
                  <StepSection
                    {...common}
                    planned={planned}
                    seed={seed}
                    recipe={recipe}
                    step={step}
                    number={i + 1}
                    previous={previous}
                    previousChecks={previous ? stepChecks.filter(c => c.step === previous.id) : []}
                    checks={own}
                    measured={band && lastCanvas && band.coverage > 0 ? { band, taken_at: lastCanvas.taken_at } : null}
                    onCheck={check => setChecks(c => ({ ...c, steps: [...c.steps, check] }))}
                    onCheckMix={b => { setMixFocus(f => ({ band: b, nonce: (f?.nonce ?? 0) + 1 })); show(MIX) }}
                  />
                </Section>
              )
            })}
          </section>
        </Accordion>
      </div>

      {/* The chat stays in reach while a section is read. On a phone it follows the sections. */}
      <aside className="flex flex-col gap-5 lg:sticky lg:top-4 lg:h-[calc(100dvh-5rem)] lg:self-start lg:pt-9">
        <div className="flex shrink-0 items-center gap-3">
          <div className="w-16 shrink-0 overflow-hidden rounded-sm shadow-[0_1px_2px_rgb(0_0_0/0.15)]">
            <ConceptPainting concept={planned} seed={seed} width={W} height={H} light={DEFAULT_LIGHT} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{concept.title}</p>
            <p className="text-muted-foreground tabular-nums">{set.piece.widthCm} × {set.piece.heightCm} cm</p>
          </div>
        </div>
        <CheckInChat
          questions={checks.questions}
          section={openLabel}
          onAsk={async (question, onPhase) => {
            const asked = await askQuestion(brief, set, concept, question, guide?.steps.some(s => s.id === open) || open === MIX || open === CANVAS ? open : null, onPhase)
            setChecks(c => ({ ...c, questions: [...c.questions, asked] }))
          }}
        />
      </aside>
    </main>
  )
}
