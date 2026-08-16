import { useEntries } from './useEntries.js'
import { treasureValueCp, encounterXp, hazardXp, awardXp, gameIdsInEncounter } from './budget.js'
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
  const { xp: mXp, unknown: mUnknown } = encounterXp(encounter.monsters, partyLevel, entryOf)
  const { xp: hXp, unknown: hUnknown } = hazardXp(encounter.hazards, partyLevel, entryOf)
  const xp = mXp + hXp
  const unknown = [...mUnknown, ...hUnknown]
  const threat = encounterThreat(xp, partySize)
  // Non-combat XP awards advance the party (added to the total XP the GM tracks)
  // but never shift the combat difficulty band or treasure budget above.
  const award = awardXp(encounter)

  // Canonical lens for comparing against a published module (whose printed band
  // assumes the 4-PC standard). TWO DISTINCT normalizations — the panel shows them
  // as separate metrics, not one figure:
  //   canonicalThreat — the same (size-independent) raw XP classified at 4-PC
  //     thresholds: this roster's difficulty BAND for a 4-PC party, directly
  //     comparable to a module's printed band. Roster-fixed.
  //   xpPer4 — the raw XP rescaled to a 4-PC budget ("4-PC-equivalent" award), the
  //     number GMs track by hand. A linear rescale (the band budget is instead
  //     additive per PC), so its own implied band roughly follows the as-configured
  //     band but diverges at the Low/Trivial edge — it's shown only as an XP figure,
  //     never re-classified into a band.
  // The two answer different questions and their implied bands can differ; only
  // shown when the table isn't already 4 PCs.
  const canonicalThreat = encounterThreat(xp, BASE_PARTY)
  const xpPer4 = partySize ? Math.round((xp * BASE_PARTY) / partySize) : xp

  return {
    entryOf, // shared with the monster lines so each creature's entry is fetched once
    cp,
    xp,
    awardXp: award,
    totalXp: xp + award, // advancement XP: combat + non-combat awards
    roomType: encounter.room_type || 'combat', // non-combat rooms suppress the band below
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
