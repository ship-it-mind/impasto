import { useEffect, useRef, useState } from 'react'
import type { Concept } from '@/lib/concepts'
import { drawStage, type StageView } from '@/lib/stages'
import { cn } from '@/lib/utils'

type StagePictureProps = {
  concept: Concept
  seed: number
  width: number
  height: number
  view: StageView
  // What the picture shows, for screen readers.
  label: string
  className?: string
}

// The canvas as it should look once a stage of the painting is done.
export function StagePicture({ concept, seed, width, height, view, label, className }: StagePictureProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  const viewKey = JSON.stringify(view)

  useEffect(() => {
    let alive = true
    const element = canvas.current
    if (!element) return
    drawStage(element, concept, seed, width, height, JSON.parse(viewKey) as StageView)
      .then(() => { if (alive) setDrawn(true) })
      .catch(() => {})
    return () => { alive = false }
  }, [concept, seed, width, height, viewKey])

  return (
    <div className={cn('overflow-hidden bg-muted', className)} style={{ aspectRatio: `${width} / ${height}` }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className={cn('block size-full transition-opacity duration-200 ease-out motion-reduce:transition-none', drawn ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  )
}
