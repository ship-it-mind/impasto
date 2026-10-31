import { useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Point } from '@/lib/checkin'
import { cn } from '@/lib/utils'

// What the next tap on the photo marks.
export type Target = 'white' | 'corners' | 'ground'

export type Taps = { white: Point | null; corners: Point[]; ground: Point | null }
export const NO_TAPS: Taps = { white: null, corners: [], ground: null }

const MARK = { white: 'bg-white', corners: 'bg-sky-500', ground: 'bg-amber-500' }

// One step of marking a photo: what to tap, whether it's done, and a way to redo it.
export function TapStep({ label, hint, done, active, optional, onPick, onClear }: {
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

// A point marked in its own color, such as a paint tapped in a bowl.
export type Dot = { point: Point; color: string; label: string }

// The photo, with a marker on each tapped point. Taps are kept in the photo's own pixels.
export function PhotoStage({ url, alt, taps, dots = [], target, onTap }: { url: string; alt: string; taps: Taps; dots?: Dot[]; target: Target | 'paint' | null; onTap: (p: Point) => void }) {
  const img = useRef<HTMLImageElement>(null)
  const [size, setSize] = useState<Point | null>(null)
  const tap = (e: PointerEvent<HTMLImageElement>) => {
    const el = img.current
    if (!el || !target) return
    const r = el.getBoundingClientRect()
    onTap([Math.round(((e.clientX - r.left) / r.width) * el.naturalWidth), Math.round(((e.clientY - r.top) / r.height) * el.naturalHeight)])
  }
  const marks: [Point, Target, string][] = [
    ...(taps.white ? [[taps.white, 'white', 'White paper'] as [Point, Target, string]] : []),
    ...taps.corners.map((c, i) => [c, 'corners', `Corner ${i + 1}`] as [Point, Target, string]),
    ...(taps.ground ? [[taps.ground, 'ground', 'Bare canvas'] as [Point, Target, string]] : []),
  ]
  return (
    <div className="relative overflow-hidden rounded-lg bg-[oklch(0.25_0.005_80)]">
      <img
        ref={img}
        src={url}
        alt={alt}
        onLoad={e => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
        onPointerDown={tap}
        draggable={false}
        className={cn('mx-auto block max-h-[calc(100dvh-10rem)] w-auto max-w-full select-none', target && 'cursor-crosshair')}
      />
      {size && marks.map(([[x, y], kind, label]) => (
        <span
          key={label}
          title={label}
          className={cn('pointer-events-none absolute size-3.5 -translate-1/2 rounded-full shadow-[0_0_0_2px_rgb(0_0_0/0.6),0_0_0_4px_rgb(255_255_255/0.7)]', MARK[kind])}
          style={{ left: `${(x / size[0]) * 100}%`, top: `${(y / size[1]) * 100}%` }}
        />
      ))}
      {size && dots.map(({ point: [x, y], color, label }) => (
        <span
          key={label}
          title={label}
          className="pointer-events-none absolute size-3.5 -translate-1/2 rounded-full shadow-[0_0_0_2px_rgb(0_0_0/0.6),0_0_0_4px_rgb(255_255_255/0.7)]"
          style={{ left: `${(x / size[0]) * 100}%`, top: `${(y / size[1]) * 100}%`, background: color }}
        />
      ))}
      {size && taps.corners.length > 2 && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size[0]} ${size[1]}`} preserveAspectRatio="none">
          <polygon
            points={taps.corners.map(p => p.join(',')).join(' ')}
            className="fill-none stroke-sky-400"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  )
}
