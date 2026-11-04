import { onAuthStateChanged, type User } from 'firebase/auth'
import { onValue, push, ref, remove, set, update } from 'firebase/database'
import { useEffect, useState } from 'react'
import { auth, db } from './firebase'
import type { Ingredient, Recipe, Settings, TestRun } from './types'

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
