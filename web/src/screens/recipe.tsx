import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, TriangleAlert } from 'lucide-react'
import { LitPainting } from '@/components/lit-painting'
import { Button } from '@/components/ui/button'
import { makeRecipe, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import type { Concept } from '@/lib/concepts'
import { cm2, grams, type MixSettings, type Recipe } from '@/lib/recipe'
import { DEFAULT_LIGHT, bandShares } from '@/lib/relief'
import { cn } from '@/lib/utils'

const RELIEF = { thin: 'Thin', medium: 'Medium', heavy: 'Heavy' }

function Steps({ items, className }: { items: string[]; className?: string }) {
  return (
    <ol className={cn('flex flex-col gap-1.5', className)}>
      {items.map((s, i) => (
        <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-1 text-pretty">
          <span className="text-muted-foreground tabular-nums">{i + 1}.</span>{s}
        </li>
      ))}
    </ol>
  )
}

// Tubes on hand and where the paste goes; changing either asks for a re-mix.
function Settings({ tubes, applied, busy, onApply }: {
  tubes: string[]; applied: MixSettings; busy: boolean; onApply: (s: MixSettings) => void
}) {
  const [draft, setDraft] = useState(applied)
  useEffect(() => setDraft(applied), [applied])
  const changed = draft.pasteInMix !== applied.pasteInMix || draft.without.join() !== applied.without.join()
  const toggle = (t: string) => {
    const without = draft.without.includes(t) ? draft.without.filter(x => x !== t) : [...draft.without, t].sort()
    if (without.length < tubes.length) setDraft({ ...draft, without })
  }
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Tubes on hand</legend>
        {tubes.map(t => {
          const on = !draft.without.includes(t)
          return (
            <label key={t} className="flex cursor-pointer items-center gap-2 py-1">
              <input type="checkbox" checked={on} onChange={() => toggle(t)} disabled={busy} className="size-4 accent-foreground" />
              <span className={cn(!on && 'text-muted-foreground line-through decoration-1')}>{t}</span>
            </label>
          )
        })}
      </fieldset>
      <fieldset className="flex flex-col">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Modeling paste</legend>
        {[{ v: false, l: 'Underneath, then paint on top' }, { v: true, l: 'Mixed into the color (tinted paste)' }].map(o => (
          <label key={String(o.v)} className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="radio"
              name="paste"
              checked={draft.pasteInMix === o.v}
              onChange={() => setDraft({ ...draft, pasteInMix: o.v })}
              disabled={busy}
              className="size-4 accent-foreground"
            />
            {o.l}
          </label>
        ))}
      </fieldset>
      {changed && (
        <Button variant="outline" className="self-start" disabled={busy} onClick={() => onApply(draft)}>
          {busy ? <><LoaderCircle className="animate-spin" /> Re-mixing…</> : 'Re-mix with these'}
        </Button>
      )}
    </div>
  )
}

type RecipeProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  seed: number
  tubes: string[]
  onBack: () => void
}

