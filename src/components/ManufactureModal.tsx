import { useState, type FormEvent } from 'react'
import { computeLines, fmtGrams, fmtMoney, fmtQty, scaledYield, singular, snapshotLines, summarize } from '../lib/calc'
import { navigate, useAppData } from '../lib/context'
import { saveBatch } from '../lib/data'
import type { Recipe } from '../lib/types'

interface Props {
  recipeId: string
  recipe: Recipe
  initialFlour: number
  onClose: () => void
}

const round = (n: number, d = 1) => +n.toFixed(d)

export default function ManufactureModal({ recipeId, recipe, initialFlour, onClose }: Props) {
  const { ingredients, currency } = useAppData()
  const label = recipe.yieldLabel || 'pieces'
  const firstExpected = scaledYield(recipe.yieldCount, recipe.baseFlour, initialFlour)

  const [flourInput, setFlourInput] = useState(String(round(initialFlour)))
  const [madeInput, setMadeInput] = useState(firstExpected ? String(Math.round(firstExpected)) : '')
  const [madeTouched, setMadeTouched] = useState(false)
  const [priceInput, setPriceInput] = useState(recipe.pricePerPiece ? String(recipe.pricePerPiece) : '')
  const [notes, setNotes] = useState('')
  const [deduct, setDeduct] = useState(true)
  const [saveDefault, setSaveDefault] = useState(!recipe.pricePerPiece)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const flour = parseFloat(flourInput) || 0
  const expected = scaledYield(recipe.yieldCount, recipe.baseFlour, flour)
  const lines = computeLines(recipe.items, ingredients, flour)
  const active = lines.filter((l) => l.active)
  const offCount = lines.length - active.length
  const summary = summarize(lines)

  const made = parseFloat(madeInput) || 0
  const price = parseFloat(priceInput)
  const hasPrice = priceInput.trim() !== '' && price >= 0
  const costEach = made > 0 ? summary.totalCost / made : null
  const revenue = hasPrice ? price * made : null
  const profit = revenue !== null ? revenue - summary.totalCost : null
  const profitEach = hasPrice && costEach !== null ? price - costEach : null
  const margin = revenue ? (profit! / revenue) * 100 : null

  const short = active.filter((l) => {
    const stock = l.ingredient?.stock
    return l.quantity !== null && (stock === undefined || stock === null || stock < l.quantity)
  })
  const priceDiffers = hasPrice && price !== recipe.pricePerPiece

  function setFlour(v: string) {
    setFlourInput(v)
    // Keep "made" following the batch size until the user types their own number.
    if (!madeTouched) {
      const e = scaledYield(recipe.yieldCount, recipe.baseFlour, parseFloat(v) || 0)
      setMadeInput(e ? String(Math.round(e)) : '')
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!(flour > 0)) return setError('Enter the flour weight for this batch.')
    if (!(made > 0)) return setError(`Enter how many ${label} the batch made.`)
    if (!hasPrice) return setError(`Enter the selling price per ${singular(label)}.`)
    setBusy(true)
    try {
      await saveBatch(
        {
          recipeId,
          recipeName: recipe.name,
          yieldLabel: label,
          flourWeight: flour,
          expectedPieces: expected,
          piecesMade: made,
          pricePerPiece: price,
          lines: snapshotLines(lines),
          totalCost: summary.totalCost,
          notes: notes.trim(),
          stockDeducted: deduct,
          createdAt: Date.now(),
        },
        { ingredients, setRecipePrice: saveDefault && priceDiffers },
      )
      onClose()
      navigate('/production')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal card wide" onSubmit={submit}>
        <div className="section-head">
          <div>
            <h2>Manufacture: {recipe.name}</h2>
            <p className="muted small">Saved as a produce batch. The quantities and prices are kept as they are today.</p>
          </div>
          <button type="button" className="btn ghost small icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="scaler">
          <label className="field">
            <span>Flour for this batch</span>
            <div className="suffix-input">
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                autoFocus
                value={flourInput}
                onChange={(e) => setFlour(e.target.value)}
              />
              <span>g</span>
            </div>
          </label>
          {recipe.yieldCount ? (
            <label className="field">
              <span>or {label} wanted</span>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={expected ? round(expected, 2) : ''}
                onChange={(e) => {
                  const want = parseFloat(e.target.value) || 0
                  setFlour(String(round((want / recipe.yieldCount!) * recipe.baseFlour)))
                }}
              />
            </label>
          ) : null}
        </div>

        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th className="num">Needed</th>
                <th className="num">Cost</th>
                <th className="num">In stock</th>
                <th className="num">After</th>
              </tr>
            </thead>
            <tbody>
              {active.map((l, i) => {
                const unit = l.ingredient?.unit
                const stock = l.ingredient?.stock ?? null
                const after = stock !== null && l.quantity !== null ? stock - l.quantity : null
                const isShort = short.includes(l)
                return (
                  <tr key={l.ingredientId + i} className={isShort ? 'short' : undefined}>
                    <td>{l.ingredient?.name ?? <span className="text-danger">Missing ingredient</span>}</td>
                    <td className="num strong">{fmtQty(l.quantity, unit)}</td>
                    <td className="num">{fmtMoney(l.cost, currency)}</td>
                    <td className="num">{stock === null ? <span className="muted">not set</span> : fmtQty(stock, unit)}</td>
                    <td className={`num ${after !== null && after < 0 ? 'text-danger' : ''}`}>
                      {after === null ? '—' : after < 0 ? `−${fmtQty(-after, unit)}` : fmtQty(after, unit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {offCount > 0 && (
          <p className="muted small">
            {offCount} ingredient{offCount > 1 ? 's are' : ' is'} turned off on this recipe and left out.
          </p>
        )}
        {deduct && short.length > 0 && (
          <div className="alert warn top-gap">
            Not enough stock recorded for {short.map((l) => l.ingredient?.name ?? 'a missing ingredient').join(', ')}. You can
            still save; stock will go below zero until you add a purchase.
          </div>
        )}

        <div className="grid-3 top-gap">
          <label className="field">
            <span>{cap(label)} actually made</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={madeInput}
              onChange={(e) => {
                setMadeInput(e.target.value)
                setMadeTouched(true)
              }}
            />
            {expected ? <small className="muted">Expected ≈ {round(expected)}</small> : null}
          </label>
          <label className="field">
            <span>Price per {singular(label)}</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
            {priceDiffers && (
              <label className="check small tight">
                <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
                <span>Make this the recipe’s default price</span>
              </label>
            )}
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. slightly over-baked" />
          </label>
        </div>

        <dl className="stats big">
          <div>
            <dt>Batch cost</dt>
            <dd>
              {fmtMoney(summary.totalCost, currency)}
              {summary.costIncomplete && '*'}
            </dd>
          </div>
          <div>
            <dt>Cost each</dt>
            <dd>{fmtMoney(costEach, currency)}</dd>
          </div>
          <div>
            <dt>Profit each</dt>
            <dd className={profitEach !== null && profitEach < 0 ? 'text-danger' : undefined}>
              {fmtMoney(profitEach, currency)}
            </dd>
          </div>
          <div>
            <dt>Batch value</dt>
            <dd>{fmtMoney(revenue, currency)}</dd>
          </div>
          <div>
            <dt>Batch profit{margin !== null ? ` (${round(margin)}%)` : ''}</dt>
            <dd className={profit !== null && profit < 0 ? 'text-danger' : undefined}>{fmtMoney(profit, currency)}</dd>
          </div>
        </dl>
        <p className="muted small">
          {fmtGrams(summary.totalGrams)} of dough.
          {summary.costIncomplete && ' * Some ingredients have no price, so the cost is incomplete.'}
        </p>

        <label className="check">
          <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />
          <span>Take these ingredients out of stock</span>
        </label>

        {error && <div className="alert error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save as produce'}
          </button>
        </div>
      </form>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
