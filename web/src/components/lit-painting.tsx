import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { Concept } from '@/lib/concepts'
import { lightName, usePainting, type Stage } from '@/lib/relief'
import { relight } from '../../relief/engine.ts'

type LitPaintingProps = {
  concept: Concept
  seed: number
  // Render size in px; the painting keeps this aspect ratio.
  width: number
  height: number
  light: number
  gloss?: number
  // Stop part-way, as the painting would look at that stage.
  stage?: Stage
  className?: string
}

// Flat band colors, shown while the relief paints. Approximate: follows band widths only.
function flatGradient(concept: Concept): string {
  const total = concept.bands.reduce((s, b) => s + b.width, 0)
  let at = 0
  const stops = concept.bands.map(b => {
    const from = (at / total) * 100
    at += b.width
    return `${b.mix.hex} ${from}% ${(at / total) * 100}%`
  })
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

// A concept painted as knife-stroke relief, relit whenever `light` changes (at most once a frame).
export function LitPainting({ concept, seed, width, height, light, gloss = 0.15, stage, className }: LitPaintingProps) {
  const sf = usePainting(concept, seed, width, height, stage)
  const canvas = useRef<HTMLCanvasElement>(null)
  const buffer = useRef<ImageData | null>(null)
  const frame = useRef(0)

  useEffect(() => {
    if (!sf) return
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const ctx = canvas.current?.getContext('2d')
      if (!ctx) return
      if (buffer.current?.width !== width || buffer.current.height !== height) buffer.current = ctx.createImageData(width, height)
      relight(sf, buffer.current.data, light, gloss)
      ctx.putImageData(buffer.current, 0, 0)
    })
    return () => cancelAnimationFrame(frame.current)
  }, [sf, light, gloss, width, height])

  return (
    <div
      role="img"
      aria-label={`${concept.title}, relief preview lit from ${lightName(light)}`}
      className={cn('relative overflow-hidden', className)}
      style={{ aspectRatio: `${width} / ${height}`, background: sf ? undefined : flatGradient(concept) }}
    >
      <canvas
        ref={canvas}
        width={width}
        height={height}
        className={cn(
          'absolute inset-0 size-full transition-opacity duration-200 ease-out motion-reduce:transition-none',
          sf ? 'opacity-100' : 'opacity-0',
        )}
      />
      {!sf && (
        <span className="absolute inset-x-0 bottom-0 bg-black/30 px-3 py-1.5 text-xs text-white">Painting the relief…</span>
      )}
    </div>
  )
}

// A concept as the app shows it: Muse Image's painting, or the relief preview when Muse
// has no usable painting of it. The painting is cropped to the canvas's exact shape.
export function ConceptPainting({ concept, ...lit }: LitPaintingProps) {
  if (!concept.layout) return <LitPainting concept={concept} {...lit} />
  return (
    <img
      src={concept.layout.image}
      alt={`${concept.title}, painted by Muse Image`}
      draggable={false}
      className={cn('block w-full bg-muted object-cover', lit.className)}
      style={{ aspectRatio: `${lit.width} / ${lit.height}` }}
    />
  )
}

// A small sun on the painting's edge, where the light comes from.
export function LightMarker({ light, className }: { light: number; className?: string }) {
  const a = (light * Math.PI) / 180
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute size-3.5 -translate-1/2 rounded-full bg-amber-100 shadow-[0_0_0_2px_rgb(0_0_0/0.25),0_0_16px_6px_rgb(255_236_179/0.7)]',
        className,
      )}
      style={{ left: `${50 + Math.cos(a) * 44}%`, top: `${50 + Math.sin(a) * 40}%` }}
    />
  )
}
