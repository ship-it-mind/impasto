import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Download, Ruler } from 'lucide-react'
import { ConceptPainting } from '@/components/lit-painting'
import { Button } from '@/components/ui/button'
import { getMockup, saveMockup, type Mockup } from '@/lib/api'
import type { Point } from '@/lib/checkin'
import type { Concept, Piece } from '@/lib/concepts'
import { cn } from '@/lib/utils'

type WallMockupProps = {
  briefId: string
  wall: string
  concept: Concept
  seed: number
  canvasPx: [number, number]
  piece: Piece
  light: number
}

const SHADOW = 'shadow-[0_2px_3px_rgb(0_0_0/0.25),0_14px_28px_-10px_rgb(0_0_0/0.4)]'

// The concept hung on the client's own wall photo at true size. Scale comes from a
// line she marks on something she knows the length of (taken as seen straight on);
// she drags the canvas to where it will hang. Both are kept with the piece.
export function WallMockup({ briefId, wall, concept, seed, canvasPx: [W, H], piece, light }: WallMockupProps) {
  const img = useRef<HTMLImageElement>(null)
  const painting = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Point | null>(null)
  const [mockup, setMockup] = useState<Mockup | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [measuring, setMeasuring] = useState(false)
  const [line, setLine] = useState<Point[]>([])
  const [length, setLength] = useState('')
  const [error, setError] = useState<string | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    getMockup(briefId)
      .then(m => { setMockup(m); setMeasuring(!m) })
      .catch(() => setMeasuring(true))
      .finally(() => setLoaded(true))
  }, [briefId])

  // Photo pixels under a pointer.
  const toPhoto = (e: PointerEvent): Point => {
    const r = img.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * size![0], ((e.clientY - r.top) / r.height) * size![1]]
  }
  const pct = ([x, y]: Point) => ({ left: `${(x / size![0]) * 100}%`, top: `${(y / size![1]) * 100}%` })

  const tap = (e: PointerEvent<HTMLImageElement>) => {
    if (!measuring || !size) return
    setLine(l => (l.length >= 2 ? [toPhoto(e)] : [...l, toPhoto(e)]))
  }

  const setScale = async (e: FormEvent) => {
    e.preventDefault()
    if (line.length < 2 || !size) return
    const cm = Number(length)
    if (!(cm > 0)) { setError('Type the length in cm.'); return }
    try {
      const next = await saveMockup(briefId, {
        line: [line[0], line[1]], length_cm: cm, center: mockup?.center ?? [size[0] / 2, size[1] * 0.4],
      })
      setMockup(next)
      setMeasuring(false)
      setLine([])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the scale.")
    }
  }

  // Dragging the canvas keeps the grab point under the pointer; it is saved on release.
  const grab = (e: PointerEvent<HTMLDivElement>) => {
    if (!mockup || measuring) return
    const [x, y] = toPhoto(e)
    drag.current = { dx: mockup.center[0] - x, dy: mockup.center[1] - y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !mockup) return
    const [x, y] = toPhoto(e)
    setMockup({ ...mockup, center: [x + drag.current.dx, y + drag.current.dy] })
  }
  const drop = () => {
    if (!drag.current || !mockup) return
    drag.current = null
    saveMockup(briefId, mockup).catch(() => setError("Couldn't save where it hangs."))
  }

  // The photo with the painting drawn on it, at the photo's full size.
  const download = () => {
    const photo = img.current, art = painting.current?.querySelector<HTMLCanvasElement | HTMLImageElement>('canvas, img')
    if (!photo || !art || !mockup || !size) return
    const out = document.createElement('canvas')
    out.width = size[0]
    out.height = size[1]
    const ctx = out.getContext('2d')!
    ctx.drawImage(photo, 0, 0)
    const w = piece.widthCm * pxPerCm(mockup), h = piece.heightCm * pxPerCm(mockup)
    ctx.shadowColor = 'rgb(0 0 0 / 0.35)'
    ctx.shadowBlur = h * 0.06
    ctx.shadowOffsetY = h * 0.025
    // Cropped to the canvas's shape, as it shows on screen.
    const [artW, artH] = art instanceof HTMLImageElement ? [art.naturalWidth, art.naturalHeight] : [art.width, art.height]
    const cropW = Math.min(artW, artH * (w / h)), cropH = Math.min(artH, artW * (h / w))
    ctx.drawImage(art, (artW - cropW) / 2, (artH - cropH) / 2, cropW, cropH, mockup.center[0] - w / 2, mockup.center[1] - h / 2, w, h)
    out.toBlob(blob => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${concept.title} on the wall.png`
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/png')
  }

  const placed = mockup && size && !measuring
  const scale = mockup && size ? pxPerCm(mockup) / size[0] : 0  // canvas cm → share of the photo's width

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto w-fit overflow-hidden rounded-xl">
        <img
          ref={img}
          src={wall}
          alt="The client's wall"
          draggable={false}
          onLoad={e => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
          onPointerDown={tap}
          className={cn('block max-h-[calc(100dvh-9rem)] max-w-full select-none', measuring && 'cursor-crosshair')}
        />
        {placed && (
          <div
            ref={painting}
            onPointerDown={grab}
            onPointerMove={move}
            onPointerUp={drop}
            onPointerCancel={drop}
            className="absolute -translate-1/2 cursor-grab touch-none select-none active:cursor-grabbing"
            style={{ ...pct(mockup.center), width: `${piece.widthCm * scale * 100}%` }}
          >
            <ConceptPainting concept={concept} seed={seed} width={W} height={H} light={light} className={SHADOW} />
          </div>
        )}
        {measuring && size && line.length > 0 && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size[0]} ${size[1]}`} preserveAspectRatio="none">
            {line.length === 2 && (
              <line x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} className="stroke-sky-400" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            )}
            {line.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={6} className="fill-sky-400 stroke-white" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          </svg>
        )}
      </div>

      {loaded && measuring && (
        <form onSubmit={setScale} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground"><Ruler className="size-3.5" aria-hidden /> Set the scale:</span>
          {line.length < 2 ? (
            <span>tap both ends of something on the wall you know the length of, like the wall itself or a door frame.</span>
          ) : (
            <>
              <label className="flex items-center gap-2">
                That line is
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  autoFocus
                  value={length}
                  onChange={e => setLength(e.target.value)}
                  placeholder={piece.wallWidthCm ? String(piece.wallWidthCm) : '200'}
                  className="h-8 w-20 rounded-md bg-background px-2 text-base text-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.12)] tabular-nums md:text-sm"
                />
                cm long
              </label>
              <Button type="submit" size="sm">Hang it</Button>
              {piece.wallWidthCm && !length && <span>The brief says the wall is {piece.wallWidthCm} cm wide.</span>}
            </>
          )}
          {mockup && <Button type="button" variant="ghost" size="sm" onClick={() => { setMeasuring(false); setLine([]) }}>Cancel</Button>}
          {error && <span role="alert" className="basis-full text-destructive">{error}</span>}
        </form>
      )}
      {placed && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {piece.widthCm} × {piece.heightCm} cm at true scale, from a {mockup.length_cm} cm line. Drag the canvas to where it hangs.
          </span>
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setMeasuring(true)}><Ruler /> Re-measure</Button>
            <Button variant="ghost" size="sm" onClick={download}><Download /> Save image</Button>
          </span>
          {error && <span role="alert" className="basis-full text-destructive">{error}</span>}
        </div>
      )}
    </div>
  )
}

function pxPerCm(m: Mockup): number {
  const [[x1, y1], [x2, y2]] = m.line
  return Math.hypot(x2 - x1, y2 - y1) / m.length_cm
}
