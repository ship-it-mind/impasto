import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Hourglass, LoaderCircle } from 'lucide-react'
import { StagePicture } from '@/components/stage-picture'
import { Button } from '@/components/ui/button'
import { makeGuide, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import type { Concept } from '@/lib/concepts'
import type { Guide, GuideStep } from '@/lib/guide'
import { grams, recipeLine, type Recipe } from '@/lib/recipe'

// What goes on the knife at this stage: the band's mix, or the paste each band gets.
export function StepMaterials({ step, recipe }: { step: GuideStep; recipe: Recipe }) {
  const pill = 'flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] tabular-nums'
  if (step.band !== null) {
    const band = recipe.bands[step.band]
    return (
      <p className={`${pill} self-start`}>
        <span aria-hidden className="size-4 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: band.mix_hex }} />
        <span className="text-pretty">{recipeLine(band)} <span className="text-muted-foreground">· {grams(band.paint_g)}{recipe.mixing.paste_in_mix ? ` + ${grams(band.paste_g)} paste` : ''}</span></span>
      </p>
    )
  }
  if (!step.id.startsWith('paste-')) return null
  const level = step.id.slice('paste-'.length)
  return (
    <ul className="flex flex-wrap gap-2">
      {recipe.bands.filter(b => b.level === level).map(b => (
        <li key={b.name} className={pill}>{b.name} <span className="text-muted-foreground">· {grams(b.paste_g)}</span></li>
      ))}
    </ul>
  )
}

type PaintProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  seed: number
  recipe: Recipe
  // Only the screen on show asks for a guide: writing one costs a model call.
  active: boolean
  onBack: () => void
  onCheckIns: () => void
}

// How to paint it: what to start with, then each stage with a picture of how the canvas should look after it.
export function PaintScreen({ brief, set, concept, seed, recipe, active, onBack, onCheckIns }: PaintProps) {
  const [W, H] = set.canvasPx
  const [guide, setGuide] = useState<Guide | null>(null)
  const [phase, setPhase] = useState<string | null>('Writing how to paint it…')
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const load = () => {
    setError(null)
    setPhase('Writing how to paint it…')
    const settings = { without: recipe.mixing.without, pasteInMix: recipe.mixing.paste_in_mix }
    makeGuide(brief, set, concept, settings, setPhase)
      .then(setGuide)
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'))
      .finally(() => setPhase(null))
  }

  useEffect(() => {
    if (!active || started.current) return
    started.current = true
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, the first time this screen is shown
  }, [active])

  // A relief preview, when there is no Muse painting, shows the mixes the recipe gives.
  const mixed = useMemo<Concept>(() => ({
    ...concept, bands: concept.bands.map((b, i) => ({ ...b, mix: { ...b.mix, hex: recipe.bands[i]?.mix_hex ?? b.mix.hex } })),
  }), [concept, recipe])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-6 pb-16 lg:px-10">
      <header className="flex flex-col gap-3 pb-8">
        <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onBack}>
          <ArrowLeft /> Recipe
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">How to paint {concept.title}</h1>
        {guide && <p className="max-w-[65ch] text-base text-pretty">{guide.overview}</p>}
      </header>

      <div aria-live="polite">
        {error && (
          <div className="flex flex-col items-start gap-3 border-t py-6">
            <p role="alert" className="text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>Try again</Button>
          </div>
        )}
        {phase && !guide && (
          <div className="flex flex-col gap-4 border-t py-8">
            <p className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{phase}</p>
            <div className="h-6 w-2/5 rounded bg-muted" /><div className="h-4 w-4/5 rounded bg-muted" /><div className="h-4 w-3/5 rounded bg-muted" />
          </div>
        )}
      </div>

      {guide && (
        <>
          <section className="flex flex-col gap-2 border-t py-6" aria-labelledby="tips">
            <h2 id="tips" className="text-xs font-medium text-muted-foreground">Before you start</h2>
            <ul className="flex max-w-[70ch] list-disc flex-col gap-1.5 pl-4">
              {guide.tips.map(tip => <li key={tip} className="text-pretty">{tip}</li>)}
            </ul>
          </section>

          <ol>
            {guide.steps.map((step, i) => (
              <li key={step.id} className="grid gap-6 border-t py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-10">
                <div className="flex min-w-0 flex-col gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-light text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <h2 className="text-lg font-medium text-pretty">{step.title}</h2>
                  </div>
                  <StepMaterials step={step} recipe={recipe} />
                  <ol className="flex flex-col gap-1.5">
                    {step.do.map((line, n) => (
                      <li key={n} className="grid grid-cols-[1.25rem_1fr] gap-1 text-pretty">
                        <span className="text-muted-foreground tabular-nums">{n + 1}.</span>{line}
                      </li>
                    ))}
                  </ol>
                  {step.tips.length > 0 && (
                    <ul className="flex flex-col gap-1 text-muted-foreground">
                      {step.tips.map(tip => <li key={tip} className="text-pretty">{tip}</li>)}
                    </ul>
                  )}
                  {step.wait && (
                    <p className="flex items-center gap-2 font-medium">
                      <Hourglass className="size-4 shrink-0" aria-hidden /> Let it dry {step.wait} before the next step.
                    </p>
                  )}
                </div>
                <StagePicture
                  concept={mixed}
                  seed={seed}
                  width={W}
                  height={H}
                  view={step}
                  label={`The canvas after step ${i + 1}: ${step.title}`}
                  className="rounded-sm shadow-[0_2px_3px_rgb(0_0_0/0.15),0_10px_24px_-10px_rgb(0_0_0/0.3)] md:self-start"
                />
              </li>
            ))}
          </ol>

          <div className="flex flex-col items-start gap-3 border-t pt-8">
            <p className="max-w-[60ch] text-pretty text-muted-foreground">Check any step as you go, check a mix in the bowl, or ask a question. Use only the ones you want help with.</p>
            <Button onClick={onCheckIns}>Go to check-ins <ArrowRight /></Button>
          </div>
        </>
      )}
    </main>
  )
}
