import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  keyed,
  withKey,
  stripKey,
  emptyMonster,
  emptyTreasure,
  toEncounterInput,
  hasRef,
  gameIdOf,
  buildInput,
  customTreasureRef,
  isCustomTreasure,
  hasTreasureContent,
  gpToCp,
  cpToGp,
  emptyPool,
  treasureLineInput,
  emptyAward,
  awardInput,
} from './model.js'

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

test('gameIdOf resolves a line to its game_id — direct, or a templated ref base', () => {
  assert.equal(gameIdOf({ ref: { game_id: 'Monsters:1' } }), 'Monsters:1')
  assert.equal(gameIdOf({ ref: { base: { game_id: 'Weapons:5' } } }), 'Weapons:5') // derived/templated
  assert.equal(gameIdOf({ ref: { game_id: 'Weapons:5', base: { game_id: 'other' } } }), 'Weapons:5') // direct wins
  assert.equal(gameIdOf({ ref: { game_id: '' } }), '') // freshly added, unfilled
  assert.equal(gameIdOf({ ref: {} }), '')
  assert.equal(gameIdOf({}), '')
  assert.equal(gameIdOf(undefined), '')
})

test('hasRef is true only when a line resolves to a game_id (direct or templated base)', () => {
  // hasRef is defined in terms of gameIdOf so persistence and rendering can't drift.
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

test('custom treasure: ref/detector/content helpers', () => {
  const ref = customTreasureRef('peridot bead', 200) // 2 gp
  assert.deepEqual(ref, { json: { name: 'peridot bead', value_cp: 200 } })
  assert.equal(isCustomTreasure({ ref }), true)
  assert.equal(isCustomTreasure({ ref: { game_id: 'Weapons:1' } }), false) // catalog
  assert.equal(isCustomTreasure({ ref: { base: { game_id: 'W:1' }, json: {} } }), false) // derived, not custom
  assert.equal(isCustomTreasure({ ref: { game_id: '' } }), false) // unfilled
  // gameIdOf/hasRef stay false for a custom line, but hasTreasureContent keeps it.
  assert.equal(gameIdOf({ ref }), '')
  assert.equal(hasRef({ ref }), false)
  assert.equal(hasTreasureContent({ ref }), true)
  assert.equal(hasTreasureContent({ ref: { game_id: 'Weapons:1' } }), true) // catalog
  assert.equal(hasTreasureContent({ ref: { game_id: '' } }), false) // unfilled → dropped
})

test('keyed materializes a default pool for treasure and adopts orphan lines', () => {
  const out = keyed({ treasure: [{ ref: { game_id: 't1' }, qty: 1 }, { ref: { game_id: 't2' }, qty: 1, pool_id: 'gone' }] })
  assert.equal(out.treasure_pools.length, 1) // one default pool
  const def = out.treasure_pools[0].id
  assert.ok(def) // has a stable id
  assert.equal(out.treasure[0].pool_id, def) // no pool_id → default
  assert.equal(out.treasure[1].pool_id, def) // dangling pool_id → default
})

test('keyed keeps existing pools and only adopts truly-orphaned lines', () => {
  const out = keyed({
    treasure_pools: [{ id: 'p1', name: 'altar' }],
    treasure: [{ ref: { game_id: 't1' }, qty: 1, pool_id: 'p1' }, { ref: { game_id: 't2' }, qty: 1 }],
  })
  assert.equal(out.treasure_pools.length, 1)
  assert.equal(out.treasure[0].pool_id, 'p1') // already assigned → unchanged
  assert.equal(out.treasure[1].pool_id, 'p1') // orphan adopts the (first/default) pool
})

test('keyed leaves a treasureless encounter pool-less', () => {
  assert.deepEqual(keyed({ treasure: [] }).treasure_pools, [])
})

test('keyed stamps a _key on every XP award; emptyAward strips cleanly', () => {
  const out = keyed({ xp_awards: [{ amount: 30, reason: 'ally' }] })
  assert.ok(out.xp_awards[0]._key)
  assert.deepEqual(stripKey(emptyAward()), { amount: 0, reason: '' })
})

test('awardInput coerces amount to a whole number, trims reason, drops _key', () => {
  assert.deepEqual(awardInput({ _key: 'k', amount: '30', reason: '  ally  ' }), { amount: 30, reason: 'ally' })
  // Fractional input is rounded — the API's Go int rejects a non-integer JSON number
  // outright, which would fail the whole PUT as an opaque "Save failed".
  assert.deepEqual(awardInput({ amount: 2.5 }), { amount: 3, reason: '' })
})

test('toEncounterInput sends valued XP awards and drops blank/zero-amount ones', () => {
  const enc = keyed({
    name: 'x',
    xp_awards: [
      { amount: 30, reason: 'gained Augrael' },
      { amount: 0, reason: 'typed then cleared' }, // no XP → dropped
      { amount: '', reason: '' }, // blank → dropped
    ],
  })
  const input = toEncounterInput(enc)
  assert.deepEqual(input.xp_awards, [{ amount: 30, reason: 'gained Augrael' }])
})

test('treasureLineInput strips _key and drops an empty value_tiers, keeps a set one', () => {
  // Empty tiers (all null) — the API rejects it, so it must not be sent.
  const empty = treasureLineInput({ _key: 'k', ref: { game_id: 'g' }, qty: 1, value_tiers: {} })
  assert.ok(!('_key' in empty))
  assert.ok(!('value_tiers' in empty))
  // One tier set → kept (with the pool_id and ref intact).
  const set = treasureLineInput({ _key: 'k', ref: { game_id: 'g' }, qty: 1, pool_id: 'p1', value_tiers: { success: 4000 } })
  assert.deepEqual(set, { ref: { game_id: 'g' }, qty: 1, pool_id: 'p1', value_tiers: { success: 4000 } })
})

test('emptyPool has a stable id and empty content', () => {
  const p = emptyPool('altar')
  assert.ok(typeof p.id === 'string' && p.id.length > 0)
  assert.equal(p.name, 'altar')
  assert.equal(p.description, '')
  assert.equal(p.gate, null)
})

test('toEncounterInput persists referenced/described pools, drops empty unused ones', () => {
  const enc = keyed({
    name: 'Loot',
    treasure_pools: [
      { id: 'p1', name: 'altar', description: '# hidden', gate: { skill: 'Perception', dc: 18 } },
      { id: 'p2', name: '', description: '', gate: null }, // empty + unused → dropped
      { id: 'p3', name: 'thief', description: '', gate: null }, // named → kept
    ],
    treasure: [{ ref: { game_id: 'Weapons:1' }, qty: 1, pool_id: 'p1' }],
  })
  const pools = toEncounterInput(enc).treasure_pools
  const ids = pools.map((p) => p.id)
  assert.ok(ids.includes('p1')) // referenced by a line
  assert.ok(ids.includes('p3')) // has a name
  assert.ok(!ids.includes('p2')) // empty + unused → dropped
  assert.deepEqual(
    pools.find((p) => p.id === 'p1').gate,
    { skill: 'Perception', dc: 18 },
  )
})

test('toEncounterInput drops an incomplete gate but keeps the pool on its other content', () => {
  const enc = keyed({
    name: 'x',
    treasure_pools: [
      { id: 'p1', name: 'altar', gate: { skill: 'Perception', dc: 0 } }, // dc<1 → gate dropped, pool kept (name)
      { id: 'p2', name: '', description: '', gate: { skill: '', dc: 5 } }, // only an incomplete gate → dropped
      { id: 'p3', name: '', description: '', gate: { skill: 'Perception', dc: 18 } }, // complete gate → kept
    ],
    treasure: [],
  })
  const pools = toEncounterInput(enc).treasure_pools
  const p1 = pools.find((p) => p.id === 'p1')
  assert.ok(p1 && p1.gate === undefined) // incomplete gate dropped, pool survives on its name
  assert.ok(!pools.some((p) => p.id === 'p2')) // pool whose only content is an incomplete gate → dropped
  assert.deepEqual(pools.find((p) => p.id === 'p3')?.gate, { skill: 'Perception', dc: 18 })
})

test('gpToCp/cpToGp: empty is null (unvalued), not 0 — the floor-vs-valued distinction', () => {
  // The crux of the floor logic: Number('') === 0, so '' must stay null (unvalued),
  // distinct from '0' (a valued 0-gp trophy).
  assert.equal(gpToCp(''), null) // cleared → unvalued (floors the total)
  assert.equal(gpToCp('0'), 0) // explicit zero → valued 0
  assert.equal(gpToCp('2'), 200)
  assert.equal(gpToCp('2.5'), 250)
  assert.ok(Number.isNaN(gpToCp('abc'))) // garbage → NaN (budget routes to unpriced)
  assert.equal(cpToGp(null), '') // unvalued → blank input
  assert.equal(cpToGp(0), 0) // valued 0 → shows 0, not blank
  assert.equal(cpToGp(200), 2)
})

test('hasTreasureContent drops a BLANK custom row but keeps one with a name or value', () => {
  // A freshly-added "+ custom item" (empty name, null value) must not persist as a
  // ghost row; content in either field keeps it.
  assert.equal(hasTreasureContent({ ref: customTreasureRef('', null) }), false) // blank → dropped
  assert.equal(hasTreasureContent({ ref: customTreasureRef('peridot', null) }), true) // name only
  assert.equal(hasTreasureContent({ ref: customTreasureRef('', 0) }), true) // value 0 (trophy)
  assert.equal(hasTreasureContent({ ref: customTreasureRef('  ', null) }), false) // whitespace name → dropped
  // isCustomTreasure still matches the blank row so it renders while being edited.
  assert.equal(isCustomTreasure({ ref: customTreasureRef('', null) }), true)
})

test('toEncounterInput keeps a custom (freeform) treasure line and strips _key', () => {
  const enc = keyed({
    name: 'Loot',
    treasure: [
      withKey({ ref: customTreasureRef('gold tooth', 400), qty: 1 }),
      emptyTreasure(), // unfilled → dropped
    ],
  })
  const input = toEncounterInput(enc)
  assert.equal(input.treasure.length, 1)
  assert.deepEqual(input.treasure[0].ref, { json: { name: 'gold tooth', value_cp: 400 } })
  assert.ok(!('_key' in input.treasure[0]))
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
