import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMonsterRef } from './monsterRef.js'

test('an empty stack yields a pristine ref', () => {
  assert.deepEqual(buildMonsterRef('Monsters:1', []), { game_id: 'Monsters:1' })
  assert.deepEqual(buildMonsterRef('Monsters:1', null), { game_id: 'Monsters:1' })
})

test('a non-empty stack yields a derived ref with base, modifications, and the last resolved json', () => {
  const stack = [
    { template: { game_id: 'T:elite', name: 'Elite' }, creature: { name: 'Elite Goblin' } },
    { template: { game_id: 'T:fire', name: 'Fire' }, creature: { name: 'Fire Elite Goblin' } },
  ]
  assert.deepEqual(buildMonsterRef('Monsters:1', stack), {
    base: { game_id: 'Monsters:1' },
    modifications: [
      { template_game_id: 'T:elite', template_name: 'Elite' },
      { template_game_id: 'T:fire', template_name: 'Fire' },
    ],
    json: { name: 'Fire Elite Goblin' }, // the LAST creature is the resolved snapshot
  })
})
