import { test } from 'node:test'
import assert from 'node:assert/strict'
import { treasureValueCp, encounterXp, refGameId, gameIdsInEncounter } from './budget.js'

// Minimal fake entries keyed by game_id.
const ITEMS = {
  'Weapons:1': { stat_block: { price: { value: 100, currency: 'gp' } } }, // 10000 cp
  'Equipment:sp': { stat_block: { price: { value: 5, currency: 'sp' } } }, // 50 cp
  'Equipment:varies': { stat_block: { price: { value: null, text: '-' } } }, // Varies
}
const CREATURES = {
  'Monsters:goblin': { stat_block: { creature_type: { level: 1 } } },
  'Monsters:dragon': { stat_block: { creature_type: { level: 10 } } },
}
const entryOf = (id) => ITEMS[id] || CREATURES[id] || null

test('refGameId reads pristine and derived-base refs', () => {
  assert.equal(refGameId({ game_id: 'Weapons:1' }), 'Weapons:1')
  assert.equal(refGameId({ base: { game_id: 'Weapons:1' } }), 'Weapons:1')
  assert.equal(refGameId({}), '')
})

test('treasureValueCp sums coins + item prices × qty', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      { ref: { game_id: 'Weapons:1' }, qty: 2 }, // 2 × 10000 = 20000
      { ref: { game_id: 'Equipment:sp' }, qty: 3 }, // 3 × 50 = 150
    ],
    { gp: 5 }, // 500 cp
    entryOf,
  )
  assert.equal(cp, 20000 + 150 + 500)
  assert.equal(unpriced.length, 0)
})

test('treasureValueCp flags Varies / derived / missing lines as unpriced (not 0)', () => {
  const { cp, unpriced } = treasureValueCp(
    [
      { ref: { game_id: 'Equipment:varies' }, qty: 1 }, // Varies -> unpriced
      { ref: { base: { game_id: 'Weapons:1' }, modifications: [{}] }, qty: 1 }, // runed/derived
      { ref: { game_id: 'Weapons:missing' }, qty: 1 }, // entry not loaded
    ],
    {},
    entryOf,
  )
  assert.equal(cp, 0)
  assert.equal(unpriced.length, 3)
})

test('treasureValueCp skips destroyed loot', () => {
  const { cp } = treasureValueCp(
    [{ ref: { game_id: 'Weapons:1' }, qty: 1, state: 'destroyed' }],
    {},
    entryOf,
  )
  assert.equal(cp, 0)
})

test('encounterXp sums creature XP vs party level, honoring count + elite/weak', () => {
  const { xp, unknown } = encounterXp(
    [
      { ref: { game_id: 'Monsters:goblin' }, count: 4 }, // level 1 vs PL 5 = PL-4 = 10 each -> 40
      { ref: { game_id: 'Monsters:dragon' }, count: 1, adjustment: 'elite' }, // 10+1=11 vs 5 = PL+6 -> cap 160
    ],
    5,
    entryOf,
  )
  assert.equal(xp, 40 + 160)
  assert.equal(unknown.length, 0)
})

test('encounterXp flags monsters whose level cannot be read', () => {
  const { xp, unknown } = encounterXp([{ ref: { game_id: 'Monsters:missing' }, count: 1 }], 5, entryOf)
  assert.equal(xp, 0)
  assert.equal(unknown.length, 1)
})

test('gameIdsInEncounter dedupes and skips derived + destroyed', () => {
  const ids = gameIdsInEncounter({
    monsters: [
      { ref: { game_id: 'Monsters:goblin' } },
      { ref: { game_id: 'Monsters:goblin' } }, // dup
      { ref: { base: { game_id: 'Monsters:templated' }, modifications: [{}] } }, // derived -> skip
    ],
    treasure: [
      { ref: { game_id: 'Weapons:1' } },
      { ref: { game_id: 'Weapons:2' }, state: 'destroyed' }, // skip
    ],
  })
  assert.deepEqual(ids.sort(), ['Monsters:goblin', 'Weapons:1'])
})

import { rollupEncounters } from './budget.js'

