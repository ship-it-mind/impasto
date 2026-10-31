import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Download, Ruler, SquareDashedMousePointer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Point } from '@/lib/checkin'
import { drawOnQuad, isConvex, moveQuad, orderQuad, pxPerCm, quadCm, quadSides, quadTransform, rectangle, resizeQuad, type Mockup, type Quad, type SizeCm } from '@/lib/wall'
import { cn } from '@/lib/utils'

const CORNERS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left']
// Arrow keys nudge a corner by this share of the photo's width.
const NUDGE = 0.005

type WallMockupProps = {
  wall: string
  mockup: Mockup | null
  // The piece's size, to draw at when the scale is set. Without one, the scale sets a first guess.
  size: SizeCm | null
  wallWidthCm?: number | null
  // Live while dragging.
  onChange: (mockup: Mockup) => void
  // Once it's settled: a drag let go, corners marked or a scale set. A rejection shows as an error.
  onCommit: (mockup: Mockup) => void | Promise<void>
  // The corners can be moved or marked, which changes the size.
  onResize?: (size: SizeCm) => void
  // The painting to draw on the wall, and its size in px. Without it, an outline.
  art?: { node: ReactNode; px: [number, number]; title: string }
  note?: ReactNode
}

// The wall photo with the piece on it at true size. The scale comes from a line marked on something of known
// length, or Spark's estimate; the piece is dragged to where it hangs, and its corners can be moved or marked.
export function WallMockup({ wall, mockup, size, wallWidthCm, onChange, onCommit, onResize, art, note }: WallMockupProps) {
  const img = useRef<HTMLImageElement>(null)
  const painting = useRef<HTMLDivElement>(null)
  const [photo, setPhoto] = useState<Point | null>(null)
  const [shownWidth, setShownWidth] = useState(0)
  const [measuring, setMeasuring] = useState(!mockup)
  const [line, setLine] = useState<Point[]>([])
  const [length, setLength] = useState('')
  const [marks, setMarks] = useState<Point[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const drag = useRef<{ corner: number } | { dx: number; dy: number } | null>(null)
  const latest = useRef(mockup)
  useEffect(() => { latest.current = mockup }, [mockup])

  // The photo's size on screen: the painting is drawn in these pixels. It is 0 while the screen is hidden.
  useLayoutEffect(() => {
    const el = img.current
    if (!el) return
    const seen = new ResizeObserver(() => setShownWidth(el.getBoundingClientRect().width))
    seen.observe(el)
    return () => seen.disconnect()
  }, [])

  const commit = (next: Mockup) => {
    setError(null)
    Promise.resolve(onCommit(next)).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save that."))
  }
  const update = (next: Mockup) => {
    latest.current = next
    onChange(next)
  }

  // Photo pixels under a pointer.
  const toPhoto = (e: PointerEvent): Point => {
    const r = img.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * photo![0], ((e.clientY - r.top) / r.height) * photo![1]]
  }
  const pct = ([x, y]: Point) => ({ left: `${(x / photo![0]) * 100}%`, top: `${(y / photo![1]) * 100}%` })

  const tap = (e: PointerEvent<HTMLImageElement>) => {
    if (!photo) return
    const p = toPhoto(e)
    if (marks) {
      const next = [...marks, p]
      if (next.length < 4) { setMarks(next); return }
      setMarks(null)
      const corners = orderQuad(next)
      if (!mockup || !isConvex(corners)) { setError("Those 4 points don't make a shape the painting can sit in. Mark them again."); return }
      const marked = { ...mockup, corners }
      update(marked)
      onResize?.(quadCm(marked))
      commit(marked)
    } else if (measuring) {
      setLine(l => (l.length >= 2 ? [p] : [...l, p]))
    }
  }

  // A new scale keeps the piece's size in cm, so its corners move.
  const setScale = (e: FormEvent) => {
    e.preventDefault()
    if (line.length < 2 || !photo) return
    const cm = Number(length)
    if (!(cm > 0 && cm <= 5000)) { setError('Type the length in cm.'); return }
    const scale = { line: [line[0], line[1]] as [Point, Point], length_cm: cm }
    const px = pxPerCm(scale)
    // No size yet: a first guess at a third of the photo's width, in 4:3.
    const width = size ? size.w * px : photo[0] / 3, height = size ? size.h * px : (photo[0] / 3) * 0.75
    const next: Mockup = {
      ...scale,
      corners: mockup ? resizeQuad(mockup.corners, width, height) : rectangle([photo[0] / 2, photo[1] * 0.4], width, height),
    }
    update(next)
    if (!size) onResize?.(quadCm(next))
    commit(next)
    setMeasuring(false)
    setLine([])
  }

  // Dragging keeps the grab point under the pointer; it is saved on release.
  const grab = (e: PointerEvent<Element>) => {
    if (!mockup || measuring || marks) return
    const [x, y] = toPhoto(e)
    const [cx, cy] = mockup.corners[0]
    drag.current = { dx: cx - x, dy: cy - y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const grabCorner = (e: PointerEvent<Element>, corner: number) => {
    e.stopPropagation()
    drag.current = { corner }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<Element>) => {
    const held = drag.current, at = latest.current
    if (!held || !at) return
    const [x, y] = toPhoto(e)
    if ('corner' in held) {
      const corners = at.corners.map((c, i) => (i === held.corner ? [x, y] : c)) as Quad
      if (!isConvex(corners)) return
      const next = { ...at, corners }
      update(next)
      onResize?.(quadCm(next))
    } else {
      update({ ...at, corners: moveQuad(at.corners, x + held.dx - at.corners[0][0], y + held.dy - at.corners[0][1]) })
    }
  }
  const drop = () => {
    if (!drag.current || !latest.current) return
    drag.current = null
    commit(latest.current)
  }
  const nudge = (e: KeyboardEvent, corner: number) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!step || !mockup || !photo) return
    e.preventDefault()
    const by = photo[0] * NUDGE
    const corners = mockup.corners.map((c, i) => (i === corner ? [c[0] + step[0] * by, c[1] + step[1] * by] : c)) as Quad
    if (!isConvex(corners)) return
    const next = { ...mockup, corners }
    update(next)
    onResize?.(quadCm(next))
    commit(next)
  }

  // The photo with the painting drawn on it, at the photo's full size.
  const download = () => {
    const picture = img.current, source = painting.current?.querySelector<HTMLCanvasElement | HTMLImageElement>('canvas, img')
    if (!picture || !source || !mockup || !photo || !art) return
    const out = document.createElement('canvas')
    out.width = photo[0]
    out.height = photo[1]
    const ctx = out.getContext('2d')!
    ctx.drawImage(picture, 0, 0)
    const { across, down } = quadSides(mockup.corners)
    ctx.save()
    ctx.shadowColor = 'rgb(0 0 0 / 0.35)'
    ctx.shadowBlur = down * 0.06
    ctx.shadowOffsetY = down * 0.025
    ctx.beginPath()
    mockup.corners.forEach(([x, y]) => ctx.lineTo(x, y))
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    // Cropped to the canvas's shape, as it shows on screen.
    const [artW, artH] = source instanceof HTMLImageElement ? [source.naturalWidth, source.naturalHeight] : [source.width, source.height]
    const cropW = Math.min(artW, artH * (across / down)), cropH = Math.min(artH, artW * (down / across))
    drawOnQuad(ctx, source, { x: (artW - cropW) / 2, y: (artH - cropH) / 2, w: cropW, h: cropH }, mockup.corners)
    out.toBlob(blob => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${art.title} on the wall.png`
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/png')
  }

  const placed = mockup && photo && !measuring && !marks
  const shown = photo && shownWidth ? shownWidth / photo[0] : 0
  const onScreen = (q: Quad) => q.map(([x, y]) => [x * shown, y * shown]) as Quad

  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto w-fit overflow-hidden rounded-xl">
        <img
          ref={img}
          src={wall}
          alt="The client's wall"
          draggable={false}
          onLoad={e => setPhoto([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
          onPointerDown={tap}
          className={cn('block max-h-[calc(100dvh-9rem)] max-w-full select-none', (measuring || marks) && 'cursor-crosshair')}
        />
        {placed && art && shown > 0 && (
          <div
            ref={painting}
            onPointerDown={grab}
            onPointerMove={move}
            onPointerUp={drop}
            onPointerCancel={drop}
            className="absolute top-0 left-0 origin-top-left cursor-grab touch-none select-none active:cursor-grabbing"
            style={{ width: art.px[0], height: art.px[1], transform: quadTransform(onScreen(mockup.corners), art.px[0], art.px[1]) }}
          >
            {art.node}
          </div>
        )}
        {placed && !art && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${photo[0]} ${photo[1]}`} preserveAspectRatio="none">
            <polygon
              points={mockup.corners.map(p => p.join(',')).join(' ')}
              onPointerDown={grab}
              onPointerMove={move}
              onPointerUp={drop}
              onPointerCancel={drop}
              className="pointer-events-auto cursor-grab touch-none fill-sky-400/25 stroke-sky-400 active:cursor-grabbing"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {placed && onResize && mockup.corners.map((corner, i) => (
          <button
            key={CORNERS[i]}
            type="button"
            aria-label={`${CORNERS[i]} corner of the painting. Arrow keys move it.`}
            onPointerDown={e => grabCorner(e, i)}
            onPointerMove={move}
            onPointerUp={drop}
            onPointerCancel={drop}
            onKeyDown={e => nudge(e, i)}
            className="absolute flex size-11 -translate-1/2 cursor-grab touch-none items-center justify-center rounded-full outline-none active:cursor-grabbing"
            style={pct(corner)}
          >
            <span className="size-3.5 rounded-full bg-sky-500 shadow-[0_0_0_2px_rgb(255_255_255/0.9),0_1px_4px_rgb(0_0_0/0.5)] [button:focus-visible>&]:shadow-[0_0_0_3px_var(--foreground)]" />
          </button>
        ))}
        {photo && marks?.map((p, i) => (
          <span key={i} className="pointer-events-none absolute size-3.5 -translate-1/2 rounded-full bg-sky-500 shadow-[0_0_0_2px_rgb(255_255_255/0.9)]" style={pct(p)} />
        ))}
        {measuring && photo && line.length > 0 && (
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${photo[0]} ${photo[1]}`} preserveAspectRatio="none">
            {line.length === 2 && (
              <line x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} className="stroke-sky-400" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            )}
            {line.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={6} className="fill-sky-400 stroke-white" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
          </svg>
        )}
      </div>

      {measuring && (
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
                  placeholder={wallWidthCm ? String(wallWidthCm) : '200'}
                  className="h-8 w-20 rounded-md bg-background px-2 text-base text-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.12)] tabular-nums md:text-sm"
                />
                cm long
              </label>
              <Button type="submit" size="sm">Set it</Button>
              {wallWidthCm && !length && <span>The brief says the wall is {wallWidthCm} cm wide.</span>}
            </>
          )}
          {mockup && <Button type="button" variant="ghost" size="sm" onClick={() => { setMeasuring(false); setLine([]) }}>Cancel</Button>}
        </form>
      )}
      {marks && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span>Tap where the painting's 4 corners should go. {marks.length} of 4.</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMarks(null)}>Cancel</Button>
        </div>
      )}
      {placed && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 basis-60 text-pretty">
            {note}{' '}
            {mockup.estimated
              ? `The scale is an estimate from the photo, about ${mockup.length_cm} cm across. Set it for a true fit.`
              : `Scale from a ${mockup.length_cm} cm line.`}
          </span>
          <span className="flex flex-wrap gap-1">
            {onResize && <Button type="button" variant="ghost" size="sm" onClick={() => { setError(null); setMarks([]) }}><SquareDashedMousePointer /> Mark the corners</Button>}
            <Button type="button" variant="ghost" size="sm" onClick={() => setMeasuring(true)}><Ruler /> {mockup.estimated ? 'Set the scale' : 'Re-measure'}</Button>
            {art && <Button type="button" variant="ghost" size="sm" onClick={download}><Download /> Save image</Button>}
          </span>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
