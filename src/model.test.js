import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyed, withKey, stripKey, emptyMonster, emptyTreasure, toEncounterInput, hasRef, buildInput } from './model.js'

test('keyed stamps a _key on every monster and treasure line', () => {
  const out = keyed({
    name: 'x',
    monsters: [{ ref: { game_id: 'g' }, count: 1 }, { ref: { game_id: 'h' }, count: 2 }],
    treasure: [{ ref: { game_id: 't' }, qty: 1 }],
  })
  assert.equal(out.name, 'x')
  assert.ok(out.monsters.every((m) => typeof m._key === 'string' && m._key.length > 0))
  assert.ok(out.treasure.every((t) => typeof t._key === 'string' && t._key.length > 0))
  // keys are distinct
  const keys = [...out.monsters, ...out.treasure].map((l) => l._key)
  assert.equal(new Set(keys).size, keys.length)
})

test('keyed tolerates missing monsters/treasure arrays', () => {
  const out = keyed({ name: 'x' })
  assert.deepEqual(out.monsters, [])
  assert.deepEqual(out.treasure, [])
})

test('stripKey(withKey(x)) removes only _key and preserves the rest incl. nested ref', () => {
  const line = { ref: { game_id: 'g' }, count: 3, adjustment: 'elite', nickname: 'boss' }
  const roundTripped = stripKey(withKey(line))
  assert.deepEqual(roundTripped, line) // _key added then stripped; nothing else changed
  assert.equal(roundTripped._key, undefined)
})

test('emptyMonster/emptyTreasure carry a _key that strips cleanly', () => {
  assert.ok(emptyMonster()._key)
  assert.ok(emptyTreasure()._key)
  assert.equal(stripKey(emptyMonster())._key, undefined)
  assert.equal(stripKey(emptyMonster()).ref.game_id, '')
})

test('toEncounterInput echoes every field for a full PUT, strips _key, keeps chapter_id', () => {
  const enc = keyed({
    id: 'e1',
    name: 'Ambush',
    chapter_id: 'ch-1',
    description: '# Scene',
    notes: 'gm note',
    status: 'draft',
    currency: { gp: 5 },
    monsters: [{ ref: { game_id: 'Monsters:1' }, count: 2, adjustment: 'none' }],
    treasure: [{ ref: { game_id: 'Weapons:1' }, qty: 1 }],
  })
  const input = toEncounterInput(enc)
  assert.equal(input.name, 'Ambush')
  assert.equal(input.chapter_id, 'ch-1')
  assert.equal(input.description, '# Scene')
  assert.equal(input.notes, 'gm note')
  assert.equal(input.status, 'draft')
  assert.deepEqual(input.currency, { gp: 5 })
  // lines are sent without the client-only _key
  assert.ok(input.monsters.every((m) => !('_key' in m)))
  assert.ok(input.treasure.every((t) => !('_key' in t)))
  assert.equal(input.monsters[0].ref.game_id, 'Monsters:1')
})

test('hasRef is true only when a line resolves to a game_id (direct or templated base)', () => {
  assert.equal(hasRef({ ref: { game_id: 'Monsters:1' } }), true)
  assert.equal(hasRef({ ref: { base: { game_id: 'Monsters:1' } } }), true) // templated
  assert.equal(hasRef({ ref: { game_id: '' } }), false) // freshly added, unfilled
  assert.equal(hasRef({ ref: {} }), false)
  assert.equal(hasRef({}), false)
  assert.equal(hasRef(undefined), false)
})

test('toEncounterInput drops half-filled rows (autosave fires mid-edit)', () => {
  // A GM clicks "+ monster"/"+ treasure" then autosave fires before they pick —
  // the empty rows must not reach the API (which 400s on an empty ref).
  const enc = keyed({
    name: 'WIP',
    monsters: [
      { ref: { game_id: 'Monsters:1' }, count: 1 },
      emptyMonster(), // unfilled — dropped
    ],
    treasure: [
      emptyTreasure(), // unfilled — dropped
      { ref: { game_id: 'Weapons:1' }, qty: 1 },
    ],
  })
  const input = toEncounterInput(enc)
  assert.equal(input.monsters.length, 1)
  assert.equal(input.monsters[0].ref.game_id, 'Monsters:1')
  assert.equal(input.treasure.length, 1)
  assert.equal(input.treasure[0].ref.game_id, 'Weapons:1')
})

test('toEncounterInput keeps a templated (derived) monster whose ref carries base.game_id', () => {
  const enc = keyed({
    name: 'Elite',
    monsters: [{ ref: { base: { game_id: 'Monsters:1' } }, patches: [], count: 1 }],
  })
  const input = toEncounterInput(enc)
  assert.equal(input.monsters.length, 1)
  assert.equal(input.monsters[0].ref.base.game_id, 'Monsters:1')
})

test('buildInput keeps status for a draft (a normal save echoes it)', () => {
  const input = buildInput({ name: 'x', status: 'draft' })
  assert.equal(input.status, 'draft')
})

test('buildInput strips status for a released encounter (release is its own endpoint)', () => {
  // A regular save/move of a released encounter must not carry status, or the
  // PUT would move it — release owns that transition.
  const input = buildInput({ name: 'x', status: 'released' })
  assert.ok(!('status' in input))
})

test('toEncounterInput defaults chapter_id to "" (Unsorted) and omits absent status', () => {
  const input = toEncounterInput({ name: 'x' })
  assert.equal(input.chapter_id, '') // moving to Unsorted / no chapter
  assert.ok(!('status' in input)) // status omitted when the encounter has none
  assert.deepEqual(input.monsters, [])
  assert.deepEqual(input.treasure, [])
})

test('toEncounterInput echoes a party override when set, omits it when null (inherit)', () => {
  const withOverride = toEncounterInput(keyed({ name: 'x', party_level: 7, party_size: 5 }))
  assert.equal(withOverride.party_level, 7)
  assert.equal(withOverride.party_size, 5)

  // Omitting a nil override lets the full-replace PUT clear it back to inherit.
  const inheriting = toEncounterInput(keyed({ name: 'x' }))
  assert.ok(!('party_level' in inheriting))
  assert.ok(!('party_size' in inheriting))
})
