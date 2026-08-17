import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { localStore, resetLocalStore, LOCAL_CAMPAIGN } from './localStore.js'
import { setAnon } from '../api/anon.js'
import { encounters } from '../api/encounters.js'

afterEach(() => {
  resetLocalStore()
  setAnon(false)
})

test('create mints an id, defaults status draft + empty line arrays, and echoes a full record', () => {
  const rec = localStore.encounters.create({ name: 'Ambush', currency: {} })
  assert.ok(rec.id, 'minted an id')
  assert.equal(rec.status, 'draft')
  assert.equal(rec.name, 'Ambush')
  for (const k of ['monsters', 'hazards', 'afflictions', 'treasure', 'treasure_pools', 'xp_awards', 'rewards', 'skill_checks', 'exits']) {
    assert.deepEqual(rec[k], [], `${k} defaults to []`)
  }
  assert.deepEqual(localStore.encounters.list().map((e) => e.id), [rec.id])
  assert.deepEqual(localStore.encounters.get(rec.id), rec)
})

test('update is a full replace that preserves id + server-owned status', () => {
  const a = localStore.encounters.create({ name: 'A' })
  const updated = localStore.encounters.update(a.id, { name: 'A2', monsters: [{ ref: { game_id: 'M:1' } }] })
  assert.equal(updated.id, a.id)
  assert.equal(updated.name, 'A2')
  assert.equal(updated.status, 'draft') // status is not carried in the PUT body; store preserves it
  assert.equal(updated.monsters.length, 1)
  assert.equal(localStore.encounters.get(a.id).name, 'A2')
})

test('release flips status to released; remove deletes', () => {
  const a = localStore.encounters.create({ name: 'A' })
  const released = localStore.encounters.release(a.id)
  assert.equal(released.status, 'released')
  assert.equal(localStore.encounters.get(a.id).status, 'released')
  localStore.encounters.remove(a.id)
  assert.deepEqual(localStore.encounters.list(), [])
  assert.throws(() => localStore.encounters.get(a.id), /not found/)
})

test('release throws on a missing id (parallel to get)', () => {
  assert.throws(() => localStore.encounters.release('nope'), /not found/)
})

test('degrades to in-memory when localStorage throws (private mode / quota)', () => {
  const real = globalThis.localStorage
  // A Storage whose reads/writes throw — the private-mode / over-quota case.
  globalThis.localStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('quota') },
    removeItem() { throw new Error('blocked') },
  }
  try {
    // persist() swallows the setItem throw; the record still lives in memory.
    const a = localStore.encounters.create({ name: 'Ephemeral' })
    assert.equal(localStore.encounters.get(a.id).name, 'Ephemeral')
    assert.deepEqual(localStore.encounters.list().map((e) => e.id), [a.id])
  } finally {
    globalThis.localStorage = real
  }
})

test('mutations persist to localStorage (survive a reload)', () => {
  const a = localStore.encounters.create({ name: 'Persisted' })
  const blob = JSON.parse(localStorage.getItem('eb:anon:v1'))
  assert.equal(blob.encounters[a.id].name, 'Persisted')
})

test('games() returns the single synthetic campaign (am_gm so it lists)', () => {
  assert.deepEqual(localStore.games(), [LOCAL_CAMPAIGN])
  assert.equal(LOCAL_CAMPAIGN.am_gm, true)
})

test('chapters + settings round-trip through the store', () => {
  const ch = localStore.chapters.create({ name: 'Ch1', order: 0 })
  assert.ok(ch.id)
  assert.deepEqual(localStore.chapters.list().map((c) => c.name), ['Ch1'])
  localStore.settings.put({ party_level: 3, party_size: 5 })
  assert.deepEqual(localStore.settings.get(), { party_level: 3, party_size: 5 })
})

test('the encounters API client delegates to the store when anon (await-compatible)', async () => {
  setAnon(true)
  const created = await encounters.create('local', { name: 'ViaClient' })
  assert.ok(created.id)
  const list = await encounters.list('local')
  assert.deepEqual(list.map((e) => e.name), ['ViaClient'])
  const got = await encounters.get('local', created.id)
  assert.equal(got.name, 'ViaClient')
})