test('rollupEncounters aggregates treasure vs summed per-encounter budgets + breakdown', () => {
  const items = { 'W:1': { stat_block: { price: { value: 100, currency: 'gp' } } } } // 10000 cp
  const creatures = { 'M:1': { stat_block: { creature_type: { level: 5 } } } } // PL creature
  const entryOf = (id) => items[id] || creatures[id] || null
  // Two encounters, both at party level 5 / 4 PCs.
  const partyFor = () => ({ level: 5, size: 4 })
  const encounters = [
    // 1 PL-creature (40 XP -> Trivial: no target) + 1 gp item worth 100 gp
    { id: 'e1', name: 'A', monsters: [{ ref: { game_id: 'M:1' }, count: 1 }], treasure: [{ ref: { game_id: 'W:1' }, qty: 1 }], currency: {} },
    // 3 PL-creatures (120 XP -> Severe; L5 severe target = 200 gp) + 20 gp coin
    { id: 'e2', name: 'B', monsters: [{ ref: { game_id: 'M:1' }, count: 3 }], treasure: [], currency: { gp: 20 } },
  ]
  const { totalCp, totalTargetCp, rows, anyIncomplete } = rollupEncounters(encounters, entryOf, partyFor)
  assert.equal(totalCp, 10000 + 2000) // 100 gp item + 20 gp coin
  assert.equal(rows.length, 2)
  assert.equal(rows[0].threat, 'trivial') // 40 XP
  assert.equal(rows[0].targetCp, 0) // trivial has no treasure target
  assert.equal(rows[1].threat, 'severe') // 120 XP
  assert.equal(rows[1].targetCp, 200 * 100) // L5 severe = 200 gp
  assert.equal(totalTargetCp, 0 + 200 * 100)
  assert.equal(anyIncomplete, false)
})

test('rollupEncounters flags incomplete rows (unpriced/unknown) and tolerates empty', () => {
  const entryOf = () => null // nothing loads
  const partyFor = () => ({ level: 3, size: 4 })
  const r = rollupEncounters(
    [{ id: 'e', name: 'X', monsters: [{ ref: { game_id: 'M:?' }, count: 1 }], treasure: [{ ref: { game_id: 'W:?' }, qty: 1 }], currency: {} }],
    entryOf,
    partyFor,
  )
  assert.equal(r.rows[0].incomplete, true)
  assert.equal(r.anyIncomplete, true)
  assert.deepEqual(rollupEncounters([], entryOf, partyFor), { totalCp: 0, totalTargetCp: 0, rows: [], anyIncomplete: false })
})

test('rollupEncounters resolves party per-encounter, not once for all rows', () => {
  const creatures = {
    'M:5': { stat_block: { creature_type: { level: 5 } } },
    'M:8': { stat_block: { creature_type: { level: 8 } } },
  }
  const entryOf = (id) => creatures[id] || null
  const seen = []
  // Two Severe encounters (3 party-level creatures each) but at different party
  // levels — so the Table 5-3 budget target differs. This is the whole point of
  // the slice (inheritance-driven budgeting): a regression that resolved party
  // once for all rows would fail both the per-encounter call log and the target.
  const partyFor = (enc) => {
    seen.push(enc.id)
    return enc.id === 'e1' ? { level: 5, size: 4 } : { level: 8, size: 4 }
  }
  const mk = (id, mon) => ({ id, name: id, monsters: [{ ref: { game_id: mon }, count: 3 }], treasure: [], currency: {} })
  const { rows } = rollupEncounters([mk('e1', 'M:5'), mk('e2', 'M:8')], entryOf, partyFor)
  assert.deepEqual(seen, ['e1', 'e2']) // called once per encounter, in order
  assert.equal(rows[0].threat, 'severe') // 3×PL at L5 = 120 XP
  assert.equal(rows[1].threat, 'severe') // 3×PL at L8 = 120 XP
  assert.notEqual(rows[0].targetCp, rows[1].targetCp) // same band, different level ⇒ different budget
  assert.ok(rows[0].targetCp > 0 && rows[1].targetCp > 0)
})
