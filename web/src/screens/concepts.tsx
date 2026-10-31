import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConceptPainting, LightMarker } from '@/components/lit-painting'
import { WallMockup } from '@/components/wall-mockup'
import { cn } from '@/lib/utils'
import { offBands, reliefSummary, type Concept, type Piece } from '@/lib/concepts'
import { DEFAULT_LIGHT, lightName, useLightDrag } from '@/lib/relief'

// Placeholder room, in cm, until the client's wall photo is in (OUR-139).
const SOFA = { w: 220, h: 82 }
const HANG_GAP = 22  // between the sofa back and the bottom of the canvas
const SKIRTING = 6
const DEFAULT_WALL_WIDTH = 300

type ConceptsProps = {
  concepts: Concept[]
  canvasPx: [number, number]
  piece: Piece
  onChoose: (index: number) => void
  initialPick?: number
  // The client's wall photo, when the brief came with one: the concepts hang on it.
  photo?: { briefId: string; url: string }
}

// The concepts hung on the client's wall at true scale, picked from an editorial index.
export function ConceptsScreen({ concepts, canvasPx: [W, H], piece, onChoose, initialPick = 0, photo }: ConceptsProps) {
  const [pick, setPick] = useState(initialPick)
  const [onPhoto, setOnPhoto] = useState(!!photo)
  const [light, setLight] = useState(DEFAULT_LIGHT)
  const drag = useLightDrag(light, setLight)
  const concept = concepts[pick]
  const off = offBands(concept)
  // Only the relief preview has a light to move; Muse's painting is a finished picture.
  const relief = !concept.layout

  const wall = {
    w: piece.wallWidthCm ?? DEFAULT_WALL_WIDTH,
    h: Math.max(210, SKIRTING + SOFA.h + HANG_GAP + piece.heightCm + 30),
  }
  const pct = (cm: number, of: number) => `${(cm / of) * 100}%`

  // Fetch all the paintings up front, so switching concepts shows the next one at once.
  useEffect(() => {
    concepts.forEach(c => { if (c.layout) new Image().src = c.layout.image })
  }, [concepts])

  return (
    <div className="grid flex-1 gap-8 px-6 pb-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 lg:px-10">
      <div className="flex flex-col gap-3">
        {photo && (
          <div role="radiogroup" aria-label="Wall" className="flex gap-1 self-start rounded-lg bg-muted p-0.5 text-xs">
            {[{ v: true, l: "Client's wall" }, { v: false, l: 'Sketch' }].map(o => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={onPhoto === o.v}
                onClick={() => setOnPhoto(o.v)}
                className={cn('rounded-md px-2.5 py-1 transition-colors duration-150 ease-out', onPhoto === o.v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}
        {photo && onPhoto ? (
          <WallMockup briefId={photo.briefId} wall={photo.url} concept={concept} seed={pick + 1} canvasPx={[W, H]} piece={piece} light={light} />
        ) : (
          <figure className="flex flex-col gap-3">
            <div
              className="relative mx-auto w-full overflow-hidden rounded-xl bg-[linear-gradient(180deg,oklch(0.93_0.012_75),oklch(0.89_0.014_70))]"
              style={{ aspectRatio: `${wall.w} / ${wall.h}`, maxWidth: `calc((100dvh - 9rem) * ${wall.w / wall.h})` }}
            >
              <div className="absolute inset-x-0 bottom-0 bg-[oklch(0.82_0.012_70)]" style={{ height: pct(SKIRTING, wall.h) }} aria-hidden />
              <svg
                aria-hidden
                viewBox={`0 0 ${SOFA.w} ${SOFA.h}`}
                className="absolute left-1/2 -translate-x-1/2 fill-[oklch(0.6_0.02_150)]"
                style={{ width: pct(SOFA.w, wall.w), height: pct(SOFA.h, wall.h), bottom: pct(SKIRTING, wall.h) }}
              >
                <rect x="14" y="0" width="192" height="52" rx="8" />
                <rect x="0" y="26" width="26" height="48" rx="7" />
                <rect x="194" y="26" width="26" height="48" rx="7" />
                <rect x="20" y="44" width="180" height="26" rx="5" className="fill-[oklch(0.56_0.02_150)]" />
                <rect x="10" y="70" width="200" height="6" rx="2" className="fill-[oklch(0.5_0.02_150)]" />
                <rect x="18" y="76" width="5" height="6" className="fill-[oklch(0.35_0.01_60)]" />
                <rect x="197" y="76" width="5" height="6" className="fill-[oklch(0.35_0.01_60)]" />
              </svg>
              <div
                {...(relief ? drag : {})}
                className={cn('absolute left-1/2 -translate-x-1/2', relief && 'cursor-grab touch-none select-none active:cursor-grabbing')}
                style={{ width: pct(piece.widthCm, wall.w), bottom: pct(SKIRTING + SOFA.h + HANG_GAP, wall.h) }}
              >
                <ConceptPainting
                  concept={concept}
                  seed={pick + 1}
                  width={W}
                  height={H}
                  light={light}
                  className="shadow-[0_2px_3px_rgb(0_0_0/0.18),0_14px_28px_-10px_rgb(0_0_0/0.3)]"
                />
                {relief && <LightMarker light={light} />}
              </div>
            </div>
            <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {piece.widthCm} × {piece.heightCm} cm on a {wall.w} cm wall{piece.wallWidthCm ? '' : ' (assumed)'}, to scale.
                The wall and sofa are placeholders until the wall photo is in.
              </span>
              {relief && <span>Lit from {lightName(light)} · drag on the painting</span>}
            </figcaption>
          </figure>
        )}
      </div>

      <aside className="flex flex-col gap-8 lg:pt-2">
        <ol className="flex flex-col" aria-label="Concepts">
          {concepts.map((c, i) => (
            <li key={c.title}>
              <button
                type="button"
                aria-pressed={i === pick}
                onClick={() => setPick(i)}
                className={cn(
                  'flex w-full items-baseline gap-4 border-b py-3 text-left transition-colors duration-150 ease-out',
                  i === pick ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="text-xs tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="flex-1 truncate text-base">{c.title}</span>
                <span className="flex gap-0.5" aria-hidden>
                  {c.bands.map(b => <span key={b.name} className="h-3 w-1.5 rounded-[1px]" style={{ background: b.mix.hex }} />)}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <section className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">{reliefSummary(concept)}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{concept.title}</h1>
          <p className="text-base text-pretty text-muted-foreground">{concept.idea}</p>
        </section>

        <section className="flex flex-col gap-2" aria-label="Colors">
          <div className="flex h-10 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]">
            {concept.bands.map((b, i) => (
              <span key={b.name} title={b.name} style={{ flexGrow: concept.layout?.shares[i] ?? b.width, background: b.mix.hex }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{concept.bands.map(b => b.name).join(' · ')}</p>
          {off.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
              {off.map(b => b.name).join(', ')}: the closest mix from your tubes is slightly off
              (ΔE {off.map(b => b.mix.delta_e.toFixed(1)).join(', ')}).
            </p>
          )}
        </section>

        {concept.layout_note && <p className="text-xs text-pretty text-muted-foreground">{concept.layout_note}</p>}

        <Button size="lg" className="self-start" onClick={() => onChoose(pick)}>Paint this one</Button>
      </aside>
    </div>
  )
}
