import { useEntries } from './useEntries.js'
import { treasureValueCp, encounterXp, gameIdsInEncounter } from './budget.js'
import { encounterThreat, BASE_PARTY } from './pf2eRules.js'

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

  // Canonical lens for comparing against a published module (whose printed band
  // assumes the 4-PC standard). TWO DISTINCT normalizations — the panel shows them
  // as separate metrics, not one figure:
  //   canonicalThreat — the same (size-independent) raw XP classified at 4-PC
  //     thresholds: this roster's difficulty BAND for a 4-PC party, directly
  //     comparable to a module's printed band. Roster-fixed.
  //   xpPer4 — the raw XP rescaled to a 4-PC budget ("4-PC-equivalent" award), the
  //     number GMs track by hand. Difficulty-preserving, so its own implied band
  //     tracks the AS-CONFIGURED band, not canonicalThreat.
  // They answer different questions and their implied bands can differ; only shown
  // when the table isn't already 4 PCs.
  const canonicalThreat = encounterThreat(xp, BASE_PARTY)
  const xpPer4 = partySize ? Math.round((xp * BASE_PARTY) / partySize) : xp

  return {
    entryOf, // shared with the monster lines so each creature's entry is fetched once
    cp,
    xp,
    threat,
    canonicalThreat,
    xpPer4,
    loading,
    unpricedCount: unpriced.length,
    unknownCount: unknown.length,
    failedCount,
    onRetry,
  }
}
