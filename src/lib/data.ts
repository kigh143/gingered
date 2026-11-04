import { onAuthStateChanged, type User } from 'firebase/auth'
import { increment, onValue, push, ref, remove, set, update } from 'firebase/database'
import { useEffect, useState } from 'react'
import { auth, db } from './firebase'
import type { ImportPlan } from './recipeImport'
import type { Batch, Ingredient, Recipe, Settings, TestRun } from './types'

/** Realtime Database rejects `undefined`; drop those keys (and turn them into nothing). */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Subscribe to a database path. `loading` is true until the first value for this path arrives. */
export function useDbValue<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; value: T | null; error?: string }>({
    path: null,
    value: null,
  })
  useEffect(() => {
    if (!path) return
    return onValue(
      ref(db, path),
      (snap) => setState({ path, value: snap.val() as T | null }),
      (err) => setState({ path, value: null, error: err.message }),
    )
  }, [path])
  const current = state.path === path
  return {
    value: current ? state.value : null,
    loading: Boolean(path) && !current,
    error: current ? state.error : undefined,
  }
}

/** undefined while Firebase is still restoring the session. */
export function useAuthUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return user
}

/** RTDB drops empty arrays and may return sparse ones as objects; normalise recipes on read. */
export function normalizeRecipe(r: Recipe): Recipe {
  const arr = <T,>(v: T[] | Record<string, T> | undefined): T[] =>
    !v ? [] : Array.isArray(v) ? v.filter(Boolean) : Object.values(v)
  return { ...r, items: arr(r.items), durations: arr(r.durations) }
}

// ---- Ingredients ----

export async function saveIngredient(id: string | null, data: Ingredient) {
  const value = clean({ ...data, updatedAt: Date.now() })
  if (id) await set(ref(db, `ingredients/${id}`), value)
  else await push(ref(db, 'ingredients'), value)
}

export function deleteIngredient(id: string) {
  return remove(ref(db, `ingredients/${id}`))
}

// ---- Recipes ----

/** Saves a recipe and returns its id. */
export async function saveRecipe(id: string | null, data: Recipe): Promise<string> {
  const now = Date.now()
  if (id) {
    await set(ref(db, `recipes/${id}`), clean({ ...data, updatedAt: now }))
    return id
  }
  const created = await push(ref(db, 'recipes'), clean({ ...data, createdAt: now, updatedAt: now }))
  return created.key!
}

export function updateRecipeItems(id: string, items: Recipe['items']) {
  return update(ref(db, `recipes/${id}`), clean({ items, updatedAt: Date.now() }))
}

export function deleteRecipe(id: string) {
  return update(ref(db), { [`recipes/${id}`]: null, [`tests/${id}`]: null })
}

// ---- Test runs ----

export async function saveTest(recipeId: string, test: TestRun) {
  await push(ref(db, `tests/${recipeId}`), clean(test))
}

export function deleteTest(recipeId: string, testId: string) {
  return remove(ref(db, `tests/${recipeId}/${testId}`))
}

// ---- Settings ----

export function saveSettings(settings: Settings) {
  return set(ref(db, 'settings'), clean(settings))
}

// ---- Bulk import ----

/** Writes a CSV import plan in one atomic update. Returns how many recipes were created and updated. */
export async function commitImport(plan: ImportPlan) {
  const now = Date.now()
  const updates: Record<string, unknown> = {}
  const idFor = new Map<string, string>()
  for (const [tempId, ing] of plan.newIngredients) {
    const id = push(ref(db, 'ingredients')).key!
    idFor.set(tempId, id)
    updates[`ingredients/${id}`] = clean({ ...ing, updatedAt: now })
  }
  let created = 0
  let replaced = 0
  for (const p of plan.recipes) {
    const id = p.existingId ?? push(ref(db, 'recipes')).key!
    if (p.existingId) replaced++
    else created++
    const items = p.recipe.items.map((it) => ({ ...it, ingredientId: idFor.get(it.ingredientId) ?? it.ingredientId }))
    updates[`recipes/${id}`] = clean({ ...p.recipe, items, createdAt: p.recipe.createdAt ?? now, updatedAt: now })
  }
  await update(ref(db), updates)
  return { created, replaced, ingredients: plan.newIngredients.size }
}

// ---- Stock ----

/** Records a purchase: adds to stock and optionally updates the price and shop for future costing. */
export function addStock(id: string, amount: number, price?: { packPrice: number; store: string }) {
  const updates: Record<string, unknown> = {
    [`ingredients/${id}/stock`]: increment(amount),
    [`ingredients/${id}/updatedAt`]: Date.now(),
  }
  if (price) {
    updates[`ingredients/${id}/packPrice`] = price.packPrice
    updates[`ingredients/${id}/store`] = price.store
  }
  return update(ref(db), updates)
}

function stockChanges(batch: Batch, sign: 1 | -1, ingredients: Record<string, Ingredient>) {
  const updates: Record<string, unknown> = {}
  for (const l of batch.lines) {
    // Only touch ingredients that still exist, so a deleted ingredient isn't recreated as a bare stock number.
    if (l.quantity && ingredients[l.ingredientId]) {
      updates[`ingredients/${l.ingredientId}/stock`] = increment(sign * l.quantity)
    }
  }
  return updates
}

// ---- Production ----

export async function saveBatch(
  batch: Batch,
  opts: { ingredients: Record<string, Ingredient>; setRecipePrice: boolean },
) {
  const id = push(ref(db, 'production')).key!
  const updates: Record<string, unknown> = { [`production/${id}`]: clean(batch) }
  if (batch.stockDeducted) Object.assign(updates, stockChanges(batch, -1, opts.ingredients))
  if (opts.setRecipePrice) updates[`recipes/${batch.recipeId}/pricePerPiece`] = batch.pricePerPiece
  await update(ref(db), updates)
  return id
}

export function deleteBatch(id: string, batch: Batch, restoreStock: boolean, ingredients: Record<string, Ingredient>) {
  const updates: Record<string, unknown> = { [`production/${id}`]: null }
  if (restoreStock && batch.stockDeducted) Object.assign(updates, stockChanges(batch, 1, ingredients))
  return update(ref(db), updates)
}

export function updateBatch(id: string, patch: Partial<Pick<Batch, 'pricePerPiece' | 'piecesMade' | 'notes'>>) {
  return update(ref(db, `production/${id}`), clean(patch))
}

export async function addSale(batchId: string, qty: number) {
  await push(ref(db, `production/${batchId}/sales`), { qty, at: Date.now() })
}

export function deleteSale(batchId: string, saleId: string) {
  return remove(ref(db, `production/${batchId}/sales/${saleId}`))
}
