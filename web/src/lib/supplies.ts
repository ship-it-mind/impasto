// What a painting needs against what the painter already has (GET /api/pieces/{id}/supplies).

import type { Recipe } from './recipe'

export type Tool = { id: string; name: string; why: string; need: number; sizes: number[] | null; min_size: number | null }
export type Have = { qty: number; size: number | null }
// By item: tube:NAME, paste, or tool:ID. An item left out isn't owned.
export type HaveMap = Record<string, Have>
export type Supplies = {
  tools: Tool[]
  have: HaveMap
  sizes: { tube: number[]; tub: number[] }
  density: { paint: number; paste: number }
}

export const tubeId = (name: string) => `tube:${name}`
export const toolId = (tool: Tool) => `tool:${tool.id}`
export const PASTE_ID = 'paste'

// Containers still to buy, in the usual container size, once what's owned is taken off.
export function stillToBuy(buyG: number, have: Have | undefined, density: number, containerMl: number): number {
  const owned = have ? have.qty * (have.size ?? containerMl) * density : 0
  return Math.ceil(Math.max(0, buyG - owned) / (containerMl * density))
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
  const { tube_ml, tub_ml } = recipe.materials
  const items: BuyItem[] = []
  for (const tube of recipe.shopping.tubes) {
    const count = stillToBuy(tube.buy_g, have[tubeId(tube.name)], density.paint, tube_ml)
    if (count) items.push({ name: tube.name, amount: `${count} × ${tube_ml} ml` })
  }
  const tubs = stillToBuy(recipe.shopping.paste.buy_g, have[PASTE_ID], density.paste, tub_ml)
  if (tubs) items.push({ name: 'Modeling paste', amount: `${tubs} × ${tub_ml} ml` })
  for (const tool of supplies.tools) {
    const { more, small } = toolShort(tool, have[toolId(tool)])
    if (more) items.push({ name: tool.name, amount: tool.min_size ? `${more} × ${tool.min_size} cm or wider` : `${more}` })
    else if (small) items.push({ name: tool.name, amount: `${tool.min_size} cm or wider` })
  }
  return items
}
