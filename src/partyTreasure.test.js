import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { partyTreasureEnabled, combatPushEnabled, resetPartyTreasure, receipt } from './partyTreasure.js'
import { setAnon } from './api/anon.js'

const realFetch = globalThis.fetch
const realWarn = console.warn
afterEach(() => {
  resetPartyTreasure()
  setAnon(false)
  globalThis.fetch = realFetch
  console.warn = realWarn
})

const res = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj) })

test('partyTreasureEnabled: anonymous mode is false without calling /me', async () => {
  setAnon(true)
  let calls = 0
  globalThis.fetch = async () => (calls++, res({ party_treasure: true }))
  assert.equal(await partyTreasureEnabled(), false)
  assert.equal(calls, 0)
})

test('partyTreasureEnabled: a failed /me reads false, warns, and is retried next time', async () => {
  const warned = []
  console.warn = (...a) => warned.push(a)
  let calls = 0
  globalThis.fetch = async () => (++calls === 1 ? res({ error: 'down' }, 500) : res({ party_treasure: true }))
  assert.equal(await partyTreasureEnabled(), false)
  assert.equal(warned.length, 1)
  assert.equal(await partyTreasureEnabled(), true)
  assert.equal(calls, 2)
})

test('partyTreasureEnabled: a successful /me is cached', async () => {
  let calls = 0
  globalThis.fetch = async () => (calls++, res({ party_treasure: true }))
  assert.equal(await partyTreasureEnabled(), true)
  assert.equal(await partyTreasureEnabled(), true)
  assert.equal(calls, 1)
})

test('combatPushEnabled reads combat_push from the same cached /me', async () => {
  let calls = 0
  globalThis.fetch = async () => (calls++, res({ party_treasure: false, combat_push: true }))
  assert.equal(await combatPushEnabled(), true)
  assert.equal(await partyTreasureEnabled(), false)
  assert.equal(calls, 1)
  resetPartyTreasure()
  globalThis.fetch = async () => res({ party_treasure: true }) // older API: no combat_push
  assert.equal(await combatPushEnabled(), false)
})

test('receipt: no push, an error, one item, many items', () => {
  assert.deepEqual(receipt(null), { sent: false, text: 'Not sent to the party pool.' })
  assert.deepEqual(receipt({ error: 'x' }), { sent: false, text: 'Not sent to the party pool: x' })
  assert.equal(receipt({ ledger_id: 'L', item_count: 1 }).text, 'Sent to the party pool: 1 item (ledger L).')
  assert.equal(receipt({ ledger_id: 'L', item_count: 3 }).text, 'Sent to the party pool: 3 items (ledger L).')
})
