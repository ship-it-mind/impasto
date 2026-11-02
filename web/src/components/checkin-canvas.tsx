import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, TriangleAlert, Upload } from 'lucide-react'
import { CheckInTrends } from '@/components/checkin-trends'
import { ConceptPainting, LitPainting } from '@/components/lit-painting'
import { usePhotoInput } from '@/components/photo-input'
import { NO_TAPS, PhotoStage, TapStep, type Target, type Taps } from '@/components/photo-stage'
import { Button } from '@/components/ui/button'
import { checkIn, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { DONE, MIN_STARTED, percent, when, type BandProgress, type CheckIn, type Point } from '@/lib/checkin'
import type { Concept } from '@/lib/concepts'
import { DEFAULT_LIGHT } from '@/lib/relief'
import { cn } from '@/lib/utils'
import { useExample } from '@/lib/example'

function Coverage({ band }: { band: BandProgress }) {
  const state = band.coverage >= DONE ? 'Done' : band.coverage < MIN_STARTED ? 'Not started' : percent(band.coverage)
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-3 border-t py-4">
      <span aria-hidden title={band.measured_hex ? 'Planned mix, then as painted' : 'Planned mix'} className="relative size-10 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: band.planned_hex }}>
        {band.measured_hex && <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: band.measured_hex }} />}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium capitalize">{band.name}</h3>
          <span className="tabular-nums text-muted-foreground">{state}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full rounded-full bg-foreground/70" style={{ width: percent(Math.min(band.coverage, 1)) }} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {Math.round(band.painted_cm2).toLocaleString('en-GB')} of {Math.round(band.planned_cm2).toLocaleString('en-GB')} cm²
          {band.delta_e !== null && ` · ΔE ${band.delta_e.toFixed(1)} from the mix`}
        </p>
        {band.drift && (
          <p className="text-pretty text-amber-800">
            Drifting {band.drift}{band.fix ? `: ${band.fix}.` : '. Remix it from the recipe.'}
          </p>
        )}
      </div>
    </li>
  )
}

type Plan = { concept: Concept; seed: number; size: [number, number] }

// The bands in the order they're being painted: furthest along first.
function paintOrder(checkin: CheckIn): number[] {
  return checkin.bands.map(b => b.id).sort((a, b) => checkin.bands[b].coverage - checkin.bands[a].coverage || a - b)
}

