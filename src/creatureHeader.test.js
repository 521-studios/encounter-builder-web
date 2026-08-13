import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creatureHeader } from './creatureHeader.js'

const entry = {
  name: 'Goblin Warrior',
  sources: [{ name: 'Bestiary', page: 192 }],
  stat_block: {
    creature_type: { level: -1 },
    sources: [{ name: 'Bestiary', page: 192 }],
    senses: { perception: { value: 5 } },
  },
}

test('creatureHeader reads level, source (book+page), and Perception-based initiative', () => {
  const h = creatureHeader(entry, { adjustment: 'none' })
  assert.equal(h.level, -1)
  assert.equal(h.source, 'Bestiary 192')
  assert.equal(h.initiative, 'Perception +5')
})

test('creatureHeader shifts level for elite (+1) and weak (-1)', () => {
  assert.equal(creatureHeader(entry, { adjustment: 'elite' }).level, 0)
  assert.equal(creatureHeader(entry, { adjustment: 'weak' }).level, -2)
})

test('creatureHeader signs a negative Perception initiative', () => {
  const e = { stat_block: { senses: { perception: { value: -1 } } } }
  assert.equal(creatureHeader(e).initiative, 'Perception -1')
})

test('creatureHeader returns nulls when the entry has not loaded', () => {
  assert.deepEqual(creatureHeader(null, { adjustment: 'elite' }), { level: null, source: null, initiative: null })
})

test('creatureHeader tolerates missing pieces (no sources / no perception)', () => {
  const e = { stat_block: { creature_type: { level: 3 } } }
  const h = creatureHeader(e)
  assert.equal(h.level, 3)
  assert.equal(h.source, null)
  assert.equal(h.initiative, null)
})

test('creatureHeader falls back to top-level sources when stat_block.sources is absent', () => {
  const e = { sources: [{ name: 'Monster Core', page: 40 }], stat_block: { creature_type: { level: 1 } } }
  assert.equal(creatureHeader(e).source, 'Monster Core 40')
})
