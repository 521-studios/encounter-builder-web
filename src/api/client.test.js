import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHeaders, request, ApiError, bodyHash } from './client.js'

test('bodyHash returns the hex SHA-256 (known vector for empty string)', async () => {
  assert.equal(await bodyHash(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('buildHeaders attaches the bearer as X-Access-Token', () => {
  const h = buildHeaders('tok-abc')
  assert.equal(h['X-Access-Token'], 'tok-abc')
  assert.equal(h['Authorization'], undefined, 'must not use Authorization (OAC strips it)')
})

test('buildHeaders omits the token header when there is no token', () => {
  assert.equal(buildHeaders(null)['X-Access-Token'], undefined)
  assert.equal(buildHeaders('')['X-Access-Token'], undefined)
})

test('buildHeaders sets Content-Type only for JSON bodies', () => {
  assert.equal(buildHeaders('t', { json: true })['Content-Type'], 'application/json')
  assert.equal(buildHeaders('t')['Content-Type'], undefined)
})

function fakeFetch(res) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url, opts })
    return res
  }
  impl.calls = calls
  return impl
}

test('request sends X-Access-Token from the token provider and parses JSON', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 200, text: async () => '{"sub":"42"}' })
  const out = await request('GET', '/api/app/me', {
    tokenProvider: async () => 'the-jwt',
    fetchImpl,
  })
  assert.deepEqual(out, { sub: '42' })
  assert.equal(fetchImpl.calls[0].opts.headers['X-Access-Token'], 'the-jwt')
  assert.equal(fetchImpl.calls[0].opts.method, 'GET')
})

test('request serializes a JSON body and sets Content-Type', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 200, text: async () => '{}' })
  await request('POST', '/api/app/campaigns/g1/encounters', {
    body: { name: 'Goblins' },
    tokenProvider: async () => 't',
    fetchImpl,
  })
  const opts = fetchImpl.calls[0].opts
  assert.equal(opts.body, JSON.stringify({ name: 'Goblins' }))
  assert.equal(opts.headers['Content-Type'], 'application/json')
  // OAC SigV4 needs the body hash on bodied requests, or the Function URL 403s.
  assert.equal(opts.headers['x-amz-content-sha256'], await bodyHash(JSON.stringify({ name: 'Goblins' })))
})

test('request omits x-amz-content-sha256 on bodiless requests (GET)', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 200, text: async () => '[]' })
  await request('GET', '/api/app/campaigns/g1/encounters', { tokenProvider: async () => 't', fetchImpl })
  assert.equal(fetchImpl.calls[0].opts.headers['x-amz-content-sha256'], undefined)
})

test('request throws ApiError with status + body on non-ok', async () => {
  const fetchImpl = fakeFetch({ ok: false, status: 403, text: async () => '{"error":"not the GM"}' })
  await assert.rejects(
    () => request('GET', '/api/app/campaigns/g1/encounters', { tokenProvider: async () => 't', fetchImpl }),
    (err) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 403)
      assert.deepEqual(err.body, { error: 'not the GM' })
      return true
    },
  )
})

test('request returns a raw string when the body is not JSON', async () => {
  // e.g. a plain-text 5xx or a non-JSON error page.
  const fetchImpl = fakeFetch({ ok: true, status: 200, text: async () => 'plain text' })
  const out = await request('GET', '/api/app/healthz', { tokenProvider: async () => 't', fetchImpl })
  assert.equal(out, 'plain text')
})

test('request returns null on 204', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 204, text: async () => '' })
  assert.equal(await request('DELETE', '/api/app/campaigns/g1/encounters/e1', { tokenProvider: async () => 't', fetchImpl }), null)
})