function Result({ checkin, plan }: { checkin: CheckIn; plan: Plan }) {
  const stage = useMemo(() => ({ order: paintOrder(checkin), painted: checkin.coverage }), [checkin])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        {checkin.summary.map((line, i) => (
          <p key={i} className={cn('text-pretty', i === 0 ? 'text-lg font-medium' : 'text-muted-foreground')}>{line}</p>
        ))}
      </div>
      {checkin.warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {checkin.warnings.map(w => (
            <li key={w} className="flex gap-2 text-xs text-amber-800">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /><span className="text-pretty">{w}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="flex flex-col gap-2">
          <img src={checkin.images.progress} alt="The canvas, straightened, with unpainted parts of each band hatched" className="w-full rounded-sm" />
          <figcaption className="text-xs text-pretty text-muted-foreground">
            Your canvas, straightened and color-corrected. Hatched parts are still to paint, in their band's planned color.
          </figcaption>
        </figure>
        <figure className="flex flex-col gap-2">
          {plan.concept.layout ? (
            <>
              <ConceptPainting concept={plan.concept} seed={plan.seed} width={plan.size[0]} height={plan.size[1]} light={DEFAULT_LIGHT} className="rounded-sm" />
              <figcaption className="text-xs text-pretty text-muted-foreground">The plan when it's finished, painted by Muse Image.</figcaption>
            </>
          ) : (
            <>
              <LitPainting concept={plan.concept} seed={plan.seed} width={plan.size[0]} height={plan.size[1]} light={DEFAULT_LIGHT} stage={stage} className="rounded-sm" />
              <figcaption className="text-xs text-pretty text-muted-foreground">
                The plan at the same stage: {percent(checkin.coverage)} painted, bands in the order you're painting them.
              </figcaption>
            </>
          )}
        </figure>
      </div>
      <ul aria-label="Bands">
        {checkin.bands.map(b => <Coverage key={b.id} band={b} />)}
      </ul>
    </div>
  )
}

type CanvasSectionProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  // The plan in the mixes the recipe gives.
  planned: Concept
  seed: number
  history: CheckIn[]
  onCheckIn: (checkin: CheckIn) => void
}

// The whole canvas measured against the plan, from a photo and nothing else: how much is painted, and each band's color.
// The photo goes straight off. Marking it by hand is only for when the canvas or white wasn't found right.
export function CanvasSection({ brief, set, concept, planned, seed, history, onCheckIn }: CanvasSectionProps) {
  const [W, H] = set.canvasPx
  const [picked, setPicked] = useState<CheckIn | null>(null)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [marking, setMarking] = useState(false)
  const [taps, setTaps] = useState<Taps>(NO_TAPS)
  const [target, setTarget] = useState<Target | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = picked ?? history.at(-1) ?? null

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  const send = async (file: File, marks: Taps) => {
    setError(null)
    setPhase(marks.corners.length ? 'Straightening the photo…' : 'Finding the canvas…')
    try {
      const result = await checkIn(brief, set, concept, seed, { photo: file, white: marks.white, corners: marks.corners, ground: marks.ground }, setPhase)
      onCheckIn(result)
      setPicked(result)
      setMarking(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
      // The canvas probably wasn't found: its corners by hand get past that.
      setMarking(true)
      setTarget('corners')
    } finally {
      setPhase(null)
    }
  }

  const example = useExample()
  const input = usePhotoInput(file => {
    setPhoto({ file, url: URL.createObjectURL(file) })
    setTaps(NO_TAPS)
    setMarking(false)
    setTarget(null)
    send(file, NO_TAPS)
  })

  const tap = (p: Point) => {
    if (target === 'white') {
      setTaps(t => ({ ...t, white: p }))
      setTarget(null)
    } else if (target === 'ground') {
      setTaps(t => ({ ...t, ground: p }))
      setTarget(null)
    } else if (target === 'corners') {
      const corners = [...taps.corners, p]
      setTaps({ ...taps, corners })
      if (corners.length === 4) setTarget(null)
    }
  }

  const cornersReady = taps.corners.length === 0 || taps.corners.length === 4
  const ready = !!photo && cornersReady && !phase

  const pick = (c: CheckIn) => { setPicked(c); setPhoto(null); setMarking(false) }

  return (
    <div className="flex flex-col gap-6 pb-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          {example
            ? 'The photos of the whole canvas taken while it was painted, and what each one found.'
            : 'Upload a photo of the whole canvas, taken from the same spot each time. White paper or some bare canvas in the shot makes the colors more exact.'}
        </p>
        {input.element}
        {!example && <Button onClick={input.open} disabled={!!phase || input.preparing} variant="outline">
          {phase || input.preparing ? <LoaderCircle className="animate-spin" /> : <Upload />} {phase ?? 'Upload a photo'}
        </Button>}
      </div>

      {(error || input.error) && <p role="alert" className="text-destructive">{error ?? input.error}</p>}

      {photo && marking && (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <PhotoStage url={photo.url} alt="The canvas photo" taps={taps} target={phase ? null : target} onTap={tap} />
          <div className="flex flex-col gap-4">
            <ol className="-mx-2.5 flex flex-col gap-1">
              <TapStep
                label="Corners"
                hint={taps.corners.length && taps.corners.length < 4
                  ? `${taps.corners.length} of 4 tapped.`
                  : 'Tap all 4 if they came out wrong.'}
                optional
                done={taps.corners.length > 0}
                active={target === 'corners'}
                onPick={() => { setTarget('corners'); if (taps.corners.length === 4) setTaps(t => ({ ...t, corners: [] })) }}
                onClear={() => { setTaps(t => ({ ...t, corners: [] })); setTarget('corners') }}
              />
              <TapStep
                label="White"
                hint="Tap something white if the colors came out wrong."
                optional
                done={!!taps.white}
                active={target === 'white'}
                onPick={() => setTarget('white')}
                onClear={() => { setTaps(t => ({ ...t, white: null })); setTarget('white') }}
              />
              <TapStep
                label="Bare canvas"
                hint="Only if the canvas isn't primed white: tap a spot with no paint."
                optional
                done={!!taps.ground}
                active={target === 'ground'}
                onPick={() => setTarget('ground')}
                onClear={() => { setTaps(t => ({ ...t, ground: null })); setTarget('ground') }}
              />
            </ol>
            <Button onClick={() => photo && send(photo.file, taps)} disabled={!ready} className="self-start">
              {phase ? <><LoaderCircle className="animate-spin" /> {phase}</> : 'Check in'}
            </Button>
            {!cornersReady && <p className="text-xs text-muted-foreground">Tap all 4 corners, or redo to find them automatically.</p>}
          </div>
        </div>
      )}

      {!marking && shown && !phase && <Result checkin={shown} plan={{ concept: planned, seed, size: [W, H] }} />}
      {!marking && photo && !phase && (
        <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={() => setMarking(true)}>
          Didn't read it right? Mark the photo yourself
        </Button>
      )}

      {history.length > 0 && (
        <div className="grid gap-8 border-t pt-5 md:grid-cols-2">
          <section className="flex flex-col gap-2" aria-labelledby="history">
            <h3 id="history" className="text-xs font-medium text-muted-foreground">Check-ins so far</h3>
            <ul>
              {history.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    aria-current={shown?.id === c.id || undefined}
                    className={cn(
                      'flex w-full items-baseline justify-between gap-3 border-b py-1.5 text-left',
                      shown?.id === c.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span>{when(c.taken_at)}</span>
                    <span className="tabular-nums">{percent(c.coverage)} painted</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <CheckInTrends history={history} shown={shown} onPick={pick} />
        </div>
      )}
    </div>
  )
}
