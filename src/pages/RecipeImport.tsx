import { useRef, useState } from 'react'
import { downloadCsv } from '../lib/csv'
import { fmtGrams, fmtMinutes } from '../lib/calc'
import { navigate, useAppData } from '../lib/context'
import { commitImport } from '../lib/data'
import { exportCsv, planImport, templateCsv, type ImportPlan } from '../lib/recipeImport'

export default function RecipeImport() {
  const { recipes, ingredients } = useAppData()
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-planned on every render so the preview stays right if data changes meanwhile.
  const plan: ImportPlan | null = text === null ? null : planImport(text, ingredients, recipes)

  async function onFile(file: File | undefined) {
    setError('')
    if (!file) return
    if (file.size > 2_000_000) return setError('That file is too big. Keep it under 2 MB.')
    setFileName(file.name)
    setText(await file.text())
  }

  function clear() {
    setText(null)
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function runImport() {
    if (!plan) return
    const replacing = plan.recipes.filter((r) => r.existingId).length
    if (replacing && !confirm(`${replacing} existing recipe(s) will be replaced by the file. Their saved tests are kept. Continue?`))
      return
    setBusy(true)
    setError('')
    try {
      const res = await commitImport(plan)
      alert(
        `Imported: ${res.created} new recipe(s), ${res.replaced} replaced` +
          (res.ingredients ? `, ${res.ingredients} new ingredient(s).` : '.'),
      )
      navigate('/recipes')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const hasRecipes = Object.keys(recipes).length > 0

  return (
    <>
      <div className="page-head">
        <div>
          <a className="back" href="#/recipes">
            ← Recipes
          </a>
          <h1>Import recipes from CSV</h1>
          <p className="muted">Add or update many recipes at once from a spreadsheet.</p>
        </div>
      </div>

      <section className="card">
        <h2>1. Get the template</h2>
        <p className="muted small">
          Open it in Excel or Google Sheets. Use one row per ingredient. Only fill the recipe columns (name to durations)
          on each recipe’s first row (<code>price_per_piece</code> is the default selling price), and leave <code>recipe_name</code> blank on the rows below it. Durations look like{' '}
          <code>Prep:20; Bake:35</code> (minutes). Put <code>no</code> in <code>active</code> to add an ingredient switched off.
        </p>
        <p className="muted small">
          Ingredients are matched by name to your ingredients list. The columns after <code>reason</code> are only used to
          create an ingredient that isn’t in the list yet. Existing ingredients and their prices aren’t changed. A recipe
          with the same name as an existing one replaces it, and its saved tests are kept.
        </p>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadCsv('gingered-recipes-template.csv', templateCsv())}>
            ↓ Download template
          </button>
          {hasRecipes && (
            <button
              className="btn ghost"
              onClick={() => downloadCsv('gingered-recipes.csv', exportCsv(recipes, ingredients))}
            >
              ↓ Export my recipes
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>2. Upload the filled file</h2>
        <p className="muted small">Save it as CSV first (in Excel: File → Save As → CSV UTF-8).</p>
        <div className="row wrap">
          <label className="btn primary file-btn">
            Choose CSV file
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {fileName && (
            <>
              <span className="muted">{fileName}</span>
              <button className="btn ghost small" onClick={clear}>
                Clear
              </button>
            </>
          )}
        </div>
        {error && <div className="alert error top-gap">{error}</div>}
      </section>

      {plan && (
        <section className="card">
          <h2>3. Check and import</h2>

          {plan.errors.length > 0 && (
            <div className="alert error">
              <strong>
                Fix {plan.errors.length === 1 ? 'this' : `these ${plan.errors.length}`} in the file, then upload it again:
              </strong>
              <ul className="issue-list">
                {plan.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {plan.warnings.length > 0 && (
            <div className="alert warn">
              <strong>Worth checking:</strong>
              <ul className="issue-list">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.recipes.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th>Status</th>
                    <th className="num">Ingredients</th>
                    <th className="num">Flour</th>
                    <th className="num">Base flour</th>
                    <th className="num">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.recipes.map((p) => (
                    <tr key={p.name}>
                      <td data-label="Recipe">
                        <strong>{p.name}</strong>
                        <div className="muted small">
                          Row{p.lines.length > 1 ? 's' : ''} {p.lines[0]}
                          {p.lines.length > 1 ? `–${p.lines[p.lines.length - 1]}` : ''}
                        </div>
                      </td>
                      <td data-label="Status">
                        <span className={`badge ${p.existingId ? 'warn' : 'ok'}`}>{p.existingId ? 'Replaces existing' : 'New'}</span>
                      </td>
                      <td data-label="Ingredients" className="num">
                        {p.recipe.items.length}
                      </td>
                      <td data-label="Flour" className="num">
                        {+p.flourPercent.toFixed(2)}%
                      </td>
                      <td data-label="Base flour" className="num">
                        {fmtGrams(p.recipe.baseFlour)}
                      </td>
                      <td data-label="Time" className="num">
                        {fmtMinutes(p.recipe.durations.reduce((s, d) => s + d.minutes, 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {plan.newIngredients.size > 0 && (
            <p className="top-gap">
              <strong>New ingredients to create:</strong>{' '}
              {[...plan.newIngredients.values()].map((i) => i.name).join(', ')}
            </p>
          )}

          <div className="row wrap top-gap">
            <button
              className="btn primary"
              disabled={busy || plan.errors.length > 0 || plan.recipes.length === 0}
              onClick={runImport}
            >
              {busy ? 'Importing…' : `Import ${plan.recipes.length} recipe${plan.recipes.length === 1 ? '' : 's'}`}
            </button>
            {plan.errors.length > 0 && <span className="muted small">Nothing is saved until the file has no errors.</span>}
          </div>
        </section>
      )}
    </>
  )
}
