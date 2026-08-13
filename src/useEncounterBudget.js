import { useEffect, useRef, useState } from 'react'
import { pfsrd2 } from './api/pfsrd2.js'
import { treasureValueCp, encounterXp, gameIdsInEncounter } from './budget.js'
import { encounterThreat } from './pf2eRules.js'

// useEncounterBudget fetches the item/creature entries an encounter references
// and computes its treasure value (copper) + difficulty (XP → threat band)
// against a party level/size. Shared by the difficulty badge on the encounter
// title and the full budget panel, so the entries are fetched once. Failed
// fetches are tracked separately from data flags and can be retried.
export function useEncounterBudget(encounter, partyLevel, partySize) {
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

  // Incompleteness is reported as uniform counts: unpricedCount (treasure lines
  // that couldn't be valued), unknownCount (monsters with no readable level),
  // failedCount (entry fetches that errored). The consumer only needs the counts.
  return {
    cp,
    xp,
    threat,
    loading,
    unpricedCount: unpriced.length,
    unknownCount: unknown.length,
    failedCount,
    onRetry: () => {
      failed.current.clear()
      setRetry((n) => n + 1)
    },
  }
}
