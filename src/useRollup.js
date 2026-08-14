import { useEntries } from './useEntries.js'
import { rollupEncounters, rollupByChapter, gameIdsInEncounter } from './budget.js'

// useRollup fetches every entry referenced across a set of encounters (once,
// deduped) and aggregates them via rollupEncounters. `partyFor(encounter) ->
// {level, size}` resolves each encounter's effective party. Returns the rollup
// (totalCp, totalTargetCp, rows, anyIncomplete) plus the shared loading/failed/
// retry from the fetch.
export function useRollup(encounters, partyFor) {
  const list = encounters || []
  const ids = [...new Set(list.flatMap(gameIdsInEncounter))]
  const { entryOf, loading, failedCount, onRetry } = useEntries(ids)
  const rollup = rollupEncounters(list, entryOf, partyFor)
  return { ...rollup, loading, failedCount, onRetry }
}

// useChapterSummary is the campaign-level view: it fetches every entry across all
// campaign encounters (once, deduped) and aggregates BY CHAPTER via rollupByChapter
// — one row per chapter with summed treasure / target / XP.
export function useChapterSummary(chapters, encounters, partyFor) {
  const list = encounters || []
  const ids = [...new Set(list.flatMap(gameIdsInEncounter))]
  const { entryOf, loading, failedCount, onRetry } = useEntries(ids)
  const summary = rollupByChapter(chapters, list, entryOf, partyFor)
  return { ...summary, loading, failedCount, onRetry }
}
