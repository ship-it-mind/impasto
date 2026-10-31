// What a painting needs against what the painter already has (GET /api/pieces/{id}/supplies).

import type { Recipe } from './recipe'

export type Tool = { id: string; name: string; why: string; need: number; sizes: number[] | null; min_size: number | null }
// A color or the paste: size is the ml owned, with qty 1. A tool: how many, and its size in cm.
export type Have = { qty: number; size: number | null }
// By item: tube:NAME, paste, or tool:ID. An item left out isn't owned.
export type HaveMap = Record<string, Have>
export type Supplies = {
  tools: Tool[]
  have: HaveMap
  density: { paint: number; paste: number }
}

export const tubeId = (name: string) => `tube:${name}`
export const toolId = (tool: Tool) => `tool:${tool.id}`
export const PASTE_ID = 'paste'

export const ml = (n: number) => `${n.toLocaleString('en-GB')} ml`

// How much of a color or the paste is needed, in whole ml, spare included.
export const needMl = (buyG: number, density: number) => Math.ceil(buyG / density)

// What's still to buy: what's needed less what's owned.
export function stillToBuyMl(need: number, have: Have | undefined): number {
  const owned = have ? have.qty * (have.size ?? 0) : 0
  return Math.ceil(Math.max(0, need - owned))
}

// What's missing of a tool: how many more, and whether the one owned is smaller than suggested.
export function toolShort(tool: Tool, have: Have | undefined): { more: number; small: boolean } {
  return {
    more: Math.max(0, tool.need - (have?.qty ?? 0)),
    small: !!have && tool.min_size !== null && (have.size ?? 0) < tool.min_size,
  }
}

export type BuyItem = { name: string; amount: string }

// The list as it now stands: only what's still short.
export function shoppingList(recipe: Recipe, supplies: Supplies): BuyItem[] {
  const { have, density } = supplies
  const items: BuyItem[] = []
  for (const tube of recipe.shopping.tubes) {
    const short = stillToBuyMl(needMl(tube.buy_g, density.paint), have[tubeId(tube.name)])
    if (short) items.push({ name: tube.name, amount: ml(short) })
  }
  const paste = stillToBuyMl(needMl(recipe.shopping.paste.buy_g, density.paste), have[PASTE_ID])
  if (paste) items.push({ name: 'Modeling paste', amount: ml(paste) })
  for (const tool of supplies.tools) {
    const { more, small } = toolShort(tool, have[toolId(tool)])
    if (more) items.push({ name: tool.name, amount: tool.min_size ? `${more} × ${tool.min_size} cm or wider` : `${more}` })
    else if (small) items.push({ name: tool.name, amount: `${tool.min_size} cm or wider` })
  }
  return items
}
