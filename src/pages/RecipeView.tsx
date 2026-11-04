import { useState } from 'react'
import LinesTable from '../components/LinesTable'
import { computeLines, fmtGrams, fmtMinutes, fmtMoney, scaledYield, summarize } from '../lib/calc'
import { useAppData } from '../lib/context'
import { deleteTest, saveTest, updateRecipeItems, useDbValue } from '../lib/data'
import type { Recipe, TestRun } from '../lib/types'
import FlourBadge from '../components/FlourBadge'

export default function RecipeView({ id }: { id: string }) {
  const { recipes, ingredients, currency } = useAppData()
  const recipe = recipes[id]
  const [flourInput, setFlourInput] = useState(() => String(recipe?.baseFlour ?? 1000))

  if (!recipe) {
    return (
      <div className="empty card">
        <p>This recipe doesn’t exist any more.</p>
        <a className="btn" href="#/recipes">
          Back to recipes
        </a>
      </div>
    )
  }

  const flour = parseFloat(flourInput) || 0
  const lines = computeLines(recipe.items, ingredients, flour)
  const summary = summarize(lines)
  const pieces = scaledYield(recipe.yieldCount, recipe.baseFlour, flour)
  const totalMinutes = recipe.durations.reduce((s, d) => s + (d.minutes || 0), 0)
  const yieldLabel = recipe.yieldLabel || 'pieces'

  return (
    <>
      <div className="page-head">
        <div>
          <a className="back" href="#/recipes">
            ← Recipes
          </a>
          <h1>{recipe.name}</h1>
          {recipe.description && <p className="lede">{recipe.description}</p>}
        </div>
        <a className="btn" href={`#/recipes/${id}/edit`}>
          Edit recipe
        </a>
      </div>

      {recipe.durations.length > 0 && (
        <div className="chips">
          {recipe.durations.map((d, i) => (
            <span key={i} className="chip">
              {d.label || 'Stage'} <strong>{fmtMinutes(d.minutes)}</strong>
            </span>
          ))}
          {recipe.durations.length > 1 && (
            <span className="chip total">
              Total <strong>{fmtMinutes(totalMinutes)}</strong>
            </span>
          )}
        </div>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Scale the recipe</h2>
          <FlourBadge percent={summary.flourPercent} hasItems={recipe.items.length > 0} />
        </div>
        <div className="scaler">
          <label className="field">
            <span>Total flour</span>
            <div className="suffix-input">
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={flourInput}
                onChange={(e) => setFlourInput(e.target.value)}
              />
              <span>g</span>
            </div>
          </label>
          {recipe.yieldCount ? (
            <label className="field">
              <span>or {yieldLabel} wanted</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={pieces ? +pieces.toFixed(2) : ''}
                onChange={(e) => {
                  const want = parseFloat(e.target.value) || 0
                  setFlourInput(String(+((want / recipe.yieldCount!) * recipe.baseFlour).toFixed(1)))
                }}
              />
            </label>
          ) : null}
          {flour !== recipe.baseFlour && (
            <button className="btn ghost small" onClick={() => setFlourInput(String(recipe.baseFlour))}>
              Reset to {fmtGrams(recipe.baseFlour)}
            </button>
          )}
        </div>

        {recipe.items.length === 0 ? (
          <p className="muted">
            No ingredients yet. <a href={`#/recipes/${id}/edit`}>Add some</a>.
          </p>
        ) : (
          <>
            <LinesTable lines={lines} currency={currency} showReason />
            <Totals summary={summary} pieces={pieces} yieldLabel={yieldLabel} currency={currency} />
          </>
        )}
      </section>

      {recipe.items.length > 0 && <TestLab id={id} recipe={recipe} />}
    </>
  )
}

function Totals({
  summary,
  pieces,
  yieldLabel,
  currency,
}: {
  summary: ReturnType<typeof summarize>
  pieces: number | null
  yieldLabel: string
  currency: string
}) {
  return (
    <>
      <dl className="stats big">
        <div>
          <dt>Total weight</dt>
          <dd>{fmtGrams(summary.totalGrams)}</dd>
        </div>
        <div>
          <dt>Batch cost</dt>
          <dd>
            {fmtMoney(summary.totalCost, currency)}
            {summary.costIncomplete && '*'}
          </dd>
        </div>
        {summary.totalGrams > 0 && (
          <div>
            <dt>Cost per kg</dt>
            <dd>{fmtMoney((summary.totalCost / summary.totalGrams) * 1000, currency)}</dd>
          </div>
        )}
        {pieces ? (
          <div>
            <dt>
              Makes ≈ {+pieces.toFixed(1)} {yieldLabel}
            </dt>
            <dd>{fmtMoney(summary.totalCost / pieces, currency)} each</dd>
          </div>
        ) : null}
      </dl>
      {summary.costIncomplete && (
        <p className="small muted">* Some ingredients have no price or are missing, so the cost is incomplete.</p>
      )}
    </>
  )
}

function TestLab({ id, recipe }: { id: string; recipe: Recipe }) {
  const { ingredients, currency } = useAppData()
  const tests = useDbValue<Record<string, TestRun>>(`tests/${id}`)
  const original = recipe.items.map((i) => i.percent)

  const [flourInput, setFlourInput] = useState(String(recipe.baseFlour))
  const [percents, setPercents] = useState<string[]>(() => original.map(String))
  const [piecesMade, setPiecesMade] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  // If the recipe's ingredients change (edited elsewhere), keep the lab aligned with it.
  const aligned = percents.length === recipe.items.length ? percents : original.map(String)

  const flour = parseFloat(flourInput) || 0
  const items = recipe.items.map((it, i) => ({ ...it, percent: parseFloat(aligned[i]) || 0 }))
  const lines = computeLines(items, ingredients, flour)
  const summary = summarize(lines)
  const made = parseFloat(piecesMade)
  const changedCount = items.filter((it, i) => it.percent !== original[i]).length

  function reset() {
    setPercents(original.map(String))
    setFlourInput(String(recipe.baseFlour))
    setPiecesMade('')
    setNotes('')
    setMessage('')
  }

  function loadTest(t: TestRun) {
    const byId = new Map(t.lines.map((l) => [l.ingredientId, l.percent]))
    setPercents(recipe.items.map((it) => String(byId.get(it.ingredientId) ?? it.percent)))
    setFlourInput(String(t.flourWeight))
    setPiecesMade(t.piecesMade ? String(t.piecesMade) : '')
    setNotes('')
    setMessage('Test loaded into the lab. Change it and save it as a new test.')
    document.getElementById('test-lab')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function save() {
    if (!(flour > 0)) return setMessage('Enter a flour weight first.')
    setBusy(true)
    try {
      await saveTest(id, {
        flourWeight: flour,
        lines: lines.map((l) => ({
          ingredientId: l.ingredientId,
          name: l.ingredient?.name ?? 'Missing ingredient',
          unit: l.ingredient?.unit ?? 'g',
          percent: l.percent,
          grams: l.grams,
          quantity: l.quantity,
          cost: l.cost,
        })),
        totalWeight: summary.totalGrams,
        totalCost: summary.totalCost,
        piecesMade: made > 0 ? made : null,
        notes: notes.trim(),
        createdAt: Date.now(),
      })
      setNotes('')
      setPiecesMade('')
      setMessage('Test saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function applyToRecipe() {
    if (!confirm('Replace the recipe’s percentages with the ones in the lab?')) return
    await updateRecipeItems(id, items)
    setMessage('Recipe updated with the lab percentages.')
  }

  const testList = Object.entries(tests.value ?? {}).sort(([, a], [, b]) => b.createdAt - a.createdAt)

  return (
    <>
      <section className="card lab" id="test-lab">
        <div className="section-head">
          <div>
            <h2>Test lab</h2>
            <p className="muted small">
              Try different percentages and flour amounts, then save the bake with notes so tests can be compared.
            </p>
          </div>
          <FlourBadge percent={summary.flourPercent} hasItems />
        </div>

        <div className="scaler">
          <label className="field">
            <span>Test flour</span>
            <div className="suffix-input">
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={flourInput}
                onChange={(e) => setFlourInput(e.target.value)}
              />
              <span>g</span>
            </div>
          </label>
          <label className="field">
            <span>{recipe.yieldLabel || 'Pieces'} made (optional)</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={piecesMade}
              onChange={(e) => setPiecesMade(e.target.value)}
            />
          </label>
        </div>

        <LinesTable
          lines={lines}
          currency={currency}
          percentInputs={{
            values: aligned,
            original,
            onChange: (i, v) => setPercents(aligned.map((p, j) => (j === i ? v : p))),
          }}
        />

        <dl className="stats">
          <div>
            <dt>Total weight</dt>
            <dd>{fmtGrams(summary.totalGrams)}</dd>
          </div>
          <div>
            <dt>Batch cost</dt>
            <dd>
              {fmtMoney(summary.totalCost, currency)}
              {summary.costIncomplete && '*'}
            </dd>
          </div>
          {made > 0 && (
            <div>
              <dt>Cost each</dt>
              <dd>{fmtMoney(summary.totalCost / made, currency)}</dd>
            </div>
          )}
        </dl>

        <label className="field">
          <span>Notes on this bake</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it turn out? Texture, taste, rise, what to change next time…"
          />
        </label>

        {message && <div className="alert">{message}</div>}

        <div className="row wrap">
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save test'}
          </button>
          <button className="btn ghost" onClick={reset}>
            Reset to recipe
          </button>
          {changedCount > 0 && (
            <button className="btn ghost" onClick={applyToRecipe}>
              Use these % in the recipe ({changedCount} changed)
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Saved tests {testList.length > 0 && <span className="muted">({testList.length})</span>}</h2>
        {tests.loading ? (
          <p className="muted">Loading…</p>
        ) : testList.length === 0 ? (
          <p className="muted">No tests saved yet.</p>
        ) : (
          <ul className="tests">
            {testList.map(([tid, t]) => {
              const isOpen = open === tid
              const diffs = t.lines.filter((l) => {
                const cur = recipe.items.find((it) => it.ingredientId === l.ingredientId)
                return !cur || cur.percent !== l.percent
              })
              return (
                <li key={tid} className={isOpen ? 'open' : undefined}>
                  <button className="test-summary" onClick={() => setOpen(isOpen ? null : tid)} aria-expanded={isOpen}>
                    <span className="test-date">
                      {new Date(t.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span>{fmtGrams(t.flourWeight)} flour</span>
                    <span>{fmtMoney(t.totalCost, currency)}</span>
                    <span>
                      {t.piecesMade ? `${fmtMoney(t.totalCost / t.piecesMade, currency)} each` : <span className="muted">—</span>}
                    </span>
                    <span className="muted small test-notes">{t.notes || (diffs.length ? `${diffs.length} % different` : 'Same as recipe')}</span>
                  </button>
                  {isOpen && (
                    <div className="test-detail">
                      {t.notes && <p className="notes">{t.notes}</p>}
                      <table className="table compact">
                        <thead>
                          <tr>
                            <th>Ingredient</th>
                            <th className="num">%</th>
                            <th className="num">Recipe now</th>
                            <th className="num">Grams</th>
                            <th className="num">Cost then</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.lines.map((l) => {
                            const cur = recipe.items.find((it) => it.ingredientId === l.ingredientId)
                            const differs = !cur || cur.percent !== l.percent
                            return (
                              <tr key={l.ingredientId} className={differs ? 'changed' : undefined}>
                                <td>{l.name}</td>
                                <td className="num">{l.percent}%</td>
                                <td className="num muted">{cur ? `${cur.percent}%` : 'removed'}</td>
                                <td className="num">{fmtGrams(l.grams)}</td>
                                <td className="num">{fmtMoney(l.cost, currency)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <div className="row wrap">
                        <button className="btn small" onClick={() => loadTest(t)}>
                          Load into lab
                        </button>
                        <button
                          className="btn ghost small danger"
                          onClick={() => confirm('Delete this test?') && deleteTest(id, tid)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
