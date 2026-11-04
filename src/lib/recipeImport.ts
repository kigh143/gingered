import { parseCsv, toCsv } from './csv'
import type { Duration, Ingredient, Recipe, RecipeItem, Unit } from './types'

/**
 * CSV format: one row per ingredient in a recipe.
 * Recipe columns only need filling on a recipe's first row; rows with a blank recipe_name
 * belong to the recipe above. Ingredient columns after `reason` are only used to create an
 * ingredient that isn't in the ingredients list yet; existing ingredients are left as they are.
 */
export const COLUMNS = [
  'recipe_name',
  'description',
  'base_flour_g',
  'yield_count',
  'yield_label',
  'price_per_piece',
  'durations',
  'ingredient_name',
  'percent_of_flour',
  'reason',
  'active',
  'ingredient_unit',
  'pack_size',
  'pack_price',
  'bought_at',
  'is_flour',
  'piece_weight_g',
] as const

type Column = (typeof COLUMNS)[number]
type Row = Partial<Record<Column, string>> & { _line: number }

const REQUIRED: Column[] = ['recipe_name', 'ingredient_name', 'percent_of_flour']

type Cells = Partial<Record<Column, string | number | null | undefined>>
const toRow = (c: Cells) => COLUMNS.map((col) => c[col])

export function templateCsv(): string {
  const ing = (ingredient_name: string, percent_of_flour: number, reason: string, ingredient_unit: string, pack_size: number, pack_price: number, bought_at: string, extra: Cells = {}): Cells => ({
    ingredient_name, percent_of_flour, reason, ingredient_unit, pack_size, pack_price, bought_at, ...extra,
  })
  return toCsv([
    [...COLUMNS],
    toRow({
      recipe_name: 'Ginger cookies',
      description: 'Soft spiced cookies',
      base_flour_g: 1000,
      yield_count: 40,
      yield_label: 'cookies',
      price_per_piece: 1000,
      durations: 'Prep:20; Chill:30; Bake:12',
      ...ing('Baking flour', 100, 'Gives the cookies structure', 'g', 2000, 6000, 'Main market', { is_flour: 'yes' }),
    }),
    toRow(ing('Sugar', 60, 'Sweetness and spread', 'g', 1000, 4500, 'Main market')),
    toRow(ing('Butter', 50, 'Richness and a tender bite', 'g', 500, 9000, 'Supermarket')),
    toRow(ing('Eggs', 15, 'Binds the dough and adds moisture', 'pc', 30, 15000, 'Main market', { piece_weight_g: 50 })),
    toRow(ing('Ground ginger', 3, 'The ginger flavour', 'g', 100, 3000, 'Spice shop')),
    toRow(ing('Baking soda', 1, 'Makes them rise and spread', 'g', 200, 2000, 'Supermarket')),
    toRow(ing('Raisins', 10, 'Optional extra; switched off for now', 'g', 500, 5000, 'Supermarket', { active: 'no' })),
  ])
}

export function exportCsv(recipes: Record<string, Recipe>, ingredients: Record<string, Ingredient>): string {
  const rows: (string | number | null | undefined)[][] = [[...COLUMNS]]
  const list = Object.values(recipes).sort((a, b) => a.name.localeCompare(b.name))
  for (const r of list) {
    const recipeCells: Cells = {
      recipe_name: r.name,
      description: r.description,
      base_flour_g: r.baseFlour,
      yield_count: r.yieldCount,
      yield_label: r.yieldLabel,
      price_per_piece: r.pricePerPiece,
      durations: r.durations.map((d) => `${d.label}:${d.minutes}`).join('; '),
    }
    if (!r.items.length) rows.push(toRow(recipeCells))
    r.items.forEach((item, i) => {
      const ing = ingredients[item.ingredientId]
      rows.push(
        toRow({
          ...(i === 0 ? recipeCells : {}),
          ingredient_name: ing?.name ?? 'MISSING INGREDIENT',
          percent_of_flour: item.percent,
          reason: item.reason,
          active: item.active === false ? 'no' : '',
          ingredient_unit: ing?.unit,
          pack_size: ing?.packSize,
          pack_price: ing?.packPrice,
          bought_at: ing?.store,
          is_flour: ing?.isFlour ? 'yes' : '',
          piece_weight_g: ing?.gramsPerPiece,
        }),
      )
    })
  }
  return toCsv(rows)
}

// ---------------- Parsing ----------------

export interface PlannedRecipe {
  name: string
  existingId: string | null
  /** Items reference either an existing ingredient id or `new:<name>` for one being created. */
  recipe: Recipe
  flourPercent: number
  lines: number[]
}

