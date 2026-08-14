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

  // Canonical lens for comparing against a published module, whose printed band
  // assumes the 4-PC standard: the same roster's band read at 4 PCs, plus the
  // party-size–normalized ("4-PC-equivalent") XP that GMs track by hand. Only
  // meaningful when the table isn't already 4 (the panel/badge show them then), and
  // they let a GM tell "under-tuned for my larger table" from "the book's own band".
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
