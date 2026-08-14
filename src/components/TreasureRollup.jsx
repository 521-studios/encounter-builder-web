import { useState } from 'react'
import { formatGp } from '@521studios/pfsrd2-display'

// A treasure/XP rollup, always visible and collapsible by clicking its title
// (consistent with the rest of the app). Presentational: the `rollup` is computed
// by the caller's hook (useRollup for a chapter's per-encounter rows, or
// useChapterSummary for the campaign's per-chapter rows). `secondaryLabel` +
// `secondaryOf(row)` fill the second column (Difficulty band for encounters, XP
// for chapters); `referenceCp` (optional) is a "full level's treasure" figure.
export default function TreasureRollup({
  rollup,
  title,
  rowLabel = 'Encounter',
  secondaryLabel = 'Difficulty',
  secondaryOf,
  referenceCp,
  emptyLabel = 'No encounters yet.',
  loadError = false,
  onReload,
}) {
  const { totalCp, totalTargetCp, totalXp, rows, anyIncomplete, loading, failedCount, onRetry } = rollup
  const [collapsed, setCollapsed] = useState(false)
  const over = totalCp >= totalTargetCp
  const delta = Math.abs(totalCp - totalTargetCp)

  return (
    <section className="treasure-rollup" data-testid="treasure-rollup">
      <button
        type="button"
        className="budget-title summary-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="chapter-caret" aria-hidden="true">{collapsed ? '▸' : '▾'}</span> {title}
      </button>
      {collapsed ? null : loadError ? (
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
            {' · '}
            <strong data-testid="rollup-xp">{totalXp} XP</strong>
          </p>
          {referenceCp != null && (
            <p className="muted">For reference, a full level’s treasure is {formatGp(referenceCp)}.</p>
          )}
          <div className="chart-scroll">
            <table className="treasure-chart rollup-table">
              <thead>
                <tr>
                  <th scope="col">{rowLabel}</th>
                  <th scope="col">{secondaryLabel}</th>
                  <th scope="col">Treasure</th>
                  <th scope="col">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    <td>{secondaryOf(r)}</td>
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
      {!collapsed && loading && <p className="muted">Loading entries…</p>}
      {!collapsed && failedCount > 0 && (
        <p className="error budget-error" role="alert">
          {failedCount} entr{failedCount > 1 ? 'ies' : 'y'} failed to load.{' '}
          <button type="button" className="link" onClick={onRetry}>Retry</button>
        </p>
      )}
    </section>
  )
}
