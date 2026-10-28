import { cn } from '@/lib/utils'

export const STEPS = ['Brief', 'Concepts', 'Recipe', 'Check-ins'] as const
export type Step = (typeof STEPS)[number]

export function AppHeader({ step }: { step: Step }) {
  return (
    <header className="flex h-14 items-center gap-6 px-6 lg:px-10">
      <span className="font-semibold tracking-tight">Impasto</span>
      <nav className="flex gap-4 text-muted-foreground" aria-label="Steps">
        {STEPS.map(s => (
          <span
            key={s}
            aria-current={s === step ? 'step' : undefined}
            className={cn(s === step && 'text-foreground underline decoration-1 underline-offset-[6px]')}
          >
            {s}
          </span>
        ))}
      </nav>
    </header>
  )
}
