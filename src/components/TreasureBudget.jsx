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
  const cache = useRef({}) // gameId -> entry (or null if the fetch failed)
  const [, setTick] = useState(0) // bump to re-render when fetches land

  const ids = gameIdsInEncounter(encounter)
  const idsKey = ids.slice().sort().join(',')

  useEffect(() => {
    let alive = true
    const missing = ids.filter((g) => !(g in cache.current))
    if (!missing.length) return
    Promise.all(
      missing.map((g) => pfsrd2.entryFull(g).then((e) => [g, e]).catch(() => [g, null])),
    ).then((pairs) => {
      if (!alive) return
      for (const [g, e] of pairs) cache.current[g] = e
      setTick((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  const entryOf = (g) => cache.current[g] || null
  const { cp, unpriced } = treasureValueCp(encounter.treasure, encounter.currency, entryOf)
  const { xp, unknown } = encounterXp(encounter.monsters, partyLevel, entryOf)
  const threat = encounterThreat(xp, partySize)
  const loading = ids.some((g) => !(g in cache.current))

  const targetGp = threat === 'trivial' ? null : treasureBudget(partyLevel, threat, partySize)
  const valueGp = cp / 100
  const delta = targetGp == null ? null : Math.round(valueGp - targetGp)

  return (
    <section className="treasure-budget" data-testid="treasure-budget">
      <h3 className="budget-title">Budget — party level {partyLevel}, {partySize} PCs</h3>
      <p className="budget-summary">
        Difficulty <strong data-testid="encounter-threat">{BAND_LABEL[threat]}</strong>
        {' '}({xp} XP) · Treasure <strong data-testid="treasure-value">{formatGp(cp)}</strong>
        {targetGp != null && (
          <span data-testid="treasure-delta">
            {' — '}
            {delta >= 0 ? `${formatGp(delta * 100)} over` : `${formatGp(-delta * 100)} under`} the{' '}
            {BAND_LABEL[threat]} target ({formatGp(targetGp * 100)})
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
                    {active && (cp >= t * 100 ? ' ✓' : ' ▲')}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {loading && <p className="muted">Loading entries…</p>}
      {(unpriced.length > 0 || unknown.length > 0) && (
        <p className="muted budget-flags" data-testid="budget-flags">
          {unpriced.length > 0 &&
            `${unpriced.length} treasure line${unpriced.length > 1 ? 's' : ''} need manual pricing (runed/derived or “Varies”) — total is a floor. `}
          {unknown.length > 0 &&
            `${unknown.length} monster${unknown.length > 1 ? 's have' : ' has'} no readable level (XP may be low).`}
        </p>
      )}
    </section>
  )
}
