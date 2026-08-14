import { formatGp } from '@521studios/pfsrd2-display'
import { treasureBudget, TREASURE_BANDS, BAND_LABELS, BASE_PARTY } from '../pf2eRules.js'

// The encounter's treasure-vs-budget panel: presents the computed budget (from
// useEncounterBudget — treasure value + difficulty band) against the Table 5-3
// row for the effective party level, with the computed band highlighted and the
// loot marked over/under its target. Fetching lives in the hook so the difficulty
// badge on the title can share it.
export default function TreasureBudget({ budget, partyLevel, partySize }) {
  const { cp, xp, threat, canonicalThreat, xpPer4, loading, unpricedCount, unknownCount, failedCount, onRetry } = budget

  // The total is a floor whenever some lines couldn't be valued (still loading, a
  // failed fetch, or a genuinely unpriceable derived/"Varies" item).
  const incomplete = loading || failedCount > 0 || unpricedCount > 0 || unknownCount > 0

  const target = treasureBudget(partyLevel, threat, partySize) // null for a Trivial encounter
  // "Over" is safe on a floor (true value ≥ the shown floor); "under" is only
  // knowable once the value is complete — so we never claim under on a floor.
  const meetsTarget = target != null && cp >= target * 100
  const knownUnder = target != null && !meetsTarget && !incomplete

  return (
    <section className="treasure-budget" data-testid="treasure-budget">
      <h3 className="budget-title">Budget — party level {partyLevel}, {partySize} PCs</h3>
      <p className="budget-summary">
        Difficulty <strong data-testid="encounter-threat">{BAND_LABELS[threat]}</strong>
        {' '}({xp} XP) · Treasure <strong data-testid="treasure-value">{formatGp(cp)}</strong>
        {incomplete && cp > 0 ? ' (floor)' : ''}
        {target != null && (
          <span data-testid="treasure-delta">
            {' — '}
            {meetsTarget
              ? `${formatGp(cp - target * 100)} over the ${BAND_LABELS[threat]} target (${formatGp(target * 100)})`
              : knownUnder
                ? `${formatGp(target * 100 - cp)} under the ${BAND_LABELS[threat]} target (${formatGp(target * 100)})`
                : `${BAND_LABELS[threat]} target ${formatGp(target * 100)} not yet met (value is a floor)`}
          </span>
        )}
      </p>

      {/* Canonical lens (only when the table isn't the 4-PC standard): the same
          roster's band at 4 PCs — directly comparable to a module's printed band —
          plus the party-size–normalized XP. Lets a GM see whether a fight that reads
          e.g. Trivial for their 6 is a Low the book intended for 4. */}
      {partySize !== BASE_PARTY && (
        <p className="budget-canonical" data-testid="budget-canonical">
          At {BASE_PARTY} PCs (book standard):{' '}
          <strong data-testid="canonical-threat">{BAND_LABELS[canonicalThreat]}</strong>
          {' · '}~{xpPer4} XP for a {BASE_PARTY}-PC party
        </p>
      )}

      <div className="chart-scroll">
        <table className="treasure-chart">
          <thead>
            <tr>
              <th scope="col">Level {partyLevel} target</th>
              {TREASURE_BANDS.map((b) => (
                <th key={b} scope="col" data-active={b === threat || undefined}>{BAND_LABELS[b]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">gp</th>
              {TREASURE_BANDS.map((b) => {
                const t = treasureBudget(partyLevel, b, partySize)
                const active = b === threat
                return (
                  <td
                    key={b}
                    className={active ? 'chart-band chart-band--active' : 'chart-band'}
                    data-band={b}
                    data-active={active || undefined}
                  >
                    {t}
                    {active && (meetsTarget ? ' ✓' : knownUnder ? ' ▲' : '')}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {failedCount > 0 && (
        <p className="error budget-error" role="alert" data-testid="budget-error">
          {failedCount} entr{failedCount > 1 ? 'ies' : 'y'} failed to load — the budget may be incomplete.{' '}
          <button type="button" className="link" onClick={onRetry}>Retry</button>
        </p>
      )}
      {loading && <p className="muted">Loading entries…</p>}
      {(unpricedCount > 0 || unknownCount > 0) && (
        <p className="muted budget-flags" data-testid="budget-flags">
          {unpricedCount > 0 &&
            `${unpricedCount} treasure line${unpricedCount > 1 ? 's' : ''} not valued (runed/derived, “Varies”, or unloaded) — total is a floor. `}
          {unknownCount > 0 &&
            `${unknownCount} monster${unknownCount > 1 ? 's have' : ' has'} no readable level (XP may be low).`}
        </p>
      )}
    </section>
  )
}
