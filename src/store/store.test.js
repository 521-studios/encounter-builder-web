import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { store, resetStore } from './store.js'
import { resetLocalStore } from './localStore.js'
import { setAnon } from '../api/anon.js'

const realFetch = globalThis.fetch

afterEach(() => {
  resetStore()
  resetLocalStore()
  setAnon(false)
  globalThis.fetch = realFetch
})

// Stub global fetch (the api backend routes through client.js request()). Records
// each call; `handler(url, opts)` returns the fake Response.
function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body })
    return handler(url, opts)
  }
  return calls
}
const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)) })

test('api backend: get is read-through — second get is served from cache (one fetch)', async () => {
  const rec = { id: 'e1', name: 'Fetched', status: 'draft' }
  const calls = stubFetch(() => res(rec))
  const a = await store.encounters.get('c1', 'e1')
  const b = await store.encounters.get('c1', 'e1')
  assert.equal(a.name, 'Fetched')
  assert.equal(b.name, 'Fetched')
  assert.equal(calls.length, 1, 'second get hits the cache, not the network')
})

test('api backend: update writes through — the cache reflects the saved record (no re-fetch)', async () => {
  let current = { id: 'e1', name: 'Old', status: 'draft' }
  const calls = stubFetch((url, o) => {
    if (o.method === 'PUT') { current = { ...JSON.parse(o.body), id: 'e1', status: 'draft' }; return res(current) }
    return res(current) // GET
  })
  await store.encounters.get('c1', 'e1') // caches Old (fetch #1)
  const updated = await store.encounters.update('c1', 'e1', { name: 'New' }) // PUT (fetch #2)
  assert.equal(updated.name, 'New')
  const cached = await store.encounters.get('c1', 'e1') // from cache
  assert.equal(cached.name, 'New')
  assert.equal(calls.filter((c) => c.method === 'GET').length, 1, 'only the initial GET hit the network')
})

test('api backend: list refreshes the cache, so a following get needs no fetch', async () => {
  const calls = stubFetch(() => res([{ id: 'e1', name: 'A', status: 'draft' }, { id: 'e2', name: 'B', status: 'draft' }]))
  const arr = await store.encounters.list('c1')
  assert.deepEqual(arr.map((e) => e.name), ['A', 'B'])
  const before = calls.length
  const e2 = await store.encounters.get('c1', 'e2')
  assert.equal(e2.name, 'B')
  assert.equal(calls.length, before, 'get after list is served from the populated cache')
})

test('api backend: remove drops the record from the cache', async () => {
  let rec = { id: 'e1', name: 'Doomed', status: 'draft' }
  const calls = stubFetch((url, o) => (o.method === 'DELETE' ? res(null, 204) : res(rec)))
  await store.encounters.get('c1', 'e1') // cache it (GET #1)
  await store.encounters.remove('c1', 'e1') // DELETE, drops from cache
  await store.encounters.get('c1', 'e1') // must re-fetch (GET #2)
  assert.equal(calls.filter((c) => c.method === 'GET').length, 2)
})

test('api backend: release writes through — the cache reflects the released status', async () => {
  const calls = stubFetch((url, o) => {
    if (o.method === 'POST') return res({ id: 'e1', name: 'A', status: 'released' })
    return res({ id: 'e1', name: 'A', status: 'draft' }) // GET
  })
  await store.encounters.get('c1', 'e1') // caches draft (GET #1)
  const released = await store.encounters.release('c1', 'e1') // POST /release
  assert.equal(released.status, 'released')
  const cached = await store.encounters.get('c1', 'e1') // from cache
  assert.equal(cached.status, 'released')
  assert.equal(calls.filter((c) => c.method === 'GET').length, 1, 'release updated the cache — no re-fetch')
})

test('api backend: list evicts a since-deleted record (map is replaced, not merged)', async () => {
  let listing = [{ id: 'e1', name: 'A', status: 'draft' }, { id: 'e2', name: 'B', status: 'draft' }]
  const calls = stubFetch((url, o) => {
    if (o.method === 'GET' && url.endsWith('/encounters')) return res(listing)
    return res({ id: 'e1', name: 'A', status: 'draft' }) // single GET
  })
  await store.encounters.list('c1') // caches e1, e2
  listing = [{ id: 'e2', name: 'B', status: 'draft' }] // e1 deleted server-side
  await store.encounters.list('c1') // cache map REPLACED → e1 gone
  const before = calls.length
  await store.encounters.get('c1', 'e1') // must re-fetch, not serve a stale cached e1
  assert.equal(calls.length, before + 1, 'a since-deleted record does not linger in the cache')
})

test('cache is isolated per campaign (c1 record is not served for c2)', async () => {
  const calls = stubFetch((url) => res({ id: 'e1', name: url.includes('/c1/') ? 'from-c1' : 'from-c2', status: 'draft' }))
  const a = await store.encounters.get('c1', 'e1') // caches under c1
  const b = await store.encounters.get('c2', 'e1') // different campaign → own fetch
  assert.equal(a.name, 'from-c1')
  assert.equal(b.name, 'from-c2')
  assert.equal(calls.length, 2, 'c2 did not get served c1s cached record')
})

test('anon: the store routes to the local backend (no network)', async () => {
  setAnon(true)
  // No fetch stub — a network call would throw, proving the local path is taken.
  const created = await store.encounters.create('local', { name: 'Anon' })
  assert.ok(created.id)
  const got = await store.encounters.get('local', created.id)
  assert.equal(got.name, 'Anon')
  const list = await store.encounters.list('local')
  assert.deepEqual(list.map((e) => e.name), ['Anon'])
})

test('anon: every store method returns a thenable (callers do .then on the local backend)', async () => {
  setAnon(true)
  // The local backend returns sync values; the store must still hand back a
  // Promise so `chapters.list(cid).then(...)` etc. don't throw. Regression guard.
  const ch = await store.chapters.create('local', { name: 'Ch' })
  for (const pr of [
    store.encounters.list('local'),
    store.chapters.list('local'),
    store.chapters.update('local', ch.id, { name: 'Ch2' }),
    store.settings.get('local'),
    store.settings.put('local', { party_level: 1 }),
  ]) {
    assert.equal(typeof pr.then, 'function', 'store method returned a non-thenable in anon mode')
    await pr
  }
})

test('settings: get is read-through, put writes through', async () => {
  let saved = {}
  const calls = stubFetch((url, o) => {
    if (o.method === 'PUT') { saved = JSON.parse(o.body); return res(saved) }
    return res(saved) // GET
  })
  await store.settings.get('c1') // fetch #1, caches {}
  const put = await store.settings.put('c1', { party_level: 5 })
  assert.deepEqual(put, { party_level: 5 })
  const got = await store.settings.get('c1') // from cache
  assert.deepEqual(got, { party_level: 5 })
  assert.equal(calls.filter((c) => c.method === 'GET').length, 1)
})
