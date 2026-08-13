import { useEffect, useRef, useState } from 'react'
import { pfsrd2 } from './api/pfsrd2.js'

// useEntries fetches + caches pfsrd2 full entries for a set of game_ids and
// returns entryOf(gameId), a loading flag, a failed-fetch count, and a retry.
// A game_id referenced by several encounters (a rollup) or reused across renders
// is fetched once; failed fetches are tracked separately and retried on demand.
export function useEntries(ids) {
  const cache = useRef({}) // gameId -> entry (successful fetches only)
  const failed = useRef(new Set()) // gameIds whose fetch errored (kept out of cache)
  const [, setTick] = useState(0) // bump to re-render when fetches land
  const [retry, setRetry] = useState(0) // bump to re-attempt failed fetches

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

  return {
    entryOf: (g) => cache.current[g] || null,
    loading: ids.some((g) => !(g in cache.current) && !failed.current.has(g)),
    failedCount: ids.filter((g) => failed.current.has(g)).length,
    onRetry: () => {
      failed.current.clear()
      setRetry((n) => n + 1)
    },
  }
}
