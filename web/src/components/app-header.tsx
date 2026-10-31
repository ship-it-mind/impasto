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
  email: string
  onSignOut: () => void
}

export function AppHeader({ step, reachable, onStep, onHome, email, onSignOut }: AppHeaderProps) {
  return (
    <header className="flex h-14 items-center gap-4 px-6 md:gap-6 lg:px-10">
      <button type="button" onClick={onHome} className="font-semibold tracking-tight">Impasto</button>
      <nav className="flex min-w-0 gap-3 overflow-x-auto py-2 text-muted-foreground md:gap-4" aria-label="Steps">
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
                'whitespace-nowrap transition-colors duration-150 ease-out disabled:cursor-default',
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
      <div className="ml-auto flex shrink-0 items-center gap-3 text-muted-foreground">
        <span className="hidden max-w-56 truncate md:block" title={email}>{email}</span>
        <button type="button" onClick={onSignOut} className="whitespace-nowrap transition-colors duration-150 ease-out hover:text-foreground">Sign out</button>
      </div>
    </header>
  )
}
