import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildItemRef } from './itemRef.js'

test('an empty stack yields a pristine ref', () => {
  assert.deepEqual(buildItemRef('weapons:1', []), { game_id: 'weapons:1' })
  assert.deepEqual(buildItemRef('weapons:1', null), { game_id: 'weapons:1' })
})

test('a non-empty stack yields a derived ref with base, modifications (grade carried), and the last resolved json', () => {
  const stack = [
    { effect: { game_id: 'equipment:pot', name: 'Weapon Potency' }, grade: 2, item: { name: 'Rapier', v: 1 } },
    { effect: { game_id: 'equipment:strk', name: 'Striking' }, grade: null, item: { name: 'Rapier', v: 2 } },
  ]
  assert.deepEqual(buildItemRef('weapons:1', stack), {
    base: { game_id: 'weapons:1' },
    modifications: [
      { effect_game_id: 'equipment:pot', effect_name: 'Weapon Potency', grade: 2 },
      { effect_game_id: 'equipment:strk', effect_name: 'Striking', grade: null },
    ],
    json: { name: 'Rapier', v: 2 }, // the LAST resolved item is the snapshot
  })
})

test('a custom name overlays onto the resolved json without mutating it; blank name is ignored', () => {
  const last = { name: 'Rapier', stat_block: {} }
  const stack = [{ effect: { game_id: 'equipment:pot', name: 'Weapon Potency' }, grade: 2, item: last }]

  const named = buildItemRef('weapons:1', stack, '  Sting  ')
  assert.equal(named.json.name, 'Sting') // trimmed + overlaid
  assert.equal(last.name, 'Rapier') // original untouched

  const blank = buildItemRef('weapons:1', stack, '   ')
  assert.equal(blank.json.name, 'Rapier') // blank falls back to the resolved name
})

test('a grade of 0 or undefined normalizes to null in modifications', () => {
  const stack = [{ effect: { game_id: 'e:x', name: 'X' }, item: {} }] // no grade key
  assert.equal(buildItemRef('w:1', stack).modifications[0].grade, null)
})
