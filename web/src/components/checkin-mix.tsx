import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, TriangleAlert, Upload } from 'lucide-react'
import { usePhotoInput } from '@/components/photo-input'
import { PhotoStage, NO_TAPS } from '@/components/photo-stage'
import { Button } from '@/components/ui/button'
import { checkMix, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { when, type Point } from '@/lib/checkin'
import { latestMixes, type MixCheck, type MixResult, type MixState } from '@/lib/checks'
import type { Concept } from '@/lib/concepts'
import { recipeLine, type Recipe } from '@/lib/recipe'
import { cn } from '@/lib/utils'
import { useExample } from '@/lib/example'

const STATE: Record<MixState, { label: string; tone: string }> = {
  match: { label: 'Matches the mix', tone: 'text-emerald-800' },
  close: { label: 'Close', tone: 'text-muted-foreground' },
  off: { label: "Doesn't match", tone: 'text-amber-800' },
}

function MixReading({ result, warnings, takenAt }: { result: MixResult; warnings: string[]; takenAt: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-pretty">
        <span className={cn('font-medium', STATE[result.state].tone)}>{STATE[result.state].label}</span>
        <span className="text-muted-foreground tabular-nums">
          {' '}· ΔE {result.delta_e.toFixed(1)}{result.drift && `, ${result.drift} than the mix`} · {when(takenAt)}
        </span>
      </p>
      <ol className="flex flex-col gap-1">
        {result.advice.map((line, n) => (
          <li key={n} className={cn('text-pretty', result.advice.length > 1 && 'grid grid-cols-[1.25rem_1fr] gap-1')}>
            {result.advice.length > 1 && <span className="text-muted-foreground tabular-nums">{n + 1}.</span>}{line}
          </li>
        ))}
      </ol>
      {[...result.warnings, ...warnings].map(w => (
        <p key={w} className="flex gap-2 text-xs text-pretty text-amber-800"><TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />{w}</p>
      ))}
    </div>
  )
}

type MixSectionProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  recipe: Recipe
  checks: MixCheck[]
  // A band to check, asked for from one of the steps. nonce: asking again for the same band still counts.
  focus: { band: number; nonce: number } | null
  onCheck: (check: MixCheck) => void
}

