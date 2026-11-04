/** Unit an ingredient is bought and measured in. 1 ml is treated as 1 g. */
export type Unit = 'g' | 'ml' | 'pc'

export interface Ingredient {
  name: string
  unit: Unit
  /** How much comes in one pack, in `unit` (e.g. 2000 g, 1000 ml, 30 pc). */
  packSize: number
  /** What was paid for one pack. */
  packPrice: number
  /** Where it was bought. */
  store: string
  /** Weight of one piece, only for `pc` ingredients (e.g. an egg ≈ 50 g). */
  gramsPerPiece?: number | null
  /** Counts toward the recipe's flour total (the 100% basis). */
  isFlour?: boolean
  notes?: string
  /** Amount on hand, in `unit`. Goes up with purchases, down when a batch is manufactured. */
  stock?: number | null
  updatedAt?: number
}

/** One ingredient in a recipe, expressed as a baker's percentage of total flour weight. */
export interface RecipeItem {
  ingredientId: string
  percent: number
  /** Why this ingredient is needed in the recipe. */
  reason: string
  /** Inactive ingredients stay on the recipe but are left out of quantities and cost. Missing = active. */
  active?: boolean
}

export interface Duration {
  label: string
  minutes: number
}

export interface Recipe {
  name: string
  description: string
  durations: Duration[]
  items: RecipeItem[]
  /** Default total flour weight in grams the recipe is shown at. */
  baseFlour: number
  /** How many pieces the recipe makes at `baseFlour`. */
  yieldCount?: number | null
  yieldLabel?: string
  /** Default selling price for one piece. */
  pricePerPiece?: number | null
  createdAt?: number
  updatedAt?: number
}

/** A snapshot of one line of a test run, frozen with the prices at the time. */
export interface TestLine {
  ingredientId: string
  name: string
  unit: Unit
  percent: number
  grams: number
  quantity: number | null
  cost: number | null
}

export interface TestRun {
  flourWeight: number
  lines: TestLine[]
  totalWeight: number
  totalCost: number
  piecesMade?: number | null
  notes: string
  createdAt: number
}

export interface Sale {
  qty: number
  at: number
}

/** A manufactured batch, frozen with the quantities and prices used. */
export interface Batch {
  recipeId: string
  recipeName: string
  yieldLabel: string
  flourWeight: number
  expectedPieces: number | null
  piecesMade: number
  pricePerPiece: number
  lines: TestLine[]
  totalCost: number
  notes: string
  /** Whether ingredient stock was reduced when this batch was saved. */
  stockDeducted: boolean
  sales?: Record<string, Sale>
  createdAt: number
}

export interface Settings {
  currency: string
}
