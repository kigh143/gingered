import { computeLines, fmtGrams, fmtMinutes, fmtMoney, scaledYield, summarize } from '../lib/calc'
import { useAppData } from '../lib/context'

export default function RecipesPage() {
  const { recipes, ingredients, currency } = useAppData()
  const list = Object.entries(recipes).sort(([, a], [, b]) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recipes</h1>
          <p className="muted">Every ingredient is measured as a percentage of the flour weight.</p>
        </div>
        <a className="btn primary" href="#/recipes/new">
          + New recipe
        </a>
      </div>

      {list.length === 0 ? (
        <div className="empty card">
          <p>No recipes yet.</p>
          {Object.keys(ingredients).length === 0 ? (
            <a className="btn primary" href="#/ingredients">
              Add your ingredients first
            </a>
          ) : (
            <a className="btn primary" href="#/recipes/new">
              + New recipe
            </a>
          )}
        </div>
      ) : (
        <div className="recipe-grid">
          {list.map(([id, r]) => {
            const s = summarize(computeLines(r.items, ingredients, r.baseFlour))
            const totalMin = r.durations.reduce((sum, d) => sum + (d.minutes || 0), 0)
            const pieces = scaledYield(r.yieldCount, r.baseFlour, r.baseFlour)
            return (
              <a key={id} href={`#/recipes/${id}`} className="card recipe-card">
                <h3>{r.name}</h3>
                {r.description && <p className="muted clamp">{r.description}</p>}
                <dl className="stats">
                  <div>
                    <dt>Flour</dt>
                    <dd>{fmtGrams(r.baseFlour)}</dd>
                  </div>
                  <div>
                    <dt>Batch cost</dt>
                    <dd>
                      {fmtMoney(s.totalCost, currency)}
                      {s.costIncomplete && '*'}
                    </dd>
                  </div>
                  {pieces ? (
                    <div>
                      <dt>Per {r.yieldLabel || 'piece'}</dt>
                      <dd>{fmtMoney(s.totalCost / pieces, currency)}</dd>
                    </div>
                  ) : null}
                  {totalMin > 0 && (
                    <div>
                      <dt>Time</dt>
                      <dd>{fmtMinutes(totalMin)}</dd>
                    </div>
                  )}
                </dl>
              </a>
            )
          })}
        </div>
      )}
    </>
  )
}
