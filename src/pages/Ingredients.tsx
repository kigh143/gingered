import { useState, type FormEvent } from 'react'
import { costPerUnit, fmtMoney, fmtQty } from '../lib/calc'
import { useAppData } from '../lib/context'
import { addStock, deleteIngredient, saveIngredient } from '../lib/data'
import type { Ingredient, Unit } from '../lib/types'

const unitShort: Record<Unit, string> = { g: 'g', ml: 'ml', pc: 'pc' }

export default function IngredientsPage() {
  const { ingredients, recipes, currency } = useAppData()
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [stocking, setStocking] = useState<string | null>(null)
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
                <th className="num">In stock</th>
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
                  <td data-label="In stock" className="num">
                    {ing.stock === undefined || ing.stock === null ? (
                      <span className="muted">not set</span>
                    ) : (
                      <span className={ing.stock <= 0 ? 'text-danger strong' : undefined}>
                        {ing.stock < 0 ? `−${fmtQty(-ing.stock, ing.unit)}` : fmtQty(ing.stock, ing.unit)}
                      </span>
                    )}
                  </td>
                  <td className="actions">
                    <button className="btn small" onClick={() => setStocking(id)}>
                      + Stock
                    </button>
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

      {stocking && ingredients[stocking] && (
        <AddStockForm id={stocking} ingredient={ingredients[stocking]} onClose={() => setStocking(null)} />
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
  const [stock, setStock] = useState(
    initial?.stock === undefined || initial?.stock === null ? '' : String(+initial.stock.toFixed(2)),
  )
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
        stock: stock.trim() === '' ? null : parseFloat(stock) || 0,
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
          <span>Stock on hand ({unit})</span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Leave blank if you don’t track stock"
          />
          <small className="muted">Use this to correct a count. For new purchases, use “+ Stock” instead.</small>
        </label>
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

function AddStockForm({ id, ingredient, onClose }: { id: string; ingredient: Ingredient; onClose: () => void }) {
  const { currency } = useAppData()
  const [packs, setPacks] = useState('1')
  const [extra, setExtra] = useState('')
  const [packPrice, setPackPrice] = useState(String(ingredient.packPrice))
  const [store, setStore] = useState(ingredient.store)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const u = ingredient.unit

  const amount = (parseFloat(packs) || 0) * ingredient.packSize + (parseFloat(extra) || 0)
  const price = parseFloat(packPrice)
  const priceChanged = price >= 0 && (price !== ingredient.packPrice || store.trim() !== ingredient.store)
  const current = ingredient.stock ?? 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!(amount > 0)) return setError('Enter how much you bought.')
    if (!(price >= 0)) return setError('Enter the price paid per pack.')
    setBusy(true)
    try {
      await addStock(id, amount, priceChanged ? { packPrice: price, store: store.trim() } : undefined)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal card" onSubmit={submit}>
        <h2>Add stock: {ingredient.name}</h2>
        <p className="muted small">
          Now in stock: {ingredient.stock === undefined || ingredient.stock === null ? 'not set' : fmtQty(current, u)}
        </p>
        <div className="grid-2">
          <label className="field">
            <span>Packs bought ({fmtQty(ingredient.packSize, u)} each)</span>
            <input autoFocus type="number" min="0" step="any" inputMode="decimal" value={packs} onChange={(e) => setPacks(e.target.value)} />
          </label>
          <label className="field">
            <span>Plus loose amount ({u})</span>
            <input type="number" min="0" step="any" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span>Price paid per pack</span>
            <input type="number" min="0" step="any" inputMode="decimal" value={packPrice} onChange={(e) => setPackPrice(e.target.value)} />
          </label>
          <label className="field">
            <span>Bought at</span>
            <input value={store} onChange={(e) => setStore(e.target.value)} />
          </label>
        </div>
        <div className="calc-hint">
          Adds <strong>{fmtQty(amount, u)}</strong>, so stock becomes <strong>{fmtQty(current + amount, u)}</strong>
          {priceChanged && (
            <>
              . The price changes to <strong>{fmtMoney(price, currency)}</strong> per pack for future costing. Saved
              tests and batches keep their old prices.
            </>
          )}
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add stock'}
          </button>
        </div>
      </form>
    </div>
  )
}