// The paint plan as a recipe book: painting, totals and shopping list on the left,
// one recipe per band on the right.
export function RecipeScreen({ brief, set, concept, seed, tubes, onBack }: RecipeProps) {
  const [W, H] = set.canvasPx
  const [settings, setSettings] = useState<MixSettings>({ without: [], pasteInMix: false })
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [phase, setPhase] = useState<string | null>('Measuring the bands…')
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (s: MixSettings) => {
    setError(null)
    setPhase('Measuring the bands…')
    try {
      const shares = await bandShares(concept, seed, W, H)
      setRecipe(await makeRecipe(brief, set, concept, shares, s, setPhase))
      setSettings(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPhase(null)
    }
  }, [brief, set, concept, seed, W, H])

  // Once per screen: StrictMode runs effects twice in development, and each run costs a model call.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    run({ without: [], pasteInMix: false })
  }, [run])

  // Paint the preview in the mixes the recipe actually gives.
  const mixed = useMemo<Concept>(() => recipe
    ? { ...concept, bands: concept.bands.map((b, i) => ({ ...b, mix: { ...b.mix, hex: recipe.bands[i]?.mix_hex ?? b.mix.hex } })) }
    : concept, [concept, recipe])

  const box = 'rounded-lg bg-background p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]'

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-16 lg:px-10">
      <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onBack}>
            <ArrowLeft /> Concepts
          </Button>
          <LitPainting
            concept={mixed}
            seed={seed}
            width={W}
            height={H}
            light={DEFAULT_LIGHT}
            className="rounded-sm shadow-[0_2px_3px_rgb(0_0_0/0.15),0_10px_24px_-10px_rgb(0_0_0/0.3)]"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{concept.title}</h1>
            <p className="text-muted-foreground tabular-nums">{set.piece.widthCm} × {set.piece.heightCm} cm · {concept.bands.length} bands</p>
          </div>
        </div>

        {recipe && (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <div className={box}>
                <dt className="text-xs text-muted-foreground">Paint to mix</dt>
                <dd className="text-xl font-semibold tabular-nums">{grams(recipe.totals.paint_g)}</dd>
              </div>
              <div className={box}>
                <dt className="text-xs text-muted-foreground">Modeling paste</dt>
                <dd className="text-xl font-semibold tabular-nums">{grams(recipe.totals.paste_g)}</dd>
              </div>
            </dl>

            <section className="flex flex-col gap-2" aria-labelledby="buy">
              <h2 id="buy" className="text-xs font-medium text-muted-foreground">What to buy, with {recipe.materials.buffer_pct}% spare</h2>
              <ul>
                {recipe.shopping.tubes.map(t => (
                  <li key={t.name} className="flex items-baseline justify-between gap-3 border-b py-1.5">
                    <span>{t.name}</span>
                    <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {grams(t.buy_g)} · <span className="text-foreground">{t.tubes} × {recipe.materials.tube_ml} ml</span>
                    </span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 py-1.5">
                  <span>Modeling paste</span>
                  <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {grams(recipe.shopping.paste.buy_g)} · <span className="text-foreground">{recipe.shopping.paste.tubs} × {recipe.materials.tub_ml} ml</span>
                  </span>
                </li>
              </ul>
            </section>
          </>
        )}

        <details>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Tubes on hand and paste</summary>
          <div className="mt-3">
            <Settings tubes={tubes} applied={settings} busy={!!phase} onApply={run} />
          </div>
        </details>
      </aside>

      <div className="flex flex-col" aria-live="polite">
        <header className="flex flex-col gap-2 pt-11 pb-6">
          <h2 className="text-3xl font-semibold tracking-tight">Mixing recipes</h2>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            By weight, on a kitchen scale. The rough parts are for a small test batch only.
            {recipe && ` Grams use typical layer depths for thin, medium and heavy paste, plus ${recipe.materials.waste_pct}% for what stays on the palette and knife.`}
          </p>
        </header>

        {error && <p role="alert" className="border-t py-6 text-destructive">{error}</p>}
        {phase && (
          <div className="flex flex-col gap-4 border-t py-8">
            <p className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{phase}</p>
            {!recipe && <><div className="h-6 w-2/5 rounded bg-muted" /><div className="h-4 w-4/5 rounded bg-muted" /><div className="h-4 w-3/5 rounded bg-muted" /></>}
          </div>
        )}

        {recipe?.bands.map((b, i) => (
          <article key={b.name} className={cn('grid gap-4 border-t py-8 md:grid-cols-[3rem_1fr]', phase && 'opacity-60')}>
            <span className="text-4xl font-light text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span aria-hidden className="size-10 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" style={{ background: b.mix_hex }} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-medium">{b.name}</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {cm2(b.area_cm2)} · {RELIEF[b.level]} paste · ΔE {b.delta_e.toFixed(1)} from the concept
                  </p>
                </div>
                <p className="text-right tabular-nums">
                  <span className="block text-lg font-semibold">{grams(b.paint_g)}</span>
                  <span className="text-xs text-muted-foreground">+ {grams(b.paste_g)} paste</span>
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {b.tubes.map(t => (
                  <li key={t.name} className="rounded-md bg-background px-2.5 py-1.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] tabular-nums">
                    <span className="font-medium">{t.grams} g</span> {t.name} <span className="text-muted-foreground">· {Math.round(t.share * 100)}%</span>
                  </li>
                ))}
              </ul>
              <Steps items={b.card.steps} />
              {b.card.warnings.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {b.card.warnings.map(w => (
                    <li key={w} className="flex gap-2 text-xs text-amber-800">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /><span className="text-pretty">{w}</span>
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  If you run out mid-band · test batch {b.tubes.map(t => t.parts).join(':')}
                </summary>
                <Steps items={b.card.rematch} className="mt-2 text-muted-foreground" />
              </details>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}
