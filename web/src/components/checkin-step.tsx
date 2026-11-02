import { useEffect, useState } from 'react'
import { Camera, Hourglass, LoaderCircle } from 'lucide-react'
import { usePhotoInput } from '@/components/photo-input'
import { StagePicture } from '@/components/stage-picture'
import { Button } from '@/components/ui/button'
import { checkStep, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { percent, when, type BandProgress } from '@/lib/checkin'
import { stillDrying, type StepCheck, type Verdict } from '@/lib/checks'
import type { Concept } from '@/lib/concepts'
import type { GuideStep } from '@/lib/guide'
import type { Recipe } from '@/lib/recipe'
import { stageJpeg } from '@/lib/stages'
import { cn } from '@/lib/utils'
import { StepMaterials } from '@/screens/paint'
import { useExample } from '@/lib/example'

export const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  on_track: { label: 'On track', tone: 'text-emerald-800' },
  needs_work: { label: 'Needs work', tone: 'text-amber-800' },
  unclear: { label: 'Not clear from the photo', tone: 'text-muted-foreground' },
}

// What makes a photo of this step useful: faint marks and white paste don't show otherwise.
function photoHint(step: GuideStep): string {
  if (step.id === 'prepare') return 'Photograph the whole canvas once the lines are on. Go over faint pencil lines so they show.'
  if (step.id.startsWith('paste-')) return 'Photograph it straight on, with a light from one side so the ridges of white paste show.'
  return 'Photograph the whole canvas, straight on.'
}

function hoursOrDays(hours: number): string {
  const [n, unit] = hours < 24 ? [Math.ceil(hours), 'hour'] : [Math.ceil(hours / 24), 'day']
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

type StepSectionProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  // The plan in the mixes the recipe gives, as the guide draws it.
  planned: Concept
  seed: number
  recipe: Recipe
  step: GuideStep
  number: number
  // The step before, and its checks: this one may be waiting on it to dry.
  previous: GuideStep | null
  previousChecks: StepCheck[]
  checks: StepCheck[]
  // What the latest whole-canvas check-in measured for this step's band.
  measured: { band: BandProgress; taken_at: string } | null
  onCheck: (check: StepCheck) => void
  onCheckMix: (band: number) => void
}

// One step of the guide: what it asks for, how it should look, and a photo to check it against.
export function StepSection({ brief, set, concept, planned, seed, recipe, step, number, previous, previousChecks, checks, measured, onCheck, onCheckMix }: StepSectionProps) {
  const [W, H] = set.canvasPx
  const [shownId, setShownId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ url: string; phase: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = checks.find(c => c.id === shownId) ?? checks.at(-1) ?? null

  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url) }, [pending?.url]) // eslint-disable-line react-hooks/exhaustive-deps

  // A photo goes straight off: at the easel there's nothing to mark on it.
  const example = useExample()
  const photo = usePhotoInput(async file => {
    setError(null)
    setPending({ url: URL.createObjectURL(file), phase: 'Sending the photo…' })
    try {
      const expected = await stageJpeg(planned, seed, W, H, step)
      const check = await checkStep(brief, set, concept, step.id, file, expected, phase => setPending(p => (p ? { ...p, phase } : p)))
      onCheck(check)
      setShownId(check.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPending(null)
    }
  })

  const drying = previous?.wait && previousChecks.length ? stillDrying(previous.wait, previousChecks.at(-1)!.taken_at) : null
  const busy = !!pending || photo.preparing

  return (
    <div className="grid gap-6 pb-6 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-8" aria-live="polite">
      <div className="flex min-w-0 flex-col gap-4">
        <StepMaterials step={step} recipe={recipe} />
        <ol className="flex flex-col gap-1.5">
          {step.do.map((line, n) => (
            <li key={n} className="grid grid-cols-[1.25rem_1fr] gap-1 text-pretty">
              <span className="text-muted-foreground tabular-nums">{n + 1}.</span>{line}
            </li>
          ))}
        </ol>
        {step.wait && (
          <p className="flex items-center gap-2 font-medium"><Hourglass className="size-4 shrink-0" aria-hidden /> Let it dry {step.wait} before the next step.</p>
        )}
        {drying !== null && (
          <p className="flex gap-2 text-pretty text-amber-800">
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
            Your last photo of "{previous!.title}" was taken {when(previousChecks.at(-1)!.taken_at)}. It needs {previous!.wait} to dry, so about {hoursOrDays(drying)} more.
          </p>
        )}
        {measured && (
          <p className="text-pretty text-muted-foreground tabular-nums">
            Last measured {when(measured.taken_at)}: {percent(measured.band.coverage)} painted
            {measured.band.delta_e !== null && `, ΔE ${measured.band.delta_e.toFixed(1)} from the mix`}
            {measured.band.drift && `, drifting ${measured.band.drift}`}.
          </p>
        )}

        <div className="flex flex-col items-start gap-2 pt-1">
          <p className="max-w-[60ch] text-xs text-pretty text-muted-foreground">{example ? (checks.length ? 'The photo taken of this step while it was painted, and what Muse Spark said about it.' : 'No photo was taken of this step while it was painted.') : photoHint(step)}</p>
          <div className="flex flex-wrap gap-2">
            {photo.element}
            {!example && <Button variant="outline" onClick={photo.open} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Camera />} {pending?.phase ?? (checks.length ? 'Check again' : 'Check this step')}
            </Button>}
            {step.band !== null && <Button variant="ghost" onClick={() => onCheckMix(step.band!)}>Check the mix</Button>}
          </div>
          {(error || photo.error) && <p role="alert" className="text-destructive">{error ?? photo.error}</p>}
        </div>

        {shown && !pending && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-col gap-1">
              <p className={cn('text-xs font-medium', VERDICT[shown.review.verdict].tone)}>{VERDICT[shown.review.verdict].label} · {when(shown.taken_at)}</p>
              <p className="text-base font-medium text-pretty">{shown.review.headline}</p>
            </div>
            {shown.review.to_fix.length > 0 && (
              <ol className="flex flex-col gap-1.5">
                {shown.review.to_fix.map((line, n) => (
                  <li key={n} className="grid grid-cols-[1.25rem_1fr] gap-1 text-pretty">
                    <span className="text-muted-foreground tabular-nums">{n + 1}.</span>{line}
                  </li>
                ))}
              </ol>
            )}
            {shown.review.looks_right.length > 0 && (
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {shown.review.looks_right.map(line => <li key={line} className="text-pretty">{line}</li>)}
              </ul>
            )}
            {checks.length > 1 && (
              <ul className="flex flex-wrap gap-1 pt-1" aria-label={`Checks of step ${number}`}>
                {checks.map(c => (
                  <li key={c.id}>
                    <Button variant={c.id === shown.id ? 'secondary' : 'ghost'} size="sm" aria-current={c.id === shown.id || undefined} onClick={() => setShownId(c.id)}>
                      {when(c.taken_at)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 md:self-start">
        <figure className="flex flex-col gap-1.5">
          <StagePicture concept={planned} seed={seed} width={W} height={H} view={step} label={`The canvas after step ${number}: ${step.title}`} className="rounded-sm" />
          <figcaption className="text-xs text-muted-foreground">How it should look after this step</figcaption>
        </figure>
        {(pending || shown) && (
          <figure className="flex flex-col gap-1.5">
            <img src={pending?.url ?? shown!.photo} alt="Your photo of this step" className="w-full rounded-sm" />
            <figcaption className="text-xs text-muted-foreground">Your photo</figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}
