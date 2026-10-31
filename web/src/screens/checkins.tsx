import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, LoaderCircle, TriangleAlert } from 'lucide-react'
import { CheckInTrends } from '@/components/checkin-trends'
import { ConceptPainting, LitPainting } from '@/components/lit-painting'
import { NO_TAPS, PhotoStage, type Target, type Taps } from '@/components/photo-stage'
import { Button } from '@/components/ui/button'
import { checkIn, listCheckIns, webImage, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { DONE, MIN_STARTED, percent, when, type BandProgress, type CheckIn, type Point } from '@/lib/checkin'
import type { Concept } from '@/lib/concepts'
import type { Recipe } from '@/lib/recipe'
import { DEFAULT_LIGHT } from '@/lib/relief'
import { cn } from '@/lib/utils'

// One step of marking the photo: what to tap, whether it's done, and a way to redo it.
function TapStep({ label, hint, done, active, optional, onPick, onClear }: {
  label: string; hint: string; done: boolean; active: boolean; optional?: boolean; onPick: () => void; onClear: () => void
}) {
  return (
    <li className={cn('flex items-start gap-3 rounded-md p-2.5', active && 'bg-background shadow-[0_0_0_1px_rgb(0_0_0/0.08)]')}>
      <button type="button" onClick={onPick} className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className="font-medium">
          {label}{optional && <span className="font-normal text-muted-foreground"> · optional</span>}
        </span>
        <span className="text-pretty text-muted-foreground">{hint}</span>
      </button>
      {done
        ? <Button variant="ghost" size="sm" className="-my-1 text-muted-foreground" onClick={onClear}>Redo</Button>
        : active && <span className="text-xs whitespace-nowrap text-muted-foreground">Tap the photo</span>}
    </li>
  )
}

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

// The bands in the order she is painting them: furthest along first.
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

type CheckInsProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  seed: number
  recipe: Recipe
  onBack: () => void
}

// Progress check-ins: a photo of the canvas mid-way, measured against the plan.
// The plan and past check-ins on the left; the new photo, its taps and the result on the right.
export function CheckInsScreen({ brief, set, concept, seed, recipe, onBack }: CheckInsProps) {
  const [W, H] = set.canvasPx
  const [history, setHistory] = useState<CheckIn[]>([])
  const [shown, setShown] = useState<CheckIn | null>(null)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [taps, setTaps] = useState<Taps>(NO_TAPS)
  const [target, setTarget] = useState<Target | null>('white')
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listCheckIns(brief, set, concept)
      .then(list => { setHistory(list); setShown(list.at(-1) ?? null) })
      .catch(() => {})
  }, [brief, set, concept])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  // The plan in the mixes the recipe gives, as on the Recipe screen.
  const planned = useMemo<Concept>(() => ({
    ...concept, bands: concept.bands.map((b, i) => ({ ...b, mix: { ...b.mix, hex: recipe.bands[i]?.mix_hex ?? b.mix.hex } })),
  }), [concept, recipe])

  const choose = async (picked: File | undefined) => {
    if (!picked) return
    setError(null)
    setPhase('Preparing the photo…')
    try {
      const file = await webImage(picked)
      setPhoto({ file, url: URL.createObjectURL(file) })
      setTaps(NO_TAPS)
      setTarget('white')
      setShown(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPhase(null)
    }
  }

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
  const ready = !!photo && !!taps.white && cornersReady && !phase

  const submit = async () => {
    if (!photo || !taps.white) return
    setError(null)
    setPhase(taps.corners.length ? 'Straightening the photo…' : 'Finding the canvas…')
    try {
      const result = await checkIn(brief, set, concept, seed, { photo: photo.file, white: taps.white, corners: taps.corners, ground: taps.ground }, setPhase)
      setHistory(h => [...h, result])
      setShown(result)
      setPhoto(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPhase(null)
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-16 lg:px-10">
      {/* At the easel the camera comes first: on a phone the plan and history go below. */}
      <aside className="order-last flex flex-col gap-8 lg:sticky lg:top-6 lg:order-none lg:self-start">
        <div className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onBack}>
            <ArrowLeft /> How to paint it
          </Button>
          <ConceptPainting
            concept={planned}
            seed={seed}
            width={W}
            height={H}
            light={DEFAULT_LIGHT}
            className="rounded-sm shadow-[0_2px_3px_rgb(0_0_0/0.15),0_10px_24px_-10px_rgb(0_0_0/0.3)]"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{concept.title}</h1>
            <p className="text-muted-foreground tabular-nums">The plan · {set.piece.widthCm} × {set.piece.heightCm} cm</p>
          </div>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="history">
          <h2 id="history" className="text-xs font-medium text-muted-foreground">Check-ins so far</h2>
          {history.length === 0
            ? <p className="text-muted-foreground">None yet. Take a photo at the end of each session.</p>
            : (
              <ul>
                {history.map(c => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { setShown(c); setPhoto(null) }}
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
            )}
        </section>

        <CheckInTrends history={history} shown={shown} onPick={c => { setShown(c); setPhoto(null) }} />
      </aside>

      <div className="flex flex-col gap-6" aria-live="polite">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-6 lg:pt-11">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">Check-ins</h2>
            <p className="max-w-[60ch] text-pretty text-muted-foreground">
              Photograph the whole canvas from the same spot each time, in daylight, with white paper held flat against its edge.
            </p>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }}
          />
          <Button onClick={() => input.current?.click()} disabled={!!phase} variant="outline">
            <Camera /> {photo ? 'Another photo' : 'New check-in'}
          </Button>
        </header>

        {error && <p role="alert" className="text-destructive">{error}</p>}

        {photo && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
            <PhotoStage url={photo.url} alt="The canvas photo" taps={taps} target={phase ? null : target} onTap={tap} />
            <div className="flex flex-col gap-4">
              <ol className="-mx-2.5 flex flex-col gap-1">
                <TapStep
                  label="White paper"
                  hint="Tap the paper by the canvas. Colors are corrected against it."
                  done={!!taps.white}
                  active={target === 'white'}
                  onPick={() => setTarget('white')}
                  onClear={() => { setTaps(t => ({ ...t, white: null })); setTarget('white') }}
                />
                <TapStep
                  label="Corners"
                  hint={taps.corners.length && taps.corners.length < 4
                    ? `${taps.corners.length} of 4 tapped.`
                    : 'Found automatically. Tap all 4 if they come out wrong.'}
                  optional
                  done={taps.corners.length > 0}
                  active={target === 'corners'}
                  onPick={() => { setTarget('corners'); if (taps.corners.length === 4) setTaps(t => ({ ...t, corners: [] })) }}
                  onClear={() => { setTaps(t => ({ ...t, corners: [] })); setTarget('corners') }}
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
              <Button onClick={submit} disabled={!ready} className="self-start">
                {phase ? <><LoaderCircle className="animate-spin" /> {phase}</> : 'Check in'}
              </Button>
              {!taps.white && <p className="text-xs text-muted-foreground">Tap the white paper first.</p>}
              {!cornersReady && <p className="text-xs text-muted-foreground">Tap all 4 corners, or redo to find them automatically.</p>}
            </div>
          </div>
        )}

        {!photo && shown && <Result checkin={shown} plan={{ concept: planned, seed, size: [W, H] }} />}
        {!photo && !shown && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-[4/3] max-h-[60dvh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <Camera className="size-6" aria-hidden />
            Take or choose a photo of the canvas
          </button>
        )}
      </div>
    </main>
  )
}
