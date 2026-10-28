// Relief previews in the browser: paint once in a worker, relight on demand.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ConceptSpec } from '../../relief/bands.ts'
import { Surface } from '../../relief/engine.ts'
import type { Concept } from './concepts'

// Each painting is kept, so switching concepts or remounting never repaints.
const paints = new Map<string, Promise<Surface>>()

export function paint(concept: Concept, seed: number, W: number, H: number): Promise<Surface> {
  const key = JSON.stringify([concept.flow, concept.bands.map(b => [b.mix.hex, b.width, b.relief]), seed, W, H])
  let p = paints.get(key)
  if (!p) {
    p = new Promise(resolve => {
      const worker = new Worker(new URL('./relief.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ C: Float32Array; Hm: Float32Array }>) => {
        const sf = new Surface(W, H)
        sf.C.set(e.data.C)
        sf.Hm.set(e.data.Hm)
        worker.terminate()
        resolve(sf)
      }
      worker.postMessage({ spec: concept as unknown as ConceptSpec, W, H, seed })
    })
    paints.set(key, p)
  }
  return p
}

export function usePainting(concept: Concept, seed: number, W: number, H: number): Surface | null {
  const [sf, setSf] = useState<Surface | null>(null)
  useEffect(() => {
    let alive = true
    setSf(null)
    paint(concept, seed, W, H).then(s => { if (alive) setSf(s) })
    return () => { alive = false }
  }, [concept, seed, W, H])
  return sf
}

// Light direction in degrees: 0 = from the right, clockwise on screen (the engine's convention).
export const DEFAULT_LIGHT = 225

export function lightName(az: number): string {
  const names = ['the right', 'bottom right', 'below', 'bottom left', 'the left', 'top left', 'above', 'top right']
  return names[Math.round((((az % 360) + 360) % 360) / 45) % 8]
}

// Drag on a painting (or use the arrow keys) to swing the light around it.
// Spread the result onto the element that wraps the painting.
export function useLightDrag(light: number, setLight: (az: number) => void) {
  const dragging = useRef(false)
  const aim = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const az = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
    setLight(Math.round((az + 360) % 360))
  }
  return {
    role: 'slider',
    tabIndex: 0,
    'aria-label': 'Light direction',
    'aria-valuemin': 0,
    'aria-valuemax': 359,
    'aria-valuenow': light,
    'aria-valuetext': `Lit from ${lightName(light)}`,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      dragging.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      aim(e)
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => { if (dragging.current) aim(e) },
    onPointerUp: () => { dragging.current = false },
    onPointerCancel: () => { dragging.current = false },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 15 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -15 : 0
      if (!step) return
      e.preventDefault()
      setLight((light + step + 360) % 360)
    },
  }
}
