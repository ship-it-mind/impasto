import { cn } from '@/lib/utils'

export const STEPS = ['Brief', 'Concepts', 'Recipe', 'Paint', 'Check-ins'] as const
export type Step = (typeof STEPS)[number]

type AppHeaderProps = {
  step: Step
  // The steps this piece has got to; the others aren't links yet.
  reachable: Step[]
  onStep: (step: Step) => void
  // A new piece: back to an empty brief and the list of pieces.
  onHome: () => void
}

export function AppHeader({ step, reachable, onStep, onHome }: AppHeaderProps) {
  return (
    <header className="flex h-14 items-center gap-6 px-6 lg:px-10">
      <button type="button" onClick={onHome} className="font-semibold tracking-tight">Impasto</button>
      <nav className="flex gap-4 text-muted-foreground" aria-label="Steps">
        {STEPS.map(s => {
          const current = s === step
          const open = reachable.includes(s)
          return (
            <button
              key={s}
              type="button"
              disabled={!open || current}
              aria-current={current ? 'step' : undefined}
              onClick={() => onStep(s)}
              className={cn(
                'transition-colors duration-150 ease-out disabled:cursor-default',
                current && 'text-foreground underline decoration-1 underline-offset-[6px]',
                open && !current && 'hover:text-foreground',
                !open && 'opacity-50',
              )}
            >
              {s}
            </button>
          )
        })}
      </nav>
    </header>
  )
}
