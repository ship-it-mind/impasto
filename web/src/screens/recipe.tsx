import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import { ConceptPainting } from '@/components/lit-painting'
import { PasteMethod } from '@/components/paste-method'
import { SupplyList } from '@/components/supply-list'
import { Button } from '@/components/ui/button'
import { chooseRecipe, getPasteAdvice, getSupplies, makeRecipe, saveSupplies, type ConceptSet } from '@/lib/api'
import type { BriefResult } from '@/lib/brief'
import type { Concept } from '@/lib/concepts'
import { cm2, grams, parts, type MixSettings, type PasteAdvice, type Recipe } from '@/lib/recipe'
import { DEFAULT_LIGHT, bandShares } from '@/lib/relief'
import { shoppingList, type Have, type Supplies } from '@/lib/supplies'
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

type RecipeProps = {
  brief: BriefResult
  set: ConceptSet
  concept: Concept
  seed: number
  tubes: string[]
  // The recipe already made for this concept, when coming back from the check-ins.
  initialRecipe?: Recipe
  // Each recipe made here, so the check-ins and a return visit use the latest one.
  onRecipe: (recipe: Recipe) => void
  onBack: () => void
  onPaint: () => void
}

const SAVE_DELAY_MS = 400

// The paint plan: how the paste goes on, what's needed against what's already there,
// and one recipe per band, with the painting, totals and what's left to buy alongside.
export function RecipeScreen({ brief, set, concept, seed, tubes, initialRecipe, onRecipe, onBack, onPaint }: RecipeProps) {
  const [W, H] = set.canvasPx
  const [recipe, setRecipe] = useState<Recipe | null>(initialRecipe ?? null)
  // What the recipes on show were made with, and what's picked for the next ones.
  const applied = useMemo<MixSettings | null>(
    () => recipe && { without: recipe.mixing.without, pasteInMix: recipe.mixing.paste_in_mix }, [recipe],
  )
  const [without, setWithout] = useState<string[]>(applied?.without ?? [])
  const [picked, setPicked] = useState<boolean | null>(applied?.pasteInMix ?? null)
  const [advice, setAdvice] = useState<PasteAdvice | null>(null)
  const [supplies, setSupplies] = useState<Supplies | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(0)

  // The way the painter picked, or until they pick one, the recommended way.
  const pasteInMix = picked ?? advice?.recommended === 'tinted'

  // A recipe made before, for this concept and these settings, comes back as it was. Only a new one costs a model call.
  const run = useCallback(async (s: MixSettings) => {
    setError(null)
    setPhase('Mixing…')
    try {
      let made = await chooseRecipe(brief, set, concept, s)
      if (!made) {
        setPhase('Measuring the bands…')
        const shares = concept.layout?.shares ?? await bandShares(concept, seed, W, H)
        made = await makeRecipe(brief, set, concept, shares, s, setPhase)
      }
      setRecipe(made)
      onRecipe(made)
      setWithout(made.mixing.without)
      setPicked(made.mixing.paste_in_mix)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setPhase(null)
    }
  }, [brief, set, concept, seed, W, H, onRecipe])

  // Once per screen: the recipes this concept last used, if it has any. New ones wait until the paste is decided.
  const started = useRef(!!initialRecipe)
  useEffect(() => {
    if (started.current) return
    started.current = true
    setPhase('Looking for recipes already made…')
    chooseRecipe(brief, set, concept)
      .then(made => {
        if (!made) return
        setRecipe(made)
        onRecipe(made)
        setWithout(made.mixing.without)
        setPicked(made.mixing.paste_in_mix)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'))
      .finally(() => setPhase(null))
  }, [brief, set, concept, onRecipe])

  // Measured from the tubes the recipes use, so leaving one out can change the advice.
  const appliedWithout = applied?.without.join() ?? ''
  useEffect(() => {
    let alive = true
    getPasteAdvice(brief, set, concept, appliedWithout ? appliedWithout.split(',') : [])
      .then(a => { if (alive) setAdvice(a) })
      .catch(() => { if (alive) setAdvice(null) })
    return () => { alive = false }
  }, [brief, set, concept, appliedWithout])

  // The tools depend on the paste method. What's owned stays as the painter left it.
  const appliedPaste = applied?.pasteInMix
  useEffect(() => {
    if (appliedPaste === undefined) return
    let alive = true
    getSupplies(brief, set, concept, appliedPaste)
      .then(s => { if (alive) setSupplies(old => ({ ...s, have: old?.have ?? s.have })) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Couldn't load the list of what you need.") })
    return () => { alive = false }
  }, [brief, set, concept, appliedPaste])

  const changeHave = (id: string, item: Have | null) => {
    if (!supplies) return
    const have = { ...supplies.have }
    if (item) have[id] = item
    else delete have[id]
    setSupplies({ ...supplies, have })
    window.clearTimeout(saving.current)
    saving.current = window.setTimeout(() => {
      saveSupplies(brief.id, have).catch(() => setError("Couldn't save what you have. Try changing it again."))
    }, SAVE_DELAY_MS)
  }
  const toBuy = useMemo(() => (recipe && supplies ? shoppingList(recipe, supplies) : null), [recipe, supplies])

  // A relief preview, when there is no Muse painting, shows the mixes the recipe actually gives.
  const mixed = useMemo<Concept>(() => recipe
    ? { ...concept, bands: concept.bands.map((b, i) => ({ ...b, mix: { ...b.mix, hex: recipe.bands[i]?.mix_hex ?? b.mix.hex } })) }
    : concept, [concept, recipe])

  const box = 'rounded-lg bg-background p-3 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]'

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-16 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-16 lg:px-10">
      <aside className="flex flex-col gap-8 lg:sticky lg:top-0 lg:-mx-3 lg:max-h-dvh lg:self-start lg:overflow-y-auto lg:px-3 lg:pt-6 lg:pb-6">
        <div className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onBack}>
            <ArrowLeft /> Concepts
          </Button>
          <ConceptPainting
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

            {toBuy && (
              <section className="flex flex-col gap-2" aria-labelledby="buy">
                <h2 id="buy" className="text-xs font-medium text-muted-foreground">What to buy, with {recipe.materials.buffer_pct}% spare</h2>
                {toBuy.length === 0
                  ? <p className="flex items-center gap-2"><Check className="size-4 shrink-0" aria-hidden /> You have everything on the list.</p>
                  : (
                    <ul>
                      {toBuy.map(item => (
                        <li key={item.name} className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
                          <span className="min-w-0">{item.name}</span>
                          <span className="text-right whitespace-nowrap tabular-nums">{item.amount}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </section>
            )}
          </>
        )}
      </aside>

      <div className="flex flex-col" aria-live="polite">
        <header className="flex flex-col gap-2 pt-11 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold tracking-tight">Mixing recipes</h2>
            {recipe && (
              <Button variant="outline" disabled={!!phase} onClick={onPaint}>
                How to paint it <ArrowRight />
              </Button>
            )}
          </div>
        </header>

        {error && <p role="alert" className="border-t py-6 text-destructive">{error}</p>}
        <PasteMethod
          advice={advice}
          value={pasteInMix}
          onChange={setPicked}
          applied={applied?.pasteInMix ?? null}
          busy={!!phase}
          onApply={() => run({ without, pasteInMix })}
        />

        {recipe && applied && supplies && (
          <SupplyList
            recipe={recipe}
            supplies={supplies}
            allTubes={tubes}
            onHave={changeHave}
            applied={applied}
            draftWithout={without}
            onDraftWithout={setWithout}
            busy={!!phase}
            onRemix={() => run({ without, pasteInMix })}
          />
        )}

        {phase && (
          <div className="flex flex-col gap-4 border-t py-8">
            <p className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden />{phase}</p>
            {!recipe && <><div className="h-6 w-2/5 rounded bg-muted" /><div className="h-4 w-4/5 rounded bg-muted" /><div className="h-4 w-3/5 rounded bg-muted" /></>}
          </div>
        )}

        {recipe && (
          <section className="flex flex-col gap-1 border-t pt-8 pb-6" aria-labelledby="bands">
            <h3 id="bands" className="text-lg font-medium">Mix each band</h3>
            <p className="max-w-[60ch] text-pretty text-muted-foreground">
              Mix by parts, lightest color first, and add the darker ones a little at a time.
              {` Grams are how much each band needs in all, from typical layer depths for thin, medium and heavy paste, plus ${recipe.materials.waste_pct}% for what stays on the palette and knife.`}
            </p>
          </section>
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
                    <span className="font-medium">{parts(t.parts)}</span> {t.name} <span className="text-muted-foreground">· {t.grams} g</span>
                  </li>
                ))}
                {b.paste_parts !== null && (
                  <li className="rounded-md bg-background px-2.5 py-1.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] tabular-nums">
                    <span className="font-medium">{parts(b.paste_parts)}</span> paste
                  </li>
                )}
              </ul>
              <Steps items={b.card.steps} />
              {(b.card.too_dark || b.card.too_light) && (
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {[b.card.too_dark, b.card.too_light].filter(Boolean).map(tip => <li key={tip} className="text-pretty">{tip}</li>)}
                </ul>
              )}
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
                  If you run out mid-band
                </summary>
                <Steps items={b.card.rematch} className="mt-2 text-muted-foreground" />
              </details>
            </div>
          </article>
        ))}

        {recipe && (
          <div className="flex flex-col items-start gap-3 border-t pt-8">
            <p className="max-w-[60ch] text-pretty text-muted-foreground">Got everything? Next is how to paint it, step by step, with what the canvas should look like after each one.</p>
            <Button disabled={!!phase} onClick={onPaint}>How to paint it <ArrowRight /></Button>
          </div>
        )}
      </div>
    </main>
  )
}
