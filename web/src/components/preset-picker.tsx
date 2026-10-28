import { cn } from '@/lib/utils'
import { presetFacts, type Preset } from '@/lib/brief'

// A preset drawn as flat bands in its fallback palette, following its first flow.
export function PresetSwatch({ preset, className }: { preset: Preset; className?: string }) {
  const cols = preset.palette.slice(0, preset.bands[1]).map(p => p.hex)
  const flow = preset.flows[0]
  const span = (i: number, scale: number) => `${(i / cols.length) * scale}% ${((i + 1) / cols.length) * scale}%`
  const angle = flow === 'horizontal' ? 180 : flow === 'diagonal' || flow === 'diagonal split' ? 135 : flow === 'grid' ? 90 : 160
  const background = flow === 'arc'
    ? `radial-gradient(circle at 0% 100%, ${cols.map((c, i) => `${c} ${span(i, 140)}`).join(', ')})`
    : `linear-gradient(${angle}deg, ${cols.map((c, i) => `${c} ${span(i, 100)}`).join(', ')})`
  return <div aria-hidden className={cn('rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]', className)} style={{ background }} />
}

// Pick one preset, or none: clicking the chosen one again clears it.
export function PresetPicker({ presets, value, onChange }: { presets: Preset[]; value: string | null; onChange: (key: string | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Style preset" className="grid grid-cols-2 gap-3">
      {presets.map(p => {
        const on = value === p.key
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : p.key)}
            className={cn(
              'flex flex-col gap-2 rounded-lg bg-background p-2 text-left transition-[box-shadow] duration-150 ease-out',
              on ? 'shadow-[0_0_0_2px_var(--foreground)]' : 'shadow-[0_0_0_1px_rgb(0_0_0/0.08)] hover:shadow-[0_0_0_1px_rgb(0_0_0/0.2)]',
            )}
          >
            <PresetSwatch preset={p} className="aspect-[3/2] w-full" />
            <span className="px-0.5 font-medium">{p.name}</span>
            <span className="px-0.5 text-xs text-muted-foreground">{presetFacts(p)}</span>
          </button>
        )
      })}
    </div>
  )
}
