import { useState, type FormEvent } from 'react'
import { costPerUnit, fmtMoney, fmtQty } from '../lib/calc'
import { useAppData } from '../lib/context'
import { deleteIngredient, saveIngredient } from '../lib/data'
import type { Ingredient, Unit } from '../lib/types'

const unitShort: Record<Unit, string> = { g: 'g', ml: 'ml', pc: 'pc' }

export default function IngredientsPage() {
  const { ingredients, recipes, currency } = useAppData()
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [query, setQuery] = useState('')

  const list = Object.entries(ingredients)
    .filter(([, i]) => `${i.name} ${i.store}`.toLowerCase().includes(query.toLowerCase()))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))

  function usedIn(id: string) {
    return Object.values(recipes)
      .filter((r) => r.items.some((it) => it.ingredientId === id))
      .map((r) => r.name)
  }

  async function onDelete(id: string) {
    const used = usedIn(id)
    const name = ingredients[id].name
    const msg = used.length
      ? `“${name}” is used in: ${used.join(', ')}.\nThose recipes will show it as missing. Delete anyway?`
      : `Delete “${name}”?`
    if (confirm(msg)) await deleteIngredient(id)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ingredients</h1>
          <p className="muted">What you buy, where you buy it, and what it costs.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ id: null })}>
          + Add ingredient
        </button>
      </div>

      {Object.keys(ingredients).length > 6 && (
        <input
          className="search"
          type="search"
          placeholder="Search ingredients or shops…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {list.length === 0 ? (
        <div className="empty card">
          {Object.keys(ingredients).length === 0 ? (
            <>
              <p>No ingredients yet. Add flour first, then everything else your recipes need.</p>
              <button className="btn primary" onClick={() => setEditing({ id: null })}>
                + Add ingredient
              </button>
            </>
          ) : (
            <p>Nothing matches “{query}”.</p>
          )}
        </div>
      ) : (
        <div className="table-wrap card flush">
          <table className="table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Bought at</th>
                <th className="num">Pack</th>
                <th className="num">Pack price</th>
                <th className="num">Cost per unit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map(([id, ing]) => (
                <tr key={id}>
                  <td data-label="Ingredient">
                    <strong>{ing.name}</strong>
                    {ing.isFlour && <span className="tag">flour</span>}
                    {ing.notes && <div className="muted small">{ing.notes}</div>}
                  </td>
                  <td data-label="Bought at">{ing.store || <span className="muted">—</span>}</td>
                  <td data-label="Pack" className="num">
                    {fmtQty(ing.packSize, ing.unit)}
                    {ing.unit === 'pc' && ing.gramsPerPiece ? (
                      <div className="muted small">{ing.gramsPerPiece} g each</div>
                    ) : null}
                  </td>
                  <td data-label="Pack price" className="num">
                    {fmtMoney(ing.packPrice, currency)}
                  </td>
                  <td data-label="Cost per unit" className="num">
                    {fmtMoney(costPerUnit(ing), currency, 2)}
                    <span className="muted"> / {unitShort[ing.unit]}</span>
                  </td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => setEditing({ id })}>
                      Edit
                    </button>
                    <button className="btn ghost small danger" onClick={() => onDelete(id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <IngredientForm
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.id ? ingredients[editing.id] : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function IngredientForm({
  id,
  initial,
  onClose,
}: {
  id: string | null
  initial?: Ingredient
  onClose: () => void
}) {
  const { currency } = useAppData()
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'g')
  const [packSize, setPackSize] = useState(initial ? String(initial.packSize) : '')
  const [packPrice, setPackPrice] = useState(initial ? String(initial.packPrice) : '')
  const [store, setStore] = useState(initial?.store ?? '')
  const [gramsPerPiece, setGramsPerPiece] = useState(initial?.gramsPerPiece ? String(initial.gramsPerPiece) : '')
  const [isFlour, setIsFlour] = useState(initial?.isFlour ?? false)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const size = parseFloat(packSize)
  const price = parseFloat(packPrice)
  const perUnit = size > 0 && price >= 0 ? price / size : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!(size > 0)) return setError('Pack size must be more than 0.')
    if (!(price >= 0)) return setError('Enter the pack price.')
    const gpp = parseFloat(gramsPerPiece)
    if (unit === 'pc' && !(gpp > 0))
      return setError('Enter the weight of one piece so recipes can measure it against flour.')
    setBusy(true)
    try {
      await saveIngredient(id, {
        name: name.trim(),
        unit,
        packSize: size,
        packPrice: price,
        store: store.trim(),
        gramsPerPiece: unit === 'pc' ? gpp : null,
        isFlour: unit === 'pc' ? false : isFlour,
        notes: notes.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal card" onSubmit={submit}>
        <h2>{id ? 'Edit ingredient' : 'New ingredient'}</h2>
        <label className="field">
          <span>Name</span>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Baking flour" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Measured in</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              <option value="g">grams (g)</option>
              <option value="ml">millilitres (ml)</option>
              <option value="pc">pieces (pc)</option>
            </select>
          </label>
          <label className="field">
            <span>Where it was bought</span>
            <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="Shop or market" />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Pack size ({unit})</span>
            <input
              required
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              placeholder={unit === 'g' ? '2000' : unit === 'ml' ? '1000' : '30'}
            />
          </label>
          <label className="field">
            <span>Price paid for the pack</span>
            <input
              required
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={packPrice}
              onChange={(e) => setPackPrice(e.target.value)}
            />
          </label>
        </div>
        {unit === 'pc' && (
          <label className="field">
            <span>Weight of one piece (g)</span>
            <input
              required
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={gramsPerPiece}
              onChange={(e) => setGramsPerPiece(e.target.value)}
              placeholder="e.g. 50 for an egg"
            />
            <small className="muted">Recipes measure everything against flour weight, so pieces need a weight.</small>
          </label>
        )}
        <div className="calc-hint">
          Cost per {unit}: <strong>{fmtMoney(perUnit, currency, 2)}</strong>
        </div>
        {unit !== 'pc' && (
          <label className="check">
            <input type="checkbox" checked={isFlour} onChange={(e) => setIsFlour(e.target.checked)} />
            <span>
              This is a flour <span className="muted">(counts toward the 100% that every other ingredient is measured against)</span>
            </span>
          </label>
        )}
        <label className="field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brand, quality, anything worth remembering" />
        </label>
        {error && <div className="alert error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
