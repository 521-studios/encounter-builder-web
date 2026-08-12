import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encounters } from './encounters.js'

function fakeFetch(res) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url, opts })
    return res
  }
  impl.calls = calls
  return impl
}

const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })
const tok = async () => 'jwt'

test('list GETs the campaign-scoped collection path', async () => {
  const fetchImpl = fakeFetch(ok([]))
  await encounters.list('g1', { tokenProvider: tok, fetchImpl })
  assert.match(fetchImpl.calls[0].url, /\/api\/app\/campaigns\/g1\/encounters$/)
  assert.equal(fetchImpl.calls[0].opts.method, 'GET')
  assert.equal(fetchImpl.calls[0].opts.headers['X-Access-Token'], 'jwt')
})

test('create POSTs the input as the body', async () => {
  const fetchImpl = fakeFetch(ok({ id: 'e1' }))
  const input = { name: 'Goblins', currency: { gp: 5 } }
  const out = await encounters.create('g1', input, { tokenProvider: tok, fetchImpl })
  assert.deepEqual(out, { id: 'e1' })
  assert.equal(fetchImpl.calls[0].opts.method, 'POST')
  assert.equal(fetchImpl.calls[0].opts.body, JSON.stringify(input))
})

test('update PUTs to the encounter path with the input body', async () => {
  const fetchImpl = fakeFetch(ok({ id: 'e1', name: 'renamed' }))
  await encounters.update('g1', 'e1', { name: 'renamed' }, { tokenProvider: tok, fetchImpl })
  assert.match(fetchImpl.calls[0].url, /\/encounters\/e1$/)
  assert.equal(fetchImpl.calls[0].opts.method, 'PUT')
})

test('remove DELETEs the encounter path', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 204, text: async () => '' })
  const out = await encounters.remove('g1', 'e1', { tokenProvider: tok, fetchImpl })
  assert.equal(out, null)
  assert.equal(fetchImpl.calls[0].opts.method, 'DELETE')
})

test('release POSTs to the /release subpath', async () => {
  const fetchImpl = fakeFetch(ok({ status: 'released' }))
  await encounters.release('g1', 'e1', { tokenProvider: tok, fetchImpl })
  assert.match(fetchImpl.calls[0].url, /\/encounters\/e1\/release$/)
  assert.equal(fetchImpl.calls[0].opts.method, 'POST')
})

test('path components are URL-encoded', async () => {
  const fetchImpl = fakeFetch(ok({}))
  await encounters.get('g 1', 'e/1', { tokenProvider: tok, fetchImpl })
  assert.match(fetchImpl.calls[0].url, /\/campaigns\/g%201\/encounters\/e%2F1$/)
})