export interface ImportPlan {
  recipes: PlannedRecipe[]
  /** Keyed by `new:<lower-case name>`. */
  newIngredients: Map<string, Ingredient>
  errors: string[]
  warnings: string[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function parseNum(raw: string | undefined): number | null {
  if (raw === undefined) return null
  let s = raw.trim().replace(/%$/, '').trim()
  if (!s) return null
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '') // 6,000 → 6000
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.') // 2,5 → 2.5
  const n = Number(s)
  return isFinite(n) ? n : NaN
}

function parseUnit(raw: string | undefined): Unit | null {
  const s = norm(raw ?? '')
  if (['g', 'gram', 'grams', 'gm', 'gms'].includes(s)) return 'g'
  if (['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'].includes(s)) return 'ml'
  if (['pc', 'pcs', 'piece', 'pieces', 'each'].includes(s)) return 'pc'
  return null
}

const truthy = (raw: string | undefined) => ['yes', 'y', 'true', '1', 'x'].includes(norm(raw ?? ''))

function parseDurations(raw: string, line: number, errors: string[]): Duration[] {
  const out: Duration[] = []
  for (const part of raw.split(/[;|]/)) {
    if (!part.trim()) continue
    const m = part.match(/^\s*(.*?)\s*[:=]\s*([\d.,]+)\s*(min|mins|minutes)?\s*$/i)
    const minutes = m ? parseNum(m[2]) : null
    if (!m || minutes === null || isNaN(minutes)) {
      errors.push(`Row ${line}: couldn’t read the duration “${part.trim()}”. Use Stage:minutes, e.g. Bake:35.`)
      continue
    }
    out.push({ label: m[1], minutes })
  }
  return out
}

export function planImport(
  text: string,
  ingredients: Record<string, Ingredient>,
  recipes: Record<string, Recipe>,
): ImportPlan {
  const errors: string[] = []
  const warnings: string[] = []
  const newIngredients = new Map<string, Ingredient>()
  const plan: ImportPlan = { recipes: [], newIngredients, errors, warnings }

  const table = parseCsv(text)
  const headerIndex = table.findIndex((r) => r.some((c) => c.trim()))
  if (headerIndex < 0) {
    errors.push('The file is empty.')
    return plan
  }
  const header = table[headerIndex].map((h) => norm(h).replace(/[\s-]+/g, '_'))
  const missing = REQUIRED.filter((c) => !header.includes(c))
  if (missing.length) {
    errors.push(
      `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template to see the expected format.`,
    )
    return plan
  }
  const unknown = header.filter((h) => h && !(COLUMNS as readonly string[]).includes(h))
  if (unknown.length) warnings.push(`Ignored unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`)

  const rows: Row[] = []
  table.slice(headerIndex + 1).forEach((cells, i) => {
    if (!cells.some((c) => c.trim())) return
    const row: Row = { _line: headerIndex + i + 2 }
    header.forEach((h, j) => {
      if ((COLUMNS as readonly string[]).includes(h)) row[h as Column] = (cells[j] ?? '').trim()
    })
    rows.push(row)
  })
  if (!rows.length) {
    errors.push('The file has a header but no rows.')
    return plan
  }

  const existingIngredients = new Map(Object.entries(ingredients).map(([id, ing]) => [norm(ing.name), id]))
  const existingRecipes = new Map(Object.entries(recipes).map(([id, r]) => [norm(r.name), id]))

  // Group rows by recipe; a blank recipe_name continues the recipe above.
  const groups = new Map<string, { name: string; rows: Row[] }>()
  let current: string | null = null
  for (const row of rows) {
    if (row.recipe_name) {
      current = norm(row.recipe_name)
      if (!groups.has(current)) groups.set(current, { name: row.recipe_name, rows: [] })
    }
    if (!current) {
      errors.push(`Row ${row._line}: recipe_name is blank and there’s no recipe above it.`)
      continue
    }
    groups.get(current)!.rows.push(row)
  }

  for (const { name, rows: groupRows } of groups.values()) {
    const first = (col: Column) => groupRows.find((r) => r[col])?.[col] ?? ''
    const firstLine = groupRows[0]._line

    let baseFlour = parseNum(first('base_flour_g'))
    if (baseFlour === null) {
      baseFlour = 1000
      warnings.push(`“${name}”: no base_flour_g given, so it’s set to 1000 g.`)
    } else if (isNaN(baseFlour) || baseFlour <= 0) {
      errors.push(`Row ${firstLine}: base_flour_g for “${name}” must be a number above 0.`)
      baseFlour = 1000
    }
    const price = parseNum(first('price_per_piece'))
    if (price !== null && (isNaN(price) || price < 0))
      errors.push(`Row ${firstLine}: price_per_piece for “${name}” must be a number, or left blank.`)
    const yieldCount = parseNum(first('yield_count'))
    if (yieldCount !== null && (isNaN(yieldCount) || yieldCount <= 0))
      errors.push(`Row ${firstLine}: yield_count for “${name}” must be a number above 0, or left blank.`)

    const items: RecipeItem[] = []
    const seen = new Set<string>()
    let flourPercent = 0

    for (const row of groupRows) {
      const ingName = row.ingredient_name ?? ''
      if (!ingName) {
        // A recipe row with no ingredient is fine (e.g. a recipe with no ingredients yet).
        if (row.percent_of_flour || row.reason) errors.push(`Row ${row._line}: ingredient_name is blank.`)
        continue
      }
      const percent = parseNum(row.percent_of_flour)
      if (percent === null || isNaN(percent) || percent < 0) {
        errors.push(`Row ${row._line}: percent_of_flour for “${ingName}” must be a number (e.g. 65).`)
        continue
      }

      const key = norm(ingName)
      let ingredientId = existingIngredients.get(key)
      let isFlour = ingredientId ? !!ingredients[ingredientId].isFlour : false
      if (!ingredientId) {
        ingredientId = `new:${key}`
        const already = newIngredients.get(ingredientId)
        if (already) isFlour = !!already.isFlour
        else {
          const created = parseNewIngredient(ingName, row, errors)
          if (!created) continue
          newIngredients.set(ingredientId, created)
          isFlour = !!created.isFlour
        }
      }
      if (seen.has(ingredientId)) {
        errors.push(`Row ${row._line}: “${ingName}” appears more than once in “${name}”.`)
        continue
      }
      seen.add(ingredientId)
      const activeRaw = norm(row.active ?? '')
      const active = !['no', 'n', 'false', '0', 'off', 'inactive'].includes(activeRaw)
      if (activeRaw && active && !['yes', 'y', 'true', '1', 'on', 'active', 'x'].includes(activeRaw))
        warnings.push(`Row ${row._line}: didn’t understand active = “${row.active}”, so “${ingName}” is left on.`)
      if (isFlour && active) flourPercent += percent
      items.push({ ingredientId, percent, reason: row.reason ?? '', ...(active ? {} : { active: false }) })
    }

    if (items.length && Math.abs(flourPercent - 100) > 0.01)
      warnings.push(`“${name}”: flours add up to ${+flourPercent.toFixed(2)}%, not 100%.`)

    const existingId = existingRecipes.get(norm(name)) ?? null
    plan.recipes.push({
      name,
      existingId,
      flourPercent,
      lines: groupRows.map((r) => r._line),
      recipe: {
        name,
        description: first('description'),
        baseFlour,
        yieldCount: yieldCount && yieldCount > 0 ? yieldCount : null,
        yieldLabel: first('yield_label'),
        pricePerPiece: price !== null && price >= 0 ? price : null,
        durations: first('durations') ? parseDurations(first('durations'), firstLine, errors) : [],
        items,
        createdAt: existingId ? recipes[existingId].createdAt : undefined,
      },
    })
  }

  const rowOf = (msg: string) => Number(msg.match(/^Row (\d+)/)?.[1] ?? 0)
  errors.sort((a, b) => rowOf(a) - rowOf(b))
  return plan
}

function parseNewIngredient(name: string, row: Row, errors: string[]): Ingredient | null {
  const where = `Row ${row._line}: “${name}” isn’t in your ingredients list`
  const unit = parseUnit(row.ingredient_unit)
  const packSize = parseNum(row.pack_size)
  const packPrice = parseNum(row.pack_price)
  if (!row.ingredient_unit && packSize === null && packPrice === null) {
    errors.push(`${where}. Add it on the Ingredients page first, or fill ingredient_unit, pack_size and pack_price so it can be created.`)
    return null
  }
  const problems: string[] = []
  if (!unit) problems.push('ingredient_unit must be g, ml or pc')
  if (packSize === null || isNaN(packSize) || packSize <= 0) problems.push('pack_size must be a number above 0')
  if (packPrice === null || isNaN(packPrice) || packPrice < 0) problems.push('pack_price must be a number')
  const gramsPerPiece = parseNum(row.piece_weight_g)
  if (unit === 'pc' && (gramsPerPiece === null || isNaN(gramsPerPiece) || gramsPerPiece <= 0))
    problems.push('piece_weight_g is needed for pc ingredients')
  if (problems.length) {
    errors.push(`${where}, and it can’t be created: ${problems.join('; ')}.`)
    return null
  }
  return {
    name,
    unit: unit!,
    packSize: packSize!,
    packPrice: packPrice!,
    store: row.bought_at ?? '',
    gramsPerPiece: unit === 'pc' ? gramsPerPiece : null,
    isFlour: unit !== 'pc' && truthy(row.is_flour),
    notes: '',
  }
}