// The paint in the bowl against the recipe: a photo, which color it should be, and the answer. Paint and white are
// found in the photo; tapping it only corrects what was found.
export function MixSection({ brief, set, concept, recipe, checks, focus, onCheck }: MixSectionProps) {
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [band, setBand] = useState<number | null>(null)
  // Asked for from a step: the next photo is of this color, so it needn't ask.
  const [asked, setAsked] = useState<number | null>(null)
  // This photo's readings, and the marks that corrected them.
  const [readings, setReadings] = useState<Map<number, MixCheck>>(new Map())
  const [taps, setTaps] = useState<Map<number, Point>>(new Map())
  const [white, setWhite] = useState<Point | null>(null)
  const [movingWhite, setMovingWhite] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useMemo(() => latestMixes(checks), [checks])
  const tinted = recipe.mixing.paste_in_mix

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  useEffect(() => { if (focus) setAsked(focus.band) }, [focus])

  const read = async (file: File, which: number, marks: { paint?: Point; white?: Point }) => {
    setError(null)
    setBand(which)
    setPhase('Reading the color…')
    try {
      const check = await checkMix(brief, set, concept, file, which, marks, setPhase)
      onCheck(check)
      setReadings(r => new Map(r).set(which, check))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPhase(null)
    }
  }

  const example = useExample()
  const input = usePhotoInput(file => {
    setError(null)
    setPhoto({ file, url: URL.createObjectURL(file) })
    setBand(null)
    setReadings(new Map())
    setTaps(new Map())
    setWhite(null)
    setMovingWhite(false)
    if (asked !== null) {
      setAsked(null)
      read(file, asked, {})
    }
  })

  const marksFor = (which: number, newWhite = white) => ({ paint: taps.get(which), white: newWhite ?? undefined })

  const tap = (p: Point) => {
    if (!photo || band === null) return
    if (movingWhite) {
      setWhite(p)
      setMovingWhite(false)
      read(photo.file, band, marksFor(band, p))
    } else {
      setTaps(t => new Map(t).set(band, p))
      read(photo.file, band, { ...marksFor(band), paint: p })
    }
  }

  const shown = band !== null ? readings.get(band) : undefined
  const result = shown?.results[0]
  const dots = [...readings].flatMap(([b, check]) => {
    const point = check.results[0]?.point
    return point ? [{ point, color: recipe.bands[b].mix_hex, label: recipe.bands[b].name }] : []
  })

  return (
    <div className="flex flex-col gap-5 pb-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          {example
            ? 'The photos of the mixes in the bowl taken while it was painted, each measured against the color it should be.'
            : <>Upload a photo of the {tinted ? 'tinted paste, with the paste already mixed in,' : 'paint'} and pick the color it should be. Anything white in the shot, like a rag or paper, makes the reading more exact. Acrylic dries a little darker than it looks wet.</>}
        </p>
        {input.element}
        {!example && <Button variant="outline" onClick={input.open} disabled={input.preparing || !!phase}>
          {input.preparing ? <LoaderCircle className="animate-spin" /> : <Upload />} {photo ? 'Another photo' : 'Upload a photo'}
        </Button>}
      </div>
      {(error || input.error) && <p role="alert" className="text-destructive">{error ?? input.error}</p>}

      {photo && (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <PhotoStage
            url={photo.url}
            alt="The paint in the bowl"
            taps={{ ...NO_TAPS, white: shown?.white ?? null }}
            dots={dots}
            target={phase || band === null ? null : movingWhite ? 'white' : 'paint'}
            onTap={tap}
          />
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1">
              <legend className="pb-1 text-xs font-medium text-muted-foreground">Which color should it be?</legend>
              {recipe.bands.map((b, i) => (
                <button
                  key={b.name}
                  type="button"
                  aria-pressed={band === i}
                  disabled={!!phase}
                  onClick={() => { setMovingWhite(false); read(photo.file, i, marksFor(i)) }}
                  className={cn(
                    'flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-muted/60 disabled:pointer-events-none',
                    band === i && 'bg-background shadow-[0_0_0_1px_rgb(0_0_0/0.08)]',
                  )}
                >
                  <span aria-hidden className="size-4 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: b.mix_hex }} />
                  <span className="min-w-0 flex-1 truncate capitalize">{b.name}</span>
                  {band === i && phase && <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
                  {readings.has(i) && !(band === i && phase) && <span className="text-xs text-muted-foreground">Checked</span>}
                </button>
              ))}
            </fieldset>
            {phase && <p className="text-muted-foreground">{phase}</p>}
            {shown && result && !phase && (
              <div className="flex flex-col gap-3 border-t pt-3">
                <MixReading result={result} warnings={shown.warnings} takenAt={shown.taken_at} />
                <p className="text-xs text-pretty text-muted-foreground">
                  {movingWhite
                    ? 'Tap something white in the photo.'
                    : <>Read at the {shown.white ? 'colored dot, with the white dot as white' : 'dot'}. Wrong spot? Tap the paint.</>}
                </p>
                <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={() => setMovingWhite(m => !m)}>
                  {movingWhite ? 'Cancel' : shown.white ? 'Pick another white' : 'Pick something white'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <ul aria-label="Colors">
        {recipe.bands.map((b, i) => {
          const reading = latest.get(i)
          return (
            <li key={b.name} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t py-4 first:border-t-0">
              <span
                aria-hidden
                title={reading ? 'The mix, then yours' : 'The mix'}
                className="relative size-10 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
                style={{ background: b.mix_hex }}
              >
                {reading && <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: reading.result.measured_hex }} />}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="font-medium capitalize">{b.name}</h3>
                <p className="text-pretty text-muted-foreground">{recipeLine(b)}</p>
                {reading && <MixReading result={reading.result} warnings={reading.check.warnings} takenAt={reading.check.taken_at} />}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
