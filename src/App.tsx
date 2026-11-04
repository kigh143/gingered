import { signOut } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { AppDataContext, type AppData } from './lib/context'
import { normalizeRecipe, useAuthUser, useDbValue } from './lib/data'
import { auth, firebaseConfigured } from './lib/firebase'
import type { Ingredient, Recipe, Settings } from './lib/types'
import IngredientsPage from './pages/Ingredients'
import Login from './pages/Login'
import RecipeEdit from './pages/RecipeEdit'
import RecipesPage from './pages/Recipes'
import RecipeView from './pages/RecipeView'
import SettingsPage from './pages/Settings'

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

export default function App() {
  if (!firebaseConfigured) return <SetupNeeded />
  return <AuthGate />
}

function AuthGate() {
  const user = useAuthUser()
  if (user === undefined) return <div className="center-screen muted">Loading…</div>
  if (user === null) return <Login />
  return <Shell email={user.email ?? ''} />
}

function Shell({ email }: { email: string }) {
  const route = useHashRoute()
  const ingredients = useDbValue<Record<string, Ingredient>>('ingredients')
  const recipes = useDbValue<Record<string, Recipe>>('recipes')
  const settings = useDbValue<Settings>('settings')

  const data = useMemo<AppData>(() => {
    const normalized: Record<string, Recipe> = {}
    for (const [id, r] of Object.entries(recipes.value ?? {})) normalized[id] = normalizeRecipe(r)
    return {
      ingredients: ingredients.value ?? {},
      recipes: normalized,
      currency: settings.value?.currency ?? '',
    }
  }, [ingredients.value, recipes.value, settings.value])

  const loading = ingredients.loading || recipes.loading || settings.loading
  const error = ingredients.error || recipes.error || settings.error

  const [section, id, action] = route
  let page
  if (section === 'ingredients') page = <IngredientsPage />
  else if (section === 'settings') page = <SettingsPage />
  else if (section === 'recipes' && id === 'new') page = <RecipeEdit id={null} />
  else if (section === 'recipes' && id && action === 'edit') page = <RecipeEdit key={id} id={id} />
  else if (section === 'recipes' && id) page = <RecipeView key={id} id={id} />
  else page = <RecipesPage />

  const tab = section === 'ingredients' || section === 'settings' ? section : 'recipes'

  return (
    <AppDataContext.Provider value={data}>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/recipes" className="brand">
            <span className="brand-mark" aria-hidden>
              ✦
            </span>
            gingered
          </a>
          <nav className="tabs">
            <a href="#/recipes" aria-current={tab === 'recipes' ? 'page' : undefined}>
              Recipes
            </a>
            <a href="#/ingredients" aria-current={tab === 'ingredients' ? 'page' : undefined}>
              Ingredients
            </a>
            <a href="#/settings" aria-current={tab === 'settings' ? 'page' : undefined}>
              Settings
            </a>
          </nav>
          <button className="btn ghost small" onClick={() => signOut(auth)} title={email}>
            Sign out
          </button>
        </div>
      </header>
      <main className="container">
        {error ? (
          <div className="alert error">
            Couldn’t read the database: {error}. Check the database rules allow your admin account
            (see README).
          </div>
        ) : loading ? (
          <p className="muted">Loading…</p>
        ) : (
          page
        )}
      </main>
    </AppDataContext.Provider>
  )
}

function SetupNeeded() {
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h1>Firebase isn’t configured yet</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Firebase web app
          settings, and restart the dev server (or rebuild before deploying). The README has the full steps.
        </p>
      </div>
    </div>
  )
}
