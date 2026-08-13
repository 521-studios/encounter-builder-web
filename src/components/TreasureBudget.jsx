import { useEffect, useRef, useState } from 'react'
import { formatGp } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { treasureValueCp, encounterXp, gameIdsInEncounter } from '../budget.js'
import { encounterThreat, treasureBudget, TREASURE_BANDS } from '../pf2eRules.js'

const BAND_LABEL = { low: 'Low', moderate: 'Moderate', severe: 'Severe', extreme: 'Extreme', trivial: 'Trivial' }

// The encounter's treasure-vs-budget panel: fetches the referenced item/creature
// entries, sums the treasure value + computes the difficulty band from monster
// XP, and shows the Table 5-3 row for the effective party level with the computed
// band highlighted and the loot marked over/under its target.
export default function TreasureBudget({ encounter, partyLevel, partySize }) {
  const cache = useRef({}) // gameId -> entry (successful fetches only)
  const failed = useRef(new Set()) // gameIds whose fetch errored (kept out of cache)
  const [, setTick] = useState(0) // bump to re-render when fetches land
  const [retry, setRetry] = useState(0) // bump to re-attempt failed fetches

  const ids = gameIdsInEncounter(encounter)
  const idsKey = ids.slice().sort().join(',')

  useEffect(() => {
    let alive = true
    const missing = ids.filter((g) => !(g in cache.current) && !failed.current.has(g))
    if (!missing.length) return
    Promise.all(
      missing.map((g) => pfsrd2.entryFull(g).then((e) => ({ g, e })).catch(() => ({ g, err: true }))),
    ).then((results) => {
      if (!alive) return
      for (const r of results) {
        if (r.err) failed.current.add(r.g)
        else {
          cache.current[r.g] = r.e
          failed.current.delete(r.g)
        }
      }
      setTick((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, retry])

  const entryOf = (g) => cache.current[g] || null
  const { cp, unpriced } = treasureValueCp(encounter.treasure, encounter.currency, entryOf)
  const { xp, unknown } = encounterXp(encounter.monsters, partyLevel, entryOf)
  const threat = encounterThreat(xp, partySize)

  const loading = ids.some((g) => !(g in cache.current) && !failed.current.has(g))
  const failedCount = ids.filter((g) => failed.current.has(g)).length
  // The total is a floor whenever some lines couldn't be valued (still loading, a
  // failed fetch, or a genuinely unpriceable derived/"Varies" item).
  const incomplete = loading || failedCount > 0 || unpriced.length > 0 || unknown.length > 0

  const target = treasureBudget(partyLevel, threat, partySize) // null for a Trivial encounter
  // "Over" is safe on a floor (true value ≥ the shown floor); "under" is only
  // knowable once the value is complete — so we never claim under on a floor.
  const meetsTarget = target != null && cp >= target * 100
  const knownUnder = target != null && !meetsTarget && !incomplete

  return (
    <section className="treasure-budget" data-testid="treasure-budget">
      <h3 className="budget-title">Budget — party level {partyLevel}, {partySize} PCs</h3>
      <p className="budget-summary">
        Difficulty <strong data-testid="encounter-threat">{BAND_LABEL[threat]}</strong>
        {' '}({xp} XP) · Treasure <strong data-testid="treasure-value">{formatGp(cp)}</strong>
        {incomplete && cp > 0 ? ' (floor)' : ''}
        {target != null && (
          <span data-testid="treasure-delta">
            {' — '}
            {meetsTarget
              ? `${formatGp(cp - target * 100)} over the ${BAND_LABEL[threat]} target (${formatGp(target * 100)})`
              : knownUnder
                ? `${formatGp(target * 100 - cp)} under the ${BAND_LABEL[threat]} target (${formatGp(target * 100)})`
                : `${BAND_LABEL[threat]} target ${formatGp(target * 100)} not yet met (value is a floor)`}
          </span>
        )}
      </p>

      <div className="chart-scroll">
        <table className="treasure-chart">
          <thead>
            <tr>
              <th scope="col">Level {partyLevel} target</th>
              {TREASURE_BANDS.map((b) => (
                <th key={b} scope="col" data-active={b === threat || undefined}>{BAND_LABEL[b]}</th>
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
          <button type="button" className="link" onClick={() => { failed.current.clear(); setRetry((n) => n + 1) }}>
            Retry
          </button>
        </p>
      )}
      {loading && <p className="muted">Loading entries…</p>}
      {(unpriced.length > 0 || unknown.length > 0) && (
        <p className="muted budget-flags" data-testid="budget-flags">
          {unpriced.length > 0 &&
            `${unpriced.length} treasure line${unpriced.length > 1 ? 's' : ''} not valued (runed/derived, “Varies”, or unloaded) — total is a floor. `}
          {unknown.length > 0 &&
            `${unknown.length} monster${unknown.length > 1 ? 's have' : ' has'} no readable level (XP may be low).`}
        </p>
      )}
    </section>
  )
}
