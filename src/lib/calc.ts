import type { Ingredient, RecipeItem, Unit } from './types'

/** Price of one unit (1 g, 1 ml or 1 piece) of an ingredient. */
export function costPerUnit(ing: Ingredient): number | null {
  return ing.packSize > 0 ? ing.packPrice / ing.packSize : null
}

/** Price of one gram of an ingredient (pieces are converted with gramsPerPiece). */
export function costPerGram(ing: Ingredient): number | null {
  const perUnit = costPerUnit(ing)
  if (perUnit === null) return null
  if (ing.unit === 'pc') {
    return ing.gramsPerPiece && ing.gramsPerPiece > 0 ? perUnit / ing.gramsPerPiece : null
  }
  return perUnit
}

export interface Line {
  ingredientId: string
  ingredient: Ingredient | undefined
  percent: number
  reason: string
  /** Weight needed, in grams. */
  grams: number
  /** Amount in the ingredient's own unit (pieces for `pc`), or null if it can't be worked out. */
  quantity: number | null
  cost: number | null
}

export function computeLines(
  items: RecipeItem[],
  ingredients: Record<string, Ingredient> | null,
  flourWeight: number,
): Line[] {
  return items.map((item) => {
    const ingredient = ingredients?.[item.ingredientId]
    const grams = (flourWeight * (item.percent || 0)) / 100
    let quantity: number | null = null
    let cost: number | null = null
    if (ingredient) {
      if (ingredient.unit === 'pc') {
        quantity = ingredient.gramsPerPiece ? grams / ingredient.gramsPerPiece : null
      } else {
        quantity = grams
      }
      const perGram = costPerGram(ingredient)
      cost = perGram === null ? null : grams * perGram
    }
    return { ...item, ingredient, grams, quantity, cost }
  })
}

export interface Summary {
  totalGrams: number
  totalCost: number
  /** True when one or more lines had no cost, so the total is incomplete. */
  costIncomplete: boolean
  /** Sum of the flour ingredients' percentages; should be 100. */
  flourPercent: number
}

export function summarize(lines: Line[]): Summary {
  let totalGrams = 0
  let totalCost = 0
  let costIncomplete = false
  let flourPercent = 0
  for (const l of lines) {
    totalGrams += l.grams
    if (l.cost === null) costIncomplete = true
    else totalCost += l.cost
    if (l.ingredient?.isFlour) flourPercent += l.percent || 0
  }
  return { totalGrams, totalCost, costIncomplete, flourPercent }
}

/** Expected number of pieces at a given flour weight, scaled from the recipe's yield. */
export function scaledYield(yieldCount: number | null | undefined, baseFlour: number, flour: number) {
  if (!yieldCount || !baseFlour) return null
  return (yieldCount * flour) / baseFlour
}

const num = (n: number, digits: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits })

export function fmtQty(quantity: number | null, unit: Unit | undefined): string {
  if (quantity === null || unit === undefined) return '—'
  if (unit === 'pc') return `${num(quantity, 1)} pc`
  if (quantity >= 1000) return `${num(quantity / 1000, 2)} ${unit === 'g' ? 'kg' : 'L'}`
  return `${num(quantity, quantity < 10 ? 1 : 0)} ${unit}`
}

export function fmtGrams(grams: number) {
  return fmtQty(grams, 'g')
}

export function fmtMoney(amount: number | null, currency: string, digits = 0): string {
  if (amount === null || !isFinite(amount)) return '—'
  const fixed = Math.abs(amount) < 10 && amount !== 0 ? Math.max(digits, 2) : digits
  const s = amount.toLocaleString(undefined, {
    minimumFractionDigits: fixed,
    maximumFractionDigits: fixed,
  })
  return currency ? `${currency} ${s}` : s
}

export function fmtMinutes(total: number) {
  if (!total) return '0 min'
  const h = Math.floor(total / 60)
  const m = Math.round(total % 60)
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

export const unitLabel: Record<Unit, string> = { g: 'grams', ml: 'millilitres', pc: 'pieces' }
