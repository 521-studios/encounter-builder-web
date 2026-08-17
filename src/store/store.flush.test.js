import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { store, resetStore, resetFlush, flushState, subscribeFlush } from './store.js'
import { setAnon } from '../api/anon.js'

const realFetch = globalThis.fetch
afterEach(() => {
  resetFlush()
  resetStore()
  setAnon(false)
  globalThis.fetch = realFetch
})

function stubFetch(handler) {
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined })
    return handler(url, opts, calls.length)
  }
  return calls
}
const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => (obj == null ? '' : JSON.stringify(obj)) })
const rec = (over = {}) => ({ id: 'e1', name: 'A', status: 'draft', currency: {}, monsters: [], ...over })
// A PUT handler that echoes the sent body back as the saved record.
const echoPut = () => stubFetch((url, o) => res({ ...o.body ? JSON.parse(o.body) : {}, id: 'e1', status: 'draft' }))
// Resolve once a record reaches a given flush state (for the real-timer debounce test).
const untilState = (cid, id, want) =>
  new Promise((resolve) => {
    if (flushState(cid, id) === want) return resolve()
    const un = subscribeFlush(() => { if (flushState(cid, id) === want) { un(); resolve() } })
  })

test('edit marks the record unsaved; flush persists it and reports saved + onSaved(saved)', async () => {
  const calls = echoPut()
  let savedArg = null
  store.encounters.edit('c1', 'e1', rec({ name: 'Edited' }), { onSaved: (s) => { savedArg = s } })
  assert.equal(flushState('c1', 'e1'), 'unsaved')
  await store.encounters.flush('c1', 'e1')
  assert.equal(flushState('c1', 'e1'), 'saved')
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1)
  assert.equal(calls.at(-1).body.name, 'Edited') // buildInput of the working copy
  assert.equal(savedArg.name, 'Edited')
})

test('the debounced timer flushes on its own (no manual flush)', async () => {
  echoPut()
  store.encounters.edit('c1', 'e1', rec({ name: 'Timed' }), {})
  await untilState('c1', 'e1', 'saved') // waits out the 800ms debounce
  assert.equal(flushState('c1', 'e1'), 'saved')
})

test('coalesces multiple edits before a flush into one save of the latest', async () => {
  const calls = echoPut()
  let onSavedCount = 0
  const h = { onSaved: () => { onSavedCount++ } }
  store.encounters.edit('c1', 'e1', rec({ name: 'first' }), h)
  store.encounters.edit('c1', 'e1', rec({ name: 'second' }), h) // resets the debounce
  await store.encounters.flush('c1', 'e1')
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1, 'only one PUT for the coalesced burst')
  assert.equal(calls.at(-1).body.name, 'second', 'the latest working copy is what persists')
  assert.equal(onSavedCount, 1)
})

test('a failed flush → error state + onError, keeps dirty, and recovers on the next edit', async () => {
  let fail = true
  stubFetch((url, o) => (o.method === 'PUT' && fail ? res({ error: 'boom' }, 500) : res({ ...JSON.parse(o.body), id: 'e1', status: 'draft' })))
  let errArg = null
  store.encounters.edit('c1', 'e1', rec({ name: 'X' }), { onError: (e) => { errArg = e } })
  await store.encounters.flush('c1', 'e1')
  assert.equal(flushState('c1', 'e1'), 'error')
  assert.ok(errArg, 'onError fired')
  // recover
  fail = false
  store.encounters.edit('c1', 'e1', rec({ name: 'Y' }), {})
  await store.encounters.flush('c1', 'e1')
  assert.equal(flushState('c1', 'e1'), 'saved')
})

test('a second flush while one is in flight does not double-write (concurrent guard)', async () => {
  let releasePut
  const calls = stubFetch((url, o) => {
    if (o.method === 'PUT') {
      return new Promise((resolve) => { releasePut = () => resolve(res({ ...o.body ? JSON.parse(o.body) : {}, id: 'e1', status: 'draft' })) })
    }
    return res(rec())
  })
  store.encounters.edit('c1', 'e1', rec({ name: 'InFlight' }), {})
  const p1 = store.encounters.flush('c1', 'e1') // starts runFlush; saving=true is set synchronously
  const p2 = store.encounters.flush('c1', 'e1') // must early-return on the saving guard — no 2nd PUT
  // Let request() reach fetch (tokenProvider + bodyHash awaits) so the PUT is actually in flight.
  await new Promise((r) => setTimeout(r, 20))
  releasePut()
  await Promise.all([p1, p2])
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1, 'the in-flight guard prevented a concurrent double-write')
  assert.equal(flushState('c1', 'e1'), 'saved')
})

test('a concurrent list() does not clobber a dirty edit — the edit still persists (lost-update regression)', async () => {
  const calls = stubFetch((url, o) => {
    if (o.method === 'PUT') return res({ ...JSON.parse(o.body), id: 'e1', status: 'draft' })
    return res([{ id: 'e1', name: 'ORIGINAL', status: 'draft' }]) // GET list
  })
  store.encounters.edit('c1', 'e1', rec({ name: 'EDITED' }), {})
  await store.encounters.list('c1') // backend ORIGINAL replaces the read cache — must NOT clobber the working copy
  await store.encounters.flush('c1', 'e1')
  const put = calls.find((c) => c.method === 'PUT')
  assert.equal(put.body.name, 'EDITED', 'the dirty working copy persisted, not the list-refreshed backend record')
})

test('get() serves the unsaved working copy while dirty (not a stale list refresh)', async () => {
  stubFetch((url, o) => (o.method === 'GET' && url.endsWith('/encounters')
    ? res([{ id: 'e1', name: 'ORIGINAL', status: 'draft' }])
    : res({ id: 'e1', name: 'ORIGINAL', status: 'draft' })))
  store.encounters.edit('c1', 'e1', rec({ name: 'EDITED' }), {})
  await store.encounters.list('c1') // refreshes cache with ORIGINAL
  const got = await store.encounters.get('c1', 'e1')
  assert.equal(got.name, 'EDITED', 'read-through prefers the unsaved working copy over the stale cache')
})

test('cancel drops a pending edit without persisting (release/delete path)', async () => {
  const calls = echoPut()
  store.encounters.edit('c1', 'e1', rec({ name: 'Abandoned' }), {})
  assert.equal(flushState('c1', 'e1'), 'unsaved')
  store.encounters.cancel('c1', 'e1')
  assert.equal(flushState('c1', 'e1'), 'saved')
  await store.encounters.flush('c1', 'e1') // nothing pending → no write
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 0, 'cancel prevented the debounced flush')
})

test('subscribeFlush notifies on state transitions', async () => {
  echoPut()
  let ticks = 0
  const un = subscribeFlush(() => { ticks++ })
  store.encounters.edit('c1', 'e1', rec(), {}) // → unsaved
  await store.encounters.flush('c1', 'e1') // → saving → saved
  un()
  assert.ok(ticks >= 2, `expected multiple notifications, got ${ticks}`)
})
