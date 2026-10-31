import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PasteAdvice, WayBand } from '@/lib/recipe'
import { cn } from '@/lib/utils'

// Each band's color in the concept over what this way can mix, so a shortfall shows at a glance.
function ColorStrip({ bands }: { bands: WayBand[] }) {
  return (
    <ul className="flex gap-1" aria-label="Colors this way can mix">
      {bands.map(b => (
        <li
          key={b.name}
          title={`${b.name}: ΔE ${b.delta_e} from the concept`}
          className="h-9 min-w-0 flex-1 overflow-hidden rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]"
          style={{ background: `linear-gradient(${b.target_hex} 50%, ${b.mix_hex} 50%)` }}
        >
          <span className="sr-only">{b.name}: ΔE {b.delta_e} from the concept</span>
        </li>
      ))}
    </ul>
  )
}

type PasteMethodProps = {
  advice: PasteAdvice | null
  // True when the paste goes in the mix.
  value: boolean
  onChange: (pasteInMix: boolean) => void
  // The way the current recipes use, if there are any yet.
  applied: boolean | null
  busy: boolean
  onApply: () => void
}

export function PasteMethod({ advice, value, onChange, applied, busy, onApply }: PasteMethodProps) {
  const ways = [
    {
      pasteInMix: false, key: 'under' as const, title: 'Underneath, then paint on top',
      what: 'Build the relief in white paste, let it dry, then paint the color over it.',
      wait: advice ? `Wait ${advice.dry_time} before any color goes on` : 'Wait for the paste to dry before any color goes on',
    },
    {
      pasteInMix: true, key: 'tinted' as const, title: 'Mixed into the color (tinted paste)',
      what: 'Mix the paste into each color, so relief and color go on together, wet.',
      wait: 'No waiting between relief and color',
    },
  ]
  return (
    <section className="flex flex-col gap-4 border-t py-8" aria-labelledby="paste-method">
      <div className="flex flex-col gap-1">
        <h3 id="paste-method" className="text-lg font-medium">Modeling paste</h3>
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          {advice ? advice.reason : 'Comparing what each way can mix for this painting…'}
        </p>
      </div>
      <fieldset className="grid gap-3 md:grid-cols-2" disabled={busy}>
        <legend className="sr-only">How the paste goes on</legend>
        {ways.map(way => {
          const on = value === way.pasteInMix
          const bands = advice?.[way.key]
          return (
            <label
              key={way.key}
              className={cn(
                'flex cursor-pointer flex-col gap-3 rounded-lg bg-background p-4 transition-shadow duration-150 ease-out has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-default',
                on ? 'shadow-[0_0_0_2px_var(--foreground)]' : 'shadow-[0_0_0_1px_rgb(0_0_0/0.08)] hover:shadow-[0_0_0_1px_rgb(0_0_0/0.25)]',
              )}
            >
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name="paste-method"
                  checked={on}
                  onChange={() => onChange(way.pasteInMix)}
                  className="mt-0.5 size-4 shrink-0 accent-foreground"
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="font-medium">{way.title}</span>
                  {advice?.recommended === way.key && (
                    <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-xs font-medium text-background">Recommended</span>
                  )}
                </span>
              </span>
              <span className="text-pretty text-muted-foreground">{way.what} {way.wait}.</span>
              {bands && <ColorStrip bands={bands} />}
            </label>
          )
        })}
      </fieldset>
      {advice && <p className="text-xs text-muted-foreground">In each strip, the top is the concept's color and the bottom is the closest mix that way.</p>}
      {(applied === null || applied !== value) && (
        <Button variant={applied === null ? 'default' : 'outline'} className="self-start" disabled={busy} onClick={onApply}>
          {busy
            ? <><LoaderCircle className="animate-spin" /> Mixing…</>
            : applied === null ? 'Make the recipes this way' : 'Re-mix this way'}
        </Button>
      )}
    </section>
  )
}
