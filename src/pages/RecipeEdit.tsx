import { useState, type FormEvent } from 'react'
import { computeLines, fmtMinutes, fmtMoney, fmtQty, summarize } from '../lib/calc'
import { navigate, useAppData } from '../lib/context'
import { deleteRecipe, saveRecipe } from '../lib/data'
import type { Recipe } from '../lib/types'
import FlourBadge from '../components/FlourBadge'

interface ItemRow {
  key: number
  ingredientId: string
  percent: string
  reason: string
}
interface DurationRow {
  key: number
  label: string
  minutes: string
}

let nextKey = 1
const k = () => nextKey++

export default function RecipeEdit({ id }: { id: string | null }) {
  const { recipes, ingredients, currency } = useAppData()
  const initial: Recipe | undefined = id ? recipes[id] : undefined

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [baseFlour, setBaseFlour] = useState(String(initial?.baseFlour ?? 1000))
  const [yieldCount, setYieldCount] = useState(initial?.yieldCount ? String(initial.yieldCount) : '')
  const [yieldLabel, setYieldLabel] = useState(initial?.yieldLabel ?? '')
  const [durations, setDurations] = useState<DurationRow[]>(() =>
    initial
      ? initial.durations.map((d) => ({ key: k(), label: d.label, minutes: String(d.minutes) }))
      : [
          { key: k(), label: 'Prep', minutes: '' },
          { key: k(), label: 'Cook', minutes: '' },
        ],
  )
  const [items, setItems] = useState<ItemRow[]>(() =>
    initial
      ? initial.items.map((i) => ({ key: k(), ingredientId: i.ingredientId, percent: String(i.percent), reason: i.reason }))
      : [],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (id && !initial) {
    return (
      <div className="empty card">
        <p>This recipe doesn’t exist any more.</p>
        <a className="btn" href="#/recipes">
          Back to recipes
        </a>
      </div>
    )
  }

  const ingredientOptions = Object.entries(ingredients).sort(
    ([, a], [, b]) => Number(!!b.isFlour) - Number(!!a.isFlour) || a.name.localeCompare(b.name),
  )

  const flour = parseFloat(baseFlour) || 0
  const parsedItems = items.map((i) => ({
    ingredientId: i.ingredientId,
    percent: parseFloat(i.percent) || 0,
    reason: i.reason.trim(),
  }))
  const lines = computeLines(parsedItems, ingredients, flour)
  const summary = summarize(lines)
  const totalMinutes = durations.reduce((s, d) => s + (parseFloat(d.minutes) || 0), 0)

  const patchItem = (key: number, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const patchDuration = (key: number, patch: Partial<DurationRow>) =>
    setDurations((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  function chooseIngredient(key: number, ingredientId: string) {
    setItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r
        // A first flour defaults to 100% so the basis is right straight away.
        const isFirstFlour =
          ingredients[ingredientId]?.isFlour && !rows.some((o) => o.key !== key && ingredients[o.ingredientId]?.isFlour)
        return { ...r, ingredientId, percent: r.percent || (isFirstFlour ? '100' : '') }
      }),
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!(flour > 0)) return setError('Base flour weight must be more than 0.')
    if (items.some((i) => !i.ingredientId)) return setError('Choose an ingredient on every row, or remove empty rows.')
    const ids = items.map((i) => i.ingredientId)
    if (new Set(ids).size !== ids.length) return setError('Each ingredient can only appear once.')
    setBusy(true)
    try {
      const yc = parseFloat(yieldCount)
      const savedId = await saveRecipe(id, {
        name: name.trim(),
        description: description.trim(),
        baseFlour: flour,
        yieldCount: yc > 0 ? yc : null,
        yieldLabel: yieldLabel.trim(),
        durations: durations
          .filter((d) => d.label.trim() || d.minutes)
          .map((d) => ({ label: d.label.trim(), minutes: parseFloat(d.minutes) || 0 })),
        items: parsedItems,
        createdAt: initial?.createdAt,
      })
      navigate(`/recipes/${savedId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!id || !confirm(`Delete “${initial?.name}” and all its test runs? This can’t be undone.`)) return
    await deleteRecipe(id)
    navigate('/recipes')
  }

  return (
    <form onSubmit={submit}>
      <div className="page-head">
        <div>
          <a className="back" href={id ? `#/recipes/${id}` : '#/recipes'}>
            ← {id ? initial?.name : 'Recipes'}
          </a>
          <h1>{id ? 'Edit recipe' : 'New recipe'}</h1>
        </div>
        <div className="row">
          {id && (
            <button type="button" className="btn ghost danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="card">
        <h2>Details</h2>
        <label className="field">
          <span>Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ginger bread" />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid-3">
          <label className="field">
            <span>Base flour weight (g)</span>
            <input
              required
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={baseFlour}
              onChange={(e) => setBaseFlour(e.target.value)}
            />
            <small className="muted">The batch size the recipe opens at.</small>
          </label>
          <label className="field">
            <span>Makes (at base flour)</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={yieldCount}
              onChange={(e) => setYieldCount(e.target.value)}
              placeholder="e.g. 24"
            />
          </label>
          <label className="field">
            <span>Unit</span>
            <input value={yieldLabel} onChange={(e) => setYieldLabel(e.target.value)} placeholder="e.g. cookies, loaves" />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Cook durations</h2>
          <span className="muted">Total {fmtMinutes(totalMinutes)}</span>
        </div>
        {durations.map((d) => (
          <div key={d.key} className="duration-row">
            <input
              aria-label="Stage"
              value={d.label}
              onChange={(e) => patchDuration(d.key, { label: e.target.value })}
              placeholder="Stage (e.g. Proofing, Baking)"
            />
            <div className="suffix-input">
              <input
                aria-label="Minutes"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={d.minutes}
                onChange={(e) => patchDuration(d.key, { minutes: e.target.value })}
              />
              <span>min</span>
            </div>
            <button
              type="button"
              className="btn ghost small icon"
              aria-label="Remove stage"
              onClick={() => setDurations((rows) => rows.filter((r) => r.key !== d.key))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setDurations((rows) => [...rows, { key: k(), label: '', minutes: '' }])}
        >
          + Add stage
        </button>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Ingredients</h2>
          <FlourBadge percent={summary.flourPercent} hasItems={items.length > 0} />
        </div>
        <p className="muted small">
          Enter each amount as a % of total flour weight. Flour adds up to 100%; 65% water means 650 g of water per
          1 kg of flour. Amounts on the right are at {fmtQty(flour, 'g')} of flour.
        </p>

        {ingredientOptions.length === 0 ? (
          <div className="alert">
            You haven’t added any ingredients yet. <a href="#/ingredients">Add them first</a>.
          </div>
        ) : (
          <>
            <div className="item-rows">
              {items.map((row, idx) => {
                const line = lines[idx]
                return (
                  <div key={row.key} className="item-row">
                    <select
                      aria-label="Ingredient"
                      value={row.ingredientId}
                      onChange={(e) => chooseIngredient(row.key, e.target.value)}
                      className={!row.ingredientId ? 'placeholder' : undefined}
                    >
                      <option value="">Choose ingredient…</option>
                      {ingredientOptions.map(([iid, ing]) => (
                        <option key={iid} value={iid}>
                          {ing.name}
                          {ing.isFlour ? ' (flour)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="suffix-input pct">
                      <input
                        aria-label="Percent of flour"
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={row.percent}
                        onChange={(e) => patchItem(row.key, { percent: e.target.value })}
                      />
                      <span>%</span>
                    </div>
                    <div className="item-calc">
                      <span>{line.ingredient ? fmtQty(line.quantity, line.ingredient.unit) : '—'}</span>
                      <span className="muted">{fmtMoney(line.cost, currency)}</span>
                    </div>
                    <button
                      type="button"
                      className="btn ghost small icon"
                      aria-label="Remove ingredient"
                      onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}
                    >
                      ✕
                    </button>
                    <input
                      className="reason"
                      aria-label="Why it’s needed"
                      value={row.reason}
                      onChange={(e) => patchItem(row.key, { reason: e.target.value })}
                      placeholder="Why it’s needed (e.g. gives structure, adds moisture, leavening)"
                    />
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => setItems((rows) => [...rows, { key: k(), ingredientId: '', percent: '', reason: '' }])}
            >
              + Add ingredient
            </button>
            {items.length > 0 && (
              <div className="totals">
                <div>
                  <span className="muted">Total weight</span> <strong>{fmtQty(summary.totalGrams, 'g')}</strong>
                </div>
                <div>
                  <span className="muted">Batch cost</span>{' '}
                  <strong>
                    {fmtMoney(summary.totalCost, currency)}
                    {summary.costIncomplete && '*'}
                  </strong>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </form>
  )
}
