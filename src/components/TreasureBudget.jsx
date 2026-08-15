import { formatGp } from '@521studios/pfsrd2-display'
import { treasureBudget, TREASURE_BANDS, BAND_LABELS, BASE_PARTY } from '../pf2eRules.js'
import { isCombatRoom, ROOM_TYPE_LABELS } from '../model.js'

// The encounter's treasure-vs-budget panel: presents the computed budget (from
// useEncounterBudget — treasure value + difficulty band) against the Table 5-3
// row for the effective party level, with the computed band highlighted and the
// loot marked over/under its target. Fetching lives in the hook so the difficulty
// badge on the title can share it.
export default function TreasureBudget({ budget, partyLevel, partySize }) {
  const { cp, xp, awardXp = 0, totalXp = xp, roomType = 'combat', threat, canonicalThreat, xpPer4, loading, unpricedCount, unknownCount, failedCount, onRetry } = budget

  // Non-combat rooms (hazard/haunt/social/knowledge/…) have no meaningful combat
  // difficulty band or treasure target — the panel drops the band, the Table 5-3
  // chart, and the canonical lens, and just shows the room type + any loot/XP.
  const combat = isCombatRoom(roomType)

  // The treasure total is a floor whenever some lines couldn't be valued (still
  // loading, a failed fetch, or a genuinely unpriceable derived/"Varies" item).
  const incomplete = loading || failedCount > 0 || unpricedCount > 0 || unknownCount > 0
  // The XP (and thus both bands + the normalized figure) is a floor only when
  // monster XP itself is incomplete — an unpriced treasure line doesn't affect it.
  const xpIncomplete = loading || failedCount > 0 || unknownCount > 0

  const target = treasureBudget(partyLevel, threat, partySize) // null for a Trivial encounter
  // "Over" is safe on a floor (true value ≥ the shown floor); "under" is only
  // knowable once the value is complete — so we never claim under on a floor.
  const meetsTarget = target != null && cp >= target * 100
  const knownUnder = target != null && !meetsTarget && !incomplete

  return (
    <section className="treasure-budget" data-testid="treasure-budget">
      <h3 className="budget-title">Budget — party level {partyLevel}, {partySize} PCs</h3>
      <p className="budget-summary">
        {combat ? (
          <>
            Difficulty <strong data-testid="encounter-threat">{BAND_LABELS[threat]}</strong>
            {' '}({xp} XP)
          </>
        ) : (
          <>
            Room <strong data-testid="room-type">{ROOM_TYPE_LABELS[roomType] || roomType}</strong>
            {totalXp > 0 ? ` (${totalXp} XP)` : ''}
          </>
        )}
        {combat && awardXp > 0 && (
          <span data-testid="award-xp"> + {awardXp} non-combat = {totalXp} XP total</span>
        )}
        {' · '}Treasure <strong data-testid="treasure-value">{formatGp(cp)}</strong>
        {incomplete && cp > 0 ? ' (floor)' : ''}
        {combat && target != null && (
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

      {/* Canonical lens (only when the table isn't the 4-PC standard). Two DIFFERENT
          normalizations, deliberately shown as distinct metrics (not one figure):
          the difficulty BAND is the same roster read at 4-PC thresholds — directly
          comparable to a module's printed band (e.g. a fight that's Trivial for your
          6 is a Low the book intended for 4); the XP AWARD is the raw XP rescaled to
          a 4-PC budget (difficulty-preserving), the number GMs track by hand. Their
          implied bands can differ — they answer different questions. */}
      {combat && partySize !== BASE_PARTY && (
        <p className="budget-canonical" data-testid="budget-canonical">
          At {BASE_PARTY} PCs (book standard): difficulty{' '}
          <strong data-testid="canonical-threat">{BAND_LABELS[canonicalThreat]}</strong>
          {xpIncomplete && xp > 0 ? ' (floor)' : ''}
          {' · '}~{xpPer4} XP award (party-size–normalized)
        </p>
      )}

      {combat && (
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
      )}

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
