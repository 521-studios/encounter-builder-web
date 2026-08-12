import { naturalSort } from './sort.js'

export const UNSORTED = '__unsorted__'

// Group encounters under their chapter for the sidebar tree. Chapters keep their
// server order (Order, then Name); each chapter's encounters are natural-sorted by
// name (so 1..15 and B1..B15 read correctly). Encounters whose chapter_id is empty
// OR dangling (chapter was deleted) fall into a synthetic "Unsorted" group, shown
// last — and only when non-empty. Empty chapters still render (first-class).
export function groupEncountersByChapter(chapters, encounters) {
  const known = new Set(chapters.map((c) => c.id))
  const buckets = new Map()
  for (const e of encounters) {
    const key = e.chapter_id && known.has(e.chapter_id) ? e.chapter_id : UNSORTED
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(e)
  }
  const groups = chapters.map((c) => ({
    chapter: c,
    encounters: naturalSort(buckets.get(c.id) || [], (e) => e.name),
  }))
  const unsorted = buckets.get(UNSORTED)
  if (unsorted && unsorted.length > 0) {
    groups.push({ chapter: null, encounters: naturalSort(unsorted, (e) => e.name) })
  }
  return groups
}

// The order to give a new chapter so it lands at the end (max existing + 1).
export function nextChapterOrder(chapters) {
  return chapters.reduce((max, c) => Math.max(max, c.order ?? 0), 0) + 1
}

// Ensure an Unsorted group is present (empty if needed) so it's ALWAYS a
// drag-and-drop target — groupEncountersByChapter only emits one when non-empty,
// but you must be able to drag an encounter out of every chapter into Unsorted.
export function ensureUnsortedGroup(groups) {
  return groups.some((g) => g.chapter === null)
    ? groups
    : [...groups, { chapter: null, encounters: [] }]
}
