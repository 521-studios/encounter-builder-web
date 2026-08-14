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

test('creatureHeader reads a derived ref.json (applied templates), not the base entry', () => {
  // Elite-templated slurk: the resolved snapshot is Creature 3 with Perception +8;
  // the header must reflect that, not the base entry's Creature 2 / +6.
  const monster = {
    ref: {
      base: { game_id: 'Monsters:315' },
      modifications: [{ template_game_id: 'elite', template_name: 'Elite' }],
      json: {
        name: 'Slurk',
        stat_block: {
          creature_type: { level: 3 },
          sources: [{ name: 'Monster Core', page: 315 }],
          senses: { perception: { value: 8 } },
        },
      },
    },
  }
  const h = creatureHeader(entry, monster) // base `entry` is Creature -1; ref.json wins
  assert.equal(h.level, 3)
  assert.equal(h.source, 'Monster Core 315')
  assert.equal(h.initiative, 'Perception +8')
})

test('creatureHeader ignores the legacy adjustment shift when a resolved ref.json is present', () => {
  // ref.json already bakes in every template, so no manual elite/weak shift on top.
  const monster = {
    adjustment: 'elite',
    ref: { json: { stat_block: { creature_type: { level: 3 } } } },
  }
  assert.equal(creatureHeader(entry, monster).level, 3)
})

test('creatureHeader tolerates a bare-creature ref.json (no stat_block wrapper)', () => {
  const monster = { ref: { json: { creature_type: { level: 4 }, senses: { perception: { value: 2 } } } } }
  const h = creatureHeader(null, monster)
  assert.equal(h.level, 4)
  assert.equal(h.initiative, 'Perception +2')
})

test('creatureHeader falls back to the base entry when a ref.json snapshot yields no readable level', () => {
  // A partial/stale resolved snapshot (present but no creature_type/level) is unusable
  // — degrade to the loaded base entry instead of blanking the header, matching how
  // budget.js routes a null-level monster to `unknown`.
  const monster = {
    ref: { json: { sources: [{ name: 'Stale', page: 1 }], senses: { perception: { value: 9 } } } },
  }
  const h = creatureHeader(entry, monster) // base entry: Goblin Warrior, Cr -1, Bestiary 192, Perception +5
  assert.equal(h.level, -1)
  assert.equal(h.source, 'Bestiary 192')
  assert.equal(h.initiative, 'Perception +5')
})

test('creatureHeader returns nulls when a ref.json snapshot is unusable and no base entry loaded', () => {
  assert.deepEqual(creatureHeader(null, { ref: { json: { name: 'partial' } } }), {
    level: null,
    source: null,
    initiative: null,
  })
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

test('creatureHeader prefers stat_block.sources over top-level sources', () => {
  // The stat block is the resolved citation (a reprint/errata can differ from the
  // top-level source); it wins when both are present.
  const e = {
    sources: [{ name: 'Bestiary', page: 100 }],
    stat_block: { creature_type: { level: 1 }, sources: [{ name: 'Monster Core', page: 200 }] },
  }
  assert.equal(creatureHeader(e).source, 'Monster Core 200')
})

test('creatureHeader renders a zero-page and zero-Perception with explicit sign', () => {
  const e = {
    sources: [{ name: 'Bestiary', page: 0 }],
    stat_block: { creature_type: { level: 0 }, senses: { perception: { value: 0 } } },
  }
  const h = creatureHeader(e)
  assert.equal(h.source, 'Bestiary 0') // page 0 still renders (not dropped as falsy)
  assert.equal(h.initiative, 'Perception +0')
})
