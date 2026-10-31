import { useState, type ReactNode } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MixSettings, Recipe } from '@/lib/recipe'
import { PASTE_ID, ml, needMl, stillToBuyMl, toolId, toolShort, tubeId, type Have, type Supplies, type Tool } from '@/lib/supplies'
import { cn } from '@/lib/utils'

const QUANTITIES = Array.from({ length: 12 }, (_, i) => i + 1)

function Picker({ label, value, options, unit, disabled, onChange }: {
  label: string; value: number; options: number[]; unit?: string; disabled?: boolean; onChange: (value: number) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      className="h-8 rounded-lg border border-input bg-background px-1.5 text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
    >
      {options.map(o => <option key={o} value={o}>{o}{unit ? ` ${unit}` : ''}</option>)}
    </select>
  )
}

// How many ml the painter has. Clearing it to type a new number counts as none until they do.
function MlInput({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value))
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        aria-label={label}
        value={Number(text) === value ? text : value}
        disabled={disabled}
        onFocus={e => e.target.select()}
        onChange={e => {
          setText(e.target.value)
          onChange(Math.max(0, Number(e.target.value) || 0))
        }}
        className="h-8 w-24 [appearance:textfield] rounded-lg border border-input bg-background pr-8 pl-2 text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">ml</span>
    </div>
  )
}

