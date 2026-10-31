import { useRef, useState, type PointerEvent } from 'react'
import type { Point } from '@/lib/checkin'
import { cn } from '@/lib/utils'

// What the next tap on the photo marks.
export type Target = 'white' | 'corners' | 'ground'

export type Taps = { white: Point | null; corners: Point[]; ground: Point | null }
export const NO_TAPS: Taps = { white: null, corners: [], ground: null }

const MARK = { white: 'bg-white', corners: 'bg-sky-500', ground: 'bg-amber-500' }

// The photo, with a marker on each tapped point. Taps are kept in the photo's own pixels.
export function PhotoStage({ url, alt, taps, target, onTap }: { url: string; alt: string; taps: Taps; target: Target | null; onTap: (p: Point) => void }) {
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
