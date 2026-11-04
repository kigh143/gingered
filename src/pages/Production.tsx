import { useState, type FormEvent } from 'react'
import { batchSold, fmtGrams, fmtMoney, fmtQty, singular } from '../lib/calc'
import { useAppData } from '../lib/context'
import { addSale, deleteBatch, deleteSale, updateBatch, useDbValue } from '../lib/data'
import type { Batch } from '../lib/types'

const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const n = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function ProductionPage() {
  const { recipes, currency } = useAppData()
  const production = useDbValue<Record<string, Batch>>('production')
  const [recipeFilter, setRecipeFilter] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const all = Object.entries(production.value ?? {}).sort(([, a], [, b]) => b.createdAt - a.createdAt)
  const list = recipeFilter ? all.filter(([, b]) => b.recipeId === recipeFilter) : all
  const recipeOptions = [...new Map(all.map(([, b]) => [b.recipeId, recipes[b.recipeId]?.name ?? b.recipeName]))]

  const totals = list.reduce(
    (t, [, b]) => {
      const sold = batchSold(b.sales)
      t.made += b.piecesMade
      t.sold += sold
      t.cost += b.totalCost
      t.takings += sold * b.pricePerPiece
      t.unsoldValue += Math.max(0, b.piecesMade - sold) * b.pricePerPiece
      return t
    },
    { made: 0, sold: 0, cost: 0, takings: 0, unsoldValue: 0 },
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Production</h1>
          <p className="muted">Every batch you’ve manufactured, and what’s been sold. Start a batch from a recipe’s page.</p>
        </div>
        {recipeOptions.length > 1 && (
          <select className="filter" value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value)}>
            <option value="">All recipes</option>
            {recipeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {production.loading ? (
        <p className="muted">Loading…</p>
      ) : production.error ? (
        <div className="alert error">Couldn’t read production: {production.error}</div>
      ) : all.length === 0 ? (
        <div className="empty card">
          <p>No batches yet. Open a recipe and click Manufacture.</p>
          <a className="btn primary" href="#/recipes">
            Go to recipes
          </a>
        </div>
      ) : (
        <>
          <div className="card">
            <dl className="stats big flat">
              <div>
                <dt>Batches</dt>
                <dd>{list.length}</dd>
              </div>
              <div>
                <dt>Made / sold / left</dt>
                <dd>
                  {n(totals.made)} / {n(totals.sold)} / {n(totals.made - totals.sold)}
                </dd>
              </div>
              <div>
                <dt>Ingredient cost</dt>
                <dd>{fmtMoney(totals.cost, currency)}</dd>
              </div>
              <div>
                <dt>Takings so far</dt>
                <dd>{fmtMoney(totals.takings, currency)}</dd>
              </div>
              <div>
                <dt>Profit so far</dt>
                <dd className={totals.takings - totals.cost < 0 ? 'text-danger' : undefined}>
                  {fmtMoney(totals.takings - totals.cost, currency)}
                </dd>
              </div>
              <div>
                <dt>Unsold value</dt>
                <dd>{fmtMoney(totals.unsoldValue, currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="card flush">
            <ul className="batches">
              {list.map(([id, b]) => (
                <BatchRow
                  key={id}
                  id={id}
                  batch={b}
                  currency={currency}
                  open={open === id}
                  onToggle={() => setOpen(open === id ? null : id)}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  )
}

function BatchRow({
  id,
  batch: b,
  currency,
  open,
  onToggle,
}: {
  id: string
  batch: Batch
  currency: string
  open: boolean
  onToggle: () => void
}) {
  const { ingredients } = useAppData()
  const sold = batchSold(b.sales)
  const left = b.piecesMade - sold
  const costEach = b.piecesMade > 0 ? b.totalCost / b.piecesMade : 0
  const label = b.yieldLabel || 'pieces'

  return (
    <li className={open ? 'open' : undefined}>
      <button className="batch-summary" onClick={onToggle} aria-expanded={open}>
        <span>
          <strong>{b.recipeName}</strong>
          <span className="muted small block">{fmtDate(b.createdAt)}</span>
        </span>
        <span>
          {n(b.piecesMade)} {label}
          <span className="muted small block">{fmtGrams(b.flourWeight)} flour</span>
        </span>
        <span>
          {fmtMoney(b.pricePerPiece, currency)} each
          <span className="muted small block">cost {fmtMoney(costEach, currency)}</span>
        </span>
        <span>
          <span className={`badge ${left <= 0 ? 'ok' : 'warn'}`}>{left <= 0 ? 'Sold out' : `${n(left)} left`}</span>
          <span className="muted small block">{n(sold)} sold</span>
        </span>
      </button>
      {open && (
        <div className="batch-detail">
          <div className="detail-grid">
            <div>
              <h3>Ingredients used</h3>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th className="num">Used</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.ingredientId}>
                      <td>{l.name}</td>
                      <td className="num">{fmtQty(l.quantity, l.unit)}</td>
                      <td className="num">{fmtMoney(l.cost, currency)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>Total</td>
                    <td />
                    <td className="num">{fmtMoney(b.totalCost, currency)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="muted small">
                {b.stockDeducted ? 'Taken out of stock when saved.' : 'Stock wasn’t changed for this batch.'}
              </p>
            </div>
            <div>
              <Sales id={id} batch={b} left={left} currency={currency} />
              <EditBatch id={id} batch={b} label={label} />
            </div>
          </div>
          <div className="row end">
            <button
              className="btn ghost small danger"
              onClick={() => {
                if (!confirm(`Delete this ${b.recipeName} batch and its sales?`)) return
                const restore =
                  b.stockDeducted && confirm('Put the ingredients it used back into stock?\n\nOK = yes, Cancel = no')
                deleteBatch(id, b, restore, ingredients)
              }}
            >
              Delete batch
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Sales({ id, batch: b, left, currency }: { id: string; batch: Batch; left: number; currency: string }) {
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const sales = Object.entries(b.sales ?? {}).sort(([, a], [, c]) => c.at - a.at)
  const sold = batchSold(b.sales)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const q = parseFloat(qty)
    if (!(q > 0)) return
    if (q > left && !confirm(`That’s more than the ${n(left)} left. Record it anyway?`)) return
    setBusy(true)
    await addSale(id, q)
    setQty('')
    setBusy(false)
  }

  return (
    <div className="sales">
      <h3>Sales</h3>
      <form className="row" onSubmit={submit}>
        <input
          aria-label="Quantity sold"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder={left > 0 ? `Sold (up to ${n(left)})` : 'Sold'}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <button className="btn small" disabled={busy || !(parseFloat(qty) > 0)}>
          Record sale
        </button>
        {left > 0 && (
          <button type="button" className="btn ghost small" disabled={busy} onClick={() => addSale(id, left)}>
            Sold all
          </button>
        )}
      </form>
      {sales.length > 0 && (
        <ul className="sale-list">
          {sales.map(([sid, s]) => (
            <li key={sid}>
              <span>{fmtDate(s.at)}</span>
              <span>{n(s.qty)}</span>
              <span className="muted">{fmtMoney(s.qty * b.pricePerPiece, currency)}</span>
              <button
                className="btn ghost small icon"
                aria-label="Remove sale"
                onClick={() => confirm('Remove this sale?') && deleteSale(id, sid)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="small">
        Takings <strong>{fmtMoney(sold * b.pricePerPiece, currency)}</strong>
        <span className="muted"> of {fmtMoney(b.piecesMade * b.pricePerPiece, currency)} if all sell</span>
      </p>
    </div>
  )
}

function EditBatch({ id, batch: b, label }: { id: string; batch: Batch; label: string }) {
  const [price, setPrice] = useState(String(b.pricePerPiece))
  const [made, setMade] = useState(String(b.piecesMade))
  const [notes, setNotes] = useState(b.notes ?? '')
  const [saved, setSaved] = useState(false)
  const dirty = price !== String(b.pricePerPiece) || made !== String(b.piecesMade) || notes !== (b.notes ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = parseFloat(price)
    const m = parseFloat(made)
    if (!(p >= 0) || !(m > 0)) return
    await updateBatch(id, { pricePerPiece: p, piecesMade: m, notes: notes.trim() })
    setSaved(true)
  }

  return (
    <form className="edit-batch" onSubmit={submit}>
      <div className="grid-2">
        <label className="field">
          <span>Price per {singular(label)}</span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <label className="field">
          <span>{label} made</span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={made}
            onChange={(e) => {
              setMade(e.target.value)
              setSaved(false)
            }}
          />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      <div className="row">
        <button className="btn small" disabled={!dirty}>
          Save changes
        </button>
        {saved && !dirty && <span className="muted small">Saved</span>}
      </div>
    </form>
  )
}
