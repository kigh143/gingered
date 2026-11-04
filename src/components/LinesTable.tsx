import { fmtMoney, fmtQty, type Line } from '../lib/calc'

interface Props {
  lines: Line[]
  currency: string
  showReason?: boolean
  /** When given, each row gets an on/off switch. */
  onToggle?: (index: number, active: boolean) => void
  /** When given, the % column becomes editable. */
  percentInputs?: {
    values: string[]
    /** The recipe's own %, used to highlight what was changed. */
    original: number[]
    onChange: (index: number, value: string) => void
  }
}

export default function LinesTable({ lines, currency, showReason, percentInputs, onToggle }: Props) {
  return (
    <div className="table-wrap">
      <table className="table lines">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th className="num">% of flour</th>
            <th className="num">Amount</th>
            <th className="num">Cost</th>
            {showReason && <th>Why it’s needed</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const changed =
              l.active && percentInputs && (parseFloat(percentInputs.values[i]) || 0) !== percentInputs.original[i]
            return (
              <tr key={l.ingredientId + i} className={!l.active ? 'inactive' : changed ? 'changed' : undefined}>
                <td data-label="Ingredient">
                  {onToggle && (
                    <ActiveSwitch
                      active={l.active}
                      label={l.ingredient?.name ?? 'ingredient'}
                      onChange={(v) => onToggle(i, v)}
                    />
                  )}
                  {!l.active && !onToggle && <span className="tag muted-tag">off</span>}
                  {l.ingredient ? (
                    <>
                      {l.ingredient.name}
                      {l.ingredient.isFlour && <span className="tag">flour</span>}
                    </>
                  ) : (
                    <span className="text-danger">Missing ingredient</span>
                  )}
                </td>
                <td data-label="% of flour" className="num">
                  {percentInputs && l.active ? (
                    <div className="suffix-input pct inline">
                      <input
                        aria-label={`% of flour for ${l.ingredient?.name ?? 'ingredient'}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={percentInputs.values[i]}
                        onChange={(e) => percentInputs.onChange(i, e.target.value)}
                      />
                      <span>%</span>
                    </div>
                  ) : (
                    `${l.percent.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
                  )}
                  {changed && (
                    <div className="small muted">was {percentInputs.original[i].toLocaleString()}%</div>
                  )}
                </td>
                <td data-label="Amount" className="num strong">
                  {l.active ? fmtQty(l.quantity, l.ingredient?.unit) : <span className="muted">off</span>}
                  {l.active && l.ingredient?.unit === 'pc' && <div className="small muted">{fmtQty(l.grams, 'g')}</div>}
                </td>
                <td data-label="Cost" className="num">
                  {l.active ? fmtMoney(l.cost, currency) : <span className="muted">—</span>}
                </td>
                {showReason && (
                  <td data-label="Why" className="reason-cell">
                    {l.reason || <span className="muted">—</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ActiveSwitch({
  active,
  label,
  onChange,
}: {
  active: boolean
  label: string
  onChange: (active: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? 'Turn off' : 'Turn on'} ${label}`}
      title={active ? 'In use. Click to leave it out.' : 'Left out. Click to use it again.'}
      className={`switch ${active ? 'on' : ''}`}
      onClick={() => onChange(!active)}
    >
      <span />
    </button>
  )
}
