import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyed, withKey, stripKey, emptyMonster, emptyTreasure } from './model.js'

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
