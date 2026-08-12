import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupEncountersByChapter, nextChapterOrder, ensureUnsortedGroup } from './chapters.js'

const chapters = [
  { id: 'c1', name: 'Chapter 1', order: 1 },
  { id: 'c2', name: 'Chapter 2', order: 2 },
]

test('groups encounters under their chapter, natural-sorted within each', () => {
  const encounters = [
    { id: 'e2', name: 'Room 10', chapter_id: 'c1' },
    { id: 'e1', name: 'Room 2', chapter_id: 'c1' },
    { id: 'e3', name: 'B1', chapter_id: 'c2' },
  ]
  const groups = groupEncountersByChapter(chapters, encounters)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].chapter.id, 'c1')
  // natural sort: Room 2 before Room 10 (not lexical)
  assert.deepEqual(groups[0].encounters.map((e) => e.name), ['Room 2', 'Room 10'])
  assert.equal(groups[1].chapter.id, 'c2')
})

test('empty chapters still render; no Unsorted group when everything is assigned', () => {
  const groups = groupEncountersByChapter(chapters, [{ id: 'e1', name: 'A', chapter_id: 'c1' }])
  assert.equal(groups.length, 2) // both chapters present
  assert.equal(groups[1].encounters.length, 0) // c2 is empty but shown
  assert.ok(groups.every((g) => g.chapter !== null)) // no Unsorted
})

test('chapterless AND dangling-chapter encounters fall into a last Unsorted group', () => {
  const encounters = [
    { id: 'e1', name: 'No chapter', chapter_id: '' },
    { id: 'e2', name: 'Deleted chapter', chapter_id: 'c-gone' }, // not in `chapters`
    { id: 'e3', name: 'Assigned', chapter_id: 'c1' },
  ]
  const groups = groupEncountersByChapter(chapters, encounters)
  const unsorted = groups[groups.length - 1]
  assert.equal(unsorted.chapter, null)
  assert.deepEqual(unsorted.encounters.map((e) => e.name).sort(), ['Deleted chapter', 'No chapter'])
})

test('nextChapterOrder returns max order + 1 (1 for an empty list)', () => {
  assert.equal(nextChapterOrder([]), 1)
  assert.equal(nextChapterOrder(chapters), 3)
  assert.equal(nextChapterOrder([{ order: 5 }, { order: 2 }]), 6)
})

test('ensureUnsortedGroup appends an empty Unsorted group only when absent', () => {
  const withUnsorted = [
    { chapter: { id: 'c1', name: 'C1' }, encounters: [] },
    { chapter: null, encounters: [{ id: 'e1' }] },
  ]
  // already has an Unsorted group → returned unchanged (same reference)
  assert.equal(ensureUnsortedGroup(withUnsorted), withUnsorted)

  const noUnsorted = [{ chapter: { id: 'c1', name: 'C1' }, encounters: [{ id: 'e1' }] }]
  const out = ensureUnsortedGroup(noUnsorted)
  assert.equal(out.length, 2)
  assert.equal(out[1].chapter, null) // appended, empty, last
  assert.deepEqual(out[1].encounters, [])
  // exactly one Unsorted group (no duplicates)
  assert.equal(out.filter((g) => g.chapter === null).length, 1)
})
