import { useId } from 'react'
import { WallMockup } from '@/components/wall-mockup'
import { Button } from '@/components/ui/button'
import type { WallFit } from '@/lib/brief'
import type { Mockup, SizeCm } from '@/lib/wall'

// What's typed in the two boxes, which can be empty or half-typed.
export type SizeText = { w: string; h: string }

const textOf = (size: SizeCm): SizeText => ({ w: String(size.w), h: String(size.h) })

// A usable size in cm from what's typed, if it is one. Same range as the backend's.
export function sizeFrom({ w, h }: SizeText): SizeCm | null {
  const width = Number(w), height = Number(h)
  return width >= 5 && width <= 2000 && height >= 5 && height <= 2000 ? { w: width, h: height } : null
}

function CmInput({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={5}
          max={2000}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="h-9 w-24 rounded-md bg-background px-3 text-base tabular-nums shadow-[0_0_0_1px_rgb(0_0_0/0.12)] outline-none focus-visible:shadow-[0_0_0_2px_var(--foreground)] disabled:opacity-50 md:text-sm"
        />
        <span className="text-xs text-muted-foreground">cm</span>
      </div>
    </div>
  )
}

type PieceSizeProps = {
  size: SizeText
  disabled: boolean
  // What Spark recommends for the wall photo, and the photo itself. Both only when there's a photo.
  fit?: WallFit | null
  wall?: string | null
  // Where the piece hangs. undefined: still loading; null: nothing placed yet.
  mockup?: Mockup | null
  wallWidthCm: number | null
  // The size was typed: the piece on the wall follows it.
  onTyped: (size: SizeText) => void
  // The corners moved: the size follows them.
  onSize: (size: SizeCm) => void
  onMockup: (mockup: Mockup) => void
  onMockupDone: (mockup: Mockup) => void | Promise<void>
  // Only to look at, as on the example piece.
  locked?: boolean
}

// The piece's size: typed, or marked on the wall photo. With a photo it starts at what Spark recommends for that wall, or what the client asked for.
export function PieceSize({ size, disabled, fit, wall, mockup, wallWidthCm, onTyped, onSize, onMockup, onMockupDone, locked = false }: PieceSizeProps) {
  const current = sizeFrom(size)
  const fitSize = fit ? { w: fit.width_cm, h: fit.height_cm } : null
  const onFit = !!fitSize && current?.w === fitSize.w && current.h === fitSize.h
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium">What width and height would you like for the piece?</h2>
      <div className="flex flex-wrap items-end gap-3">
        <CmInput label="Width" value={size.w} disabled={disabled} onChange={w => onTyped({ ...size, w })} />
        <CmInput label="Height" value={size.h} disabled={disabled} onChange={h => onTyped({ ...size, h })} />
        {fitSize && !onFit && !disabled && (
          <Button type="button" variant="secondary" onClick={() => onTyped(textOf(fitSize))}>
            Use {fitSize.w} × {fitSize.h} cm
          </Button>
        )}
      </div>
      {fit && (
        <p className="max-w-[65ch] text-xs text-pretty text-muted-foreground">
          <span className="font-medium text-foreground">Recommended for this wall: {fit.width_cm} × {fit.height_cm} cm.</span> {fit.reason}
        </p>
      )}
      {wall && mockup !== undefined && (
        <WallMockup
          wall={wall}
          mockup={mockup}
          size={current}
          wallWidthCm={wallWidthCm}
          onChange={onMockup}
          onCommit={onMockupDone}
          onResize={locked ? undefined : onSize}
          locked={locked}
          note={locked ? 'Where it hangs on the wall.' : 'Drag the corners to change its width and height, or the middle to move it.'}
        />
      )}
    </section>
  )
}
