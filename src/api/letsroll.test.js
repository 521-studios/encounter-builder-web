import { test } from 'node:test'
import assert from 'node:assert/strict'
import { letsRollHeaders, fetchGames, LetsRollError } from './letsroll.js'

test('letsRollHeaders uses Authorization: Bearer (cross-origin, not X-Access-Token)', () => {
  const h = letsRollHeaders('tok-abc')
  assert.equal(h['Authorization'], 'Bearer tok-abc')
  assert.equal(h['X-Access-Token'], undefined)
})

test('letsRollHeaders omits Authorization when there is no token', () => {
  assert.deepEqual(letsRollHeaders(null), {})
  assert.deepEqual(letsRollHeaders(''), {})
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

test('fetchGames hits /api/v1/games with the bearer and parses the list', async () => {
  const games = [
    { id: 1, name: 'Rise of the Runelords', gm_user_id: 42, am_gm: true },
    { id: 2, name: 'A game I only play in', gm_user_id: 7, am_gm: false },
  ]
  const fetchImpl = fakeFetch({ ok: true, status: 200, text: async () => JSON.stringify(games) })
  const out = await fetchGames({ tokenProvider: async () => 'jwt', fetchImpl })
  assert.deepEqual(out, games)
  assert.match(fetchImpl.calls[0].url, /\/api\/v1\/games$/)
  assert.equal(fetchImpl.calls[0].opts.headers['Authorization'], 'Bearer jwt')
})

test('fetchGames throws LetsRollError with status + body on non-ok', async () => {
  const fetchImpl = fakeFetch({ ok: false, status: 401, text: async () => '{"error":"unauthorized"}' })
  await assert.rejects(
    () => fetchGames({ tokenProvider: async () => 'jwt', fetchImpl }),
    (err) => {
      assert.ok(err instanceof LetsRollError)
      assert.equal(err.status, 401)
      assert.deepEqual(err.body, { error: 'unauthorized' })
      return true
    },
  )
})
