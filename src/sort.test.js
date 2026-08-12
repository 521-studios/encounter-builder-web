import { test } from 'node:test'
import assert from 'node:assert/strict'
import { naturalCompare, naturalSort } from './sort.js'

test('numeric runs sort by value, not lexically (1..15)', () => {
  const input = ['10', '2', '1', '15', '3', '11']
  assert.deepEqual([...input].sort(naturalCompare), ['1', '2', '3', '10', '11', '15'])
})

test('prefixed numeric runs sort by value (B1..B15)', () => {
  const input = ['B10', 'B2', 'B1', 'B15', 'B3']
  assert.deepEqual([...input].sort(naturalCompare), ['B1', 'B2', 'B3', 'B10', 'B15'])
})

test('the canonical mixed case: 1..15 AND B1..B15 both order correctly', () => {
  // The exact requirement from the ticket — plain numbers before lettered ones,
  // each group in numeric (not string) order.
  const input = ['B2', '11', 'B10', '2', 'B1', '1', '10']
  assert.deepEqual(naturalSort(input), ['1', '2', '10', '11', 'B1', 'B2', 'B10'])
})

test('naturalSort keys into objects and does not mutate the input', () => {
  const items = [{ name: 'Room 10' }, { name: 'Room 2' }, { name: 'Room 1' }]
  const sorted = naturalSort(items, (x) => x.name)
  assert.deepEqual(sorted.map((x) => x.name), ['Room 1', 'Room 2', 'Room 10'])
  // original order preserved (non-mutating)
  assert.deepEqual(items.map((x) => x.name), ['Room 10', 'Room 2', 'Room 1'])
})

test('naturalCompare coerces non-strings and is case-insensitive on the base letter', () => {
  assert.equal(naturalCompare(2, 10) < 0, true)
  assert.equal(naturalCompare('a1', 'A1'), 0)
})
