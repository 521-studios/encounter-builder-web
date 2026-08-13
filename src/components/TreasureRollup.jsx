import { formatGp } from '@521studios/pfsrd2-display'
import { BAND_LABELS } from '../pf2eRules.js'
import { useRollup } from '../useRollup.js'

// Treasure rollup: total loot across a set of encounters vs the summed
// per-encounter budget, with a per-encounter breakdown. Owns its fetch (via
// useRollup) so mounting it is what triggers the entry fetches — the detail
// pages render it only when the GM expands the rollup, keeping the settings page
// fast. `partyFor(encounter) -> {level, size}` resolves each encounter's party;
// `referenceCp` (optional, campaign page) is a "full level's treasure" figure.
export default function TreasureRollup({ encounters, partyFor, title, referenceCp, emptyLabel = 'No encounters yet.', loadError = false, onReload }) {
  const { totalCp, totalTargetCp, rows, anyIncomplete, loading, failedCount, onRetry } = useRollup(encounters, partyFor)
  const over = totalCp >= totalTargetCp
  const delta = Math.abs(totalCp - totalTargetCp)

  return (
    <section className="treasure-rollup" data-testid="treasure-rollup">
      <h3 className="budget-title">{title}</h3>
      {loadError ? (
        // The encounter list itself failed to load — don't render an empty
        // rollup that reads as "no treasure" (a silent lie); say so and offer a retry.
        <p className="error budget-error" role="alert" data-testid="rollup-load-error">
          Couldn’t load encounters for this rollup.{' '}
          {onReload && <button type="button" className="link" onClick={onReload}>Retry</button>}
        </p>
      ) : rows.length === 0 ? (
        <p className="muted" data-testid="rollup-empty">{emptyLabel}</p>
      ) : (
        <>
          <p className="budget-summary">
            Treasure <strong data-testid="rollup-total">{formatGp(totalCp)}</strong>
            {anyIncomplete ? ' (floor)' : ''}
            {' vs '}
            <strong>{formatGp(totalTargetCp)}</strong> budgeted
            {totalTargetCp > 0 && (
              <span data-testid="rollup-delta">{' — '}{formatGp(delta)} {over ? 'over' : 'under'}</span>
            )}
          </p>
          {referenceCp != null && (
            <p className="muted">For reference, a full level’s treasure is {formatGp(referenceCp)}.</p>
          )}
          <div className="chart-scroll">
            <table className="treasure-chart rollup-table">
              <thead>
                <tr>
                  <th scope="col">Encounter</th>
                  <th scope="col">Difficulty</th>
                  <th scope="col">Treasure</th>
                  <th scope="col">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td>{BAND_LABELS[r.threat]}</td>
                    <td>{formatGp(r.cp)}{r.incomplete ? '*' : ''}</td>
                    <td>{r.targetCp > 0 ? formatGp(r.targetCp) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anyIncomplete && (
            <p className="muted budget-flags">* value is a floor (some items need manual pricing or failed to load).</p>
          )}
        </>
      )}
      {loading && <p className="muted">Loading entries…</p>}
      {failedCount > 0 && (
        <p className="error budget-error" role="alert">
          {failedCount} entr{failedCount > 1 ? 'ies' : 'y'} failed to load.{' '}
          <button type="button" className="link" onClick={onRetry}>Retry</button>
        </p>
      )}
    </section>
  )
}
