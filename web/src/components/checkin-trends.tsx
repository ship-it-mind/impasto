import { TriangleAlert } from 'lucide-react'
import { DRIFT_DE, percent, when, type CheckIn } from '@/lib/checkin'
import { cn } from '@/lib/utils'

// Chart geometry in viewBox units; the SVGs stretch to the column's width.
const WIDTH = 320
const PAD = 4
// Room at the sides for the end points.
const PAD_X = 10

type TrendsProps = { history: CheckIn[]; shown: CheckIn | null; onPick: (c: CheckIn) => void }

// Across check-ins: how much is painted, then each band's color drift against the
// ΔE at which a check-in calls it out. One neutral line per chart; bands are told
// apart by swatch and name, not line color. Click a point to open that check-in.
export function CheckInTrends({ history, shown, onPick }: TrendsProps) {
  if (history.length < 2) return null
  const times = history.map(c => new Date(c.taken_at).getTime())
  const t0 = times[0], span = times[times.length - 1] - t0 || 1
  const x = (i: number) => PAD_X + ((times[i] - t0) / span) * (WIDTH - 2 * PAD_X)
  const bands = history[history.length - 1].bands

  return (
    <section className="flex flex-col gap-4" aria-labelledby="trends">
      <h2 id="trends" className="text-xs font-medium text-muted-foreground">Over time</h2>
      <Sparkline
        label="Painted"
        height={64}
        max={1}
        values={history.map(c => c.coverage)}
        x={x}
        history={history}
        shown={shown}
        onPick={onPick}
        format={percent}
        latest={percent(history[history.length - 1].coverage)}
      />
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Color drift per band. Above the dashed line ({`ΔE ${DRIFT_DE}`}) a check-in calls it out.
        </p>
        {bands.map(band => {
          const values = history.map(c => c.bands[band.id]?.delta_e ?? null)
          const last = [...values].reverse().find(v => v !== null) ?? null
          const max = Math.max(DRIFT_DE * 2, ...values.map(v => v ?? 0))
          return (
            <Sparkline
              key={band.id}
              label={band.name}
              swatch={band.planned_hex}
              height={44}
              max={max}
              threshold={DRIFT_DE}
              values={values}
              x={x}
              history={history}
              shown={shown}
              onPick={onPick}
              format={v => `ΔE ${v.toFixed(1)}`}
              latest={last === null ? 'Not measured yet' : `ΔE ${last.toFixed(1)}`}
              warn={last !== null && last >= DRIFT_DE}
            />
          )
        })}
      </div>
    </section>
  )
}

type SparklineProps = {
  label: string
  swatch?: string
  height: number
  max: number
  threshold?: number
  values: (number | null)[]
  x: (i: number) => number
  history: CheckIn[]
  shown: CheckIn | null
  onPick: (c: CheckIn) => void
  format: (v: number) => string
  latest: string
  warn?: boolean
}

function Sparkline({ label, swatch, height, max, threshold, values, x, history, shown, onPick, format, latest, warn }: SparklineProps) {
  const y = (v: number) => height - PAD - (Math.min(v, max) / max) * (height - 2 * PAD)
  const points = values.flatMap((v, i) => (v === null ? [] : [[x(i), y(v), i, v] as const]))
  const at = history.findIndex(c => c.id === shown?.id)

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="flex items-baseline justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          {swatch && <span aria-hidden className="size-2.5 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: swatch }} />}
          <span className="truncate">{label}</span>
        </span>
        <span className={cn('flex items-center gap-1 whitespace-nowrap tabular-nums', warn ? 'text-amber-800' : 'text-muted-foreground')}>
          {warn && <TriangleAlert className="size-3" aria-hidden />}
          {latest}
        </span>
      </figcaption>
      {/* Points are HTML over the SVG, so they stay round however wide the chart stretches. */}
      <div className="relative" style={{ aspectRatio: `${WIDTH} / ${height}` }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          role="img"
          aria-label={`${label}: ${points.map(([, , i, v]) => `${when(history[i].taken_at)} ${format(v)}`).join(', ') || 'not measured yet'}`}
        >
          <line x1={PAD} x2={WIDTH - PAD} y1={height - PAD} y2={height - PAD} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {threshold !== undefined && (
            <line x1={PAD} x2={WIDTH - PAD} y1={y(threshold)} y2={y(threshold)} className="stroke-muted-foreground/50" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
          {at >= 0 && <line x1={x(at)} x2={x(at)} y1={0} y2={height} className="stroke-foreground/15" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          {points.length > 1 && (
            <polyline
              points={points.map(([px, py]) => `${px},${py}`).join(' ')}
              fill="none"
              className="stroke-foreground/70"
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {points.map(([px, py, i, v]) => (
          <button
            key={i}
            type="button"
            title={`${when(history[i].taken_at)}: ${format(v)}`}
            aria-label={`${label}, ${when(history[i].taken_at)}: ${format(v)}`}
            onClick={() => onPick(history[i])}
            className="group absolute flex size-6 -translate-1/2 items-center justify-center"
            style={{ left: `${(px / WIDTH) * 100}%`, top: `${(py / height) * 100}%` }}
          >
            <span
              className={cn(
                'size-2 rounded-full shadow-[0_0_0_2px_var(--color-background)] transition-transform duration-150 ease-out group-hover:scale-150',
                threshold !== undefined && v >= threshold ? 'bg-amber-700' : 'bg-foreground/80',
                shown?.id === history[i].id && 'scale-125',
              )}
            />
          </button>
        ))}
      </div>
    </figure>
  )
}
