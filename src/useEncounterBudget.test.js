import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { renderHook, cleanup } from '@testing-library/react'
import { useEncounterBudget } from './useEncounterBudget.js'

afterEach(() => cleanup())

// An encounter with no monsters/treasure references no entries, so useEntries fires
// zero fetches — the hook resolves synchronously and we can assert its derivations
// without a network. Awards advance the party's XP (awardXp/totalXp) but leave the
// combat XP and difficulty band untouched.
test('useEncounterBudget exposes awardXp + totalXp; combat xp/threat ignore awards', () => {
  const enc = { monsters: [], treasure: [], currency: {}, xp_awards: [{ amount: 30 }, { amount: 15 }] }
  const { result } = renderHook(() => useEncounterBudget(enc, 5, 4))

  assert.equal(result.current.xp, 0) // no creatures → 0 combat XP
  assert.equal(result.current.awardXp, 45) // 30 + 15 non-combat
  assert.equal(result.current.totalXp, 45) // combat + awards
  assert.equal(result.current.threat, 'trivial') // 0 combat XP → Trivial; awards don't shift it
})

test('useEncounterBudget: awardXp is 0 (and totalXp == xp) when there are no awards', () => {
  const enc = { monsters: [], treasure: [], currency: {} }
  const { result } = renderHook(() => useEncounterBudget(enc, 5, 4))
  assert.equal(result.current.awardXp, 0)
  assert.equal(result.current.totalXp, result.current.xp)
})
