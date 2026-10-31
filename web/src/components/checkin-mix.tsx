import { useEffect, useMemo, useState } from 'react'
import { Camera, LoaderCircle, TriangleAlert } from 'lucide-react'
import { usePhotoInput } from '@/components/photo-input'
import { PhotoStage, TapStep, NO_TAPS } from '@/components/photo-stage'
import { Button } from '@/components/ui/button'
import { checkMixes, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import { when, type Point } from '@/lib/checkin'
import { latestMixes, type MixCheck, type MixResult, type MixState } from '@/lib/checks'
import type { Concept } from '@/lib/concepts'
import { recipeLine, type Recipe } from '@/lib/recipe'
import { cn } from '@/lib/utils'

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

// The paint in the bowl against the recipe: white paper, then a tap on each color in the photo.
export function MixSection({ brief, set, concept, recipe, checks, focus, onCheck }: MixSectionProps) {
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [white, setWhite] = useState<Point | null>(null)
  const [samples, setSamples] = useState<Map<number, Point>>(new Map())
  const [band, setBand] = useState(0)
  const [target, setTarget] = useState<'white' | 'paint' | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useMemo(() => latestMixes(checks), [checks])
  const tinted = recipe.mixing.paste_in_mix

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  useEffect(() => { if (focus) setBand(focus.band) }, [focus])

  const input = usePhotoInput(file => {
    setError(null)
    setPhoto({ file, url: URL.createObjectURL(file) })
    setWhite(null)
    setSamples(new Map())
    setTarget('white')
  })

  const tap = (p: Point) => {
    if (target === 'white') {
      setWhite(p)
      setTarget(samples.has(band) ? null : 'paint')
    } else if (target === 'paint') {
      setSamples(s => new Map(s).set(band, p))
      setTarget(white ? null : 'white')
    }
  }

  const submit = async () => {
    if (!photo || !white || samples.size === 0) return
    setError(null)
    setPhase('Reading the color…')
    try {
      const check = await checkMixes(brief, set, concept, photo.file, white, [...samples].map(([b, point]) => ({ band: b, point })), setPhase)
      onCheck(check)
      setPhoto(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPhase(null)
    }
  }

  const dots = [...samples].map(([b, point]) => ({ point, color: recipe.bands[b].mix_hex, label: recipe.bands[b].name }))
  const ready = !!photo && !!white && samples.size > 0 && !phase

  return (
    <div className="flex flex-col gap-5 pb-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          Photograph the {tinted ? 'tinted paste, with the paste already mixed in,' : 'paint'} in the bowl, in daylight, with a sheet of white paper beside it in the same light. Several bowls can go in one photo. Acrylic dries a little darker than it looks wet.
        </p>
        {input.element}
        <Button variant="outline" onClick={input.open} disabled={input.preparing || !!phase}>
          {input.preparing ? <LoaderCircle className="animate-spin" /> : <Camera />} {photo ? 'Another photo' : 'Check a mix'}
        </Button>
      </div>
      {(error || input.error) && <p role="alert" className="text-destructive">{error ?? input.error}</p>}

      {photo && (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <PhotoStage url={photo.url} alt="The paint in the bowl" taps={{ ...NO_TAPS, white }} dots={dots} target={phase ? null : target} onTap={tap} />
          <div className="flex flex-col gap-3">
            <ol className="-mx-2.5 flex flex-col gap-1">
              <TapStep
                label="White paper"
                hint="Tap the paper. Colors are corrected against it."
                done={!!white}
                active={target === 'white'}
                onPick={() => setTarget('white')}
                onClear={() => { setWhite(null); setTarget('white') }}
              />
            </ol>
            <fieldset className="flex flex-col gap-1">
              <legend className="pb-1 text-xs font-medium text-muted-foreground">Which color? Pick it, then tap it in the photo</legend>
              {recipe.bands.map((b, i) => (
                <button
                  key={b.name}
                  type="button"
                  aria-pressed={band === i && target === 'paint'}
                  onClick={() => { setBand(i); setTarget('paint') }}
                  className={cn(
                    'flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-muted/60',
                    band === i && target === 'paint' && 'bg-background shadow-[0_0_0_1px_rgb(0_0_0/0.08)]',
                  )}
                >
                  <span aria-hidden className="size-4 shrink-0 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: b.mix_hex }} />
                  <span className="min-w-0 flex-1 truncate capitalize">{b.name}</span>
                  {samples.has(i) && <span className="text-xs text-muted-foreground">Tapped</span>}
                </button>
              ))}
            </fieldset>
            <Button onClick={submit} disabled={!ready} className="self-start">
              {phase ? <><LoaderCircle className="animate-spin" /> {phase}</> : samples.size > 1 ? `Check ${samples.size} colors` : 'Check the color'}
            </Button>
            {!white && <p className="text-xs text-muted-foreground">The paper is needed: without it, the room's light would read as the paint's color.</p>}
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