// One thing on the list: tick it if you have it, say how much, and see what's still short.
function Row({ name, need, have, enough, status, disabled, onHave, controls, action, struck }: {
  name: string; need: ReactNode; have: boolean; enough: boolean; status: ReactNode; disabled?: boolean
  onHave: (on: boolean) => void; controls?: ReactNode; action?: ReactNode; struck?: boolean
}) {
  return (
    <li className="grid items-center gap-x-4 gap-y-2 border-b py-2.5 md:grid-cols-[minmax(0,1fr)_auto_11rem]">
      <div className="flex items-start gap-2.5">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={have}
            disabled={disabled}
            onChange={e => onHave(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-foreground"
          />
          <span className="min-w-0">
            <span className={cn('block', struck && 'text-muted-foreground line-through decoration-1')}>{name}</span>
            <span className="block text-xs text-pretty text-muted-foreground tabular-nums">{need}</span>
          </span>
        </label>
      </div>
      <div className={cn('items-center gap-1.5 pl-6.5 tabular-nums md:flex md:min-h-8 md:pl-0', have ? 'flex' : 'hidden')}>{have && controls}</div>
      <div className={cn('flex items-center gap-1.5 pl-6.5 text-pretty tabular-nums md:justify-end md:pl-0 md:text-right', enough && 'text-muted-foreground')}>
        {enough && <Check className="size-3.5 shrink-0" aria-hidden />}
        <span>{status}</span>
        {action}
      </div>
    </li>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <h4 className="border-b pb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      <ul>{children}</ul>
    </div>
  )
}

function ToolRow({ tool, have, onHave }: { tool: Tool; have: Have | undefined; onHave: (item: Have | null) => void }) {
  const { more, small } = toolShort(tool, have)
  const enough = !more && !small
  const wanted = tool.min_size ? ` ${tool.min_size} cm or wider` : ''
  return (
    <Row
      name={tool.name}
      need={`${tool.need > 1 ? `${tool.need} needed. ` : ''}${tool.why}${wanted ? `. Suggested:${wanted}` : ''}`}
      have={!!have}
      enough={enough}
      status={enough ? 'You have it' : small && !more ? `Narrower than suggested` : have ? `${more} more` : `Get ${tool.need}`}
      onHave={on => onHave(on ? { qty: tool.need, size: tool.min_size } : null)}
      controls={have && (
        <>
          {tool.need > 1 && <Picker label={`How many ${tool.name}`} value={have.qty} options={QUANTITIES} onChange={qty => onHave({ ...have, qty })} />}
          {tool.sizes && <Picker label={`${tool.name} size`} value={have.size ?? tool.min_size ?? tool.sizes[0]} options={tool.sizes} unit="cm" onChange={size => onHave({ ...have, size })} />}
        </>
      )}
    />
  )
}

type SupplyListProps = {
  recipe: Recipe
  supplies: Supplies
  allTubes: string[]
  onHave: (id: string, item: Have | null) => void
  // The tubes left out: the recipes' now, and any more marked for the next re-mix.
  applied: MixSettings
  draftWithout: string[]
  onDraftWithout: (without: string[]) => void
  busy: boolean
  onRemix: () => void
}

export function SupplyList({ recipe, supplies, allTubes, onHave, applied, draftWithout, onDraftWithout, busy, onRemix }: SupplyListProps) {
  const { have, density } = supplies
  const pasteHave = have[PASTE_ID]
  const pasteNeed = needMl(recipe.shopping.paste.buy_g, density.paste)
  const pasteShort = stillToBuyMl(pasteNeed, pasteHave)
  const changed = draftWithout.join() !== applied.without.join()
  const toggleOut = (tube: string) => {
    const without = draftWithout.includes(tube) ? draftWithout.filter(t => t !== tube) : [...draftWithout, tube].sort()
    if (without.length < allTubes.length) onDraftWithout(without)
  }

  return (
    <section className="flex flex-col gap-6 border-t py-8" aria-labelledby="supplies">
      <div className="flex flex-col gap-1">
        <h3 id="supplies" className="text-lg font-medium">What you'll need</h3>
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          Tick what you already have and say how much. The list of what to buy updates as you go, with {recipe.materials.buffer_pct}% spare so you don't run dry mid-band.
        </p>
      </div>

      <Group title="Colors">
        {recipe.shopping.tubes.map(tube => {
          const id = tubeId(tube.name)
          const item = have[id]
          const need = needMl(tube.buy_g, density.paint)
          const short = stillToBuyMl(need, item)
          const out = draftWithout.includes(tube.name)
          return (
            <Row
              key={tube.name}
              name={tube.name}
              struck={out}
              need={`Needs ${ml(need)}`}
              have={!!item}
              enough={!short && !out}
              disabled={out}
              status={out ? 'Mixing without it' : short ? `Buy ${ml(short)}` : 'Enough'}
              onHave={on => onHave(id, on ? { qty: 1, size: need } : null)}
              controls={item && !out && (
                <MlInput label={`How many ml of ${tube.name} you have`} value={item.qty * (item.size ?? 0)} onChange={size => onHave(id, { qty: 1, size })} />
              )}
              action={!item && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleOut(tube.name)}
                  className="ml-1 text-xs whitespace-nowrap text-muted-foreground underline decoration-1 underline-offset-2 hover:text-foreground"
                >
                  {out ? 'Undo' : "Can't get it"}
                </button>
              )}
            />
          )
        })}
        {applied.without.map(tube => {
          const out = draftWithout.includes(tube)
          return (
            <li key={tube} className="flex items-baseline justify-between gap-3 border-b py-2.5 text-muted-foreground">
              <span>{tube} <span className="text-xs">· {out ? 'left out of these recipes' : 'back in at the next re-mix'}</span></span>
              <button type="button" disabled={busy} onClick={() => toggleOut(tube)} className="text-xs underline decoration-1 underline-offset-2 hover:text-foreground">
                {out ? 'Put back' : 'Undo'}
              </button>
            </li>
          )
        })}
      </Group>
      {changed && (
        <Button variant="outline" className="-mt-2 self-start" disabled={busy} onClick={onRemix}>
          {busy ? <><LoaderCircle className="animate-spin" /> Re-mixing…</> : 'Re-mix with these colors'}
        </Button>
      )}

      <Group title="Paste">
        <Row
          name="Modeling paste"
          need={`Needs ${ml(pasteNeed)}`}
          have={!!pasteHave}
          enough={!pasteShort}
          status={pasteShort ? `Buy ${ml(pasteShort)}` : 'Enough'}
          onHave={on => onHave(PASTE_ID, on ? { qty: 1, size: pasteNeed } : null)}
          controls={pasteHave && (
            <MlInput label="How many ml of modeling paste you have" value={pasteHave.qty * (pasteHave.size ?? 0)} onChange={size => onHave(PASTE_ID, { qty: 1, size })} />
          )}
        />
      </Group>

      <Group title="Tools">
        {supplies.tools.map(tool => (
          <ToolRow key={tool.id} tool={tool} have={have[toolId(tool)]} onHave={item => onHave(toolId(tool), item)} />
        ))}
      </Group>
    </section>
  )
}
