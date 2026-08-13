import { useEntries } from './useEntries.js'
import { treasureValueCp, encounterXp, gameIdsInEncounter } from './budget.js'
import { encounterThreat } from './pf2eRules.js'

// useEncounterBudget computes an encounter's treasure value (copper) + difficulty
// (XP → threat band) against a party level/size, fetching the referenced entries
// via the shared useEntries hook. Used by the difficulty badge on the title and
// the full budget panel, so the entries are fetched once. Incompleteness is
// reported as uniform counts (unpricedCount / unknownCount / failedCount).
export function useEncounterBudget(encounter, partyLevel, partySize) {
  const ids = gameIdsInEncounter(encounter)
  const { entryOf, loading, failedCount, onRetry } = useEntries(ids)

  const { cp, unpriced } = treasureValueCp(encounter.treasure, encounter.currency, entryOf)
  const { xp, unknown } = encounterXp(encounter.monsters, partyLevel, entryOf)
  const threat = encounterThreat(xp, partySize)

  return {
    entryOf, // shared with the monster lines so each creature's entry is fetched once
    cp,
    xp,
    threat,
    loading,
    unpricedCount: unpriced.length,
    unknownCount: unknown.length,
    failedCount,
    onRetry,
  }
}
