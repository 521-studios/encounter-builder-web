import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pfsrd2 } from './pfsrd2.js'

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

test('suggestMonsters queries suggest/unified for monsters + npcs', async () => {
  const fetchImpl = fakeFetch(ok([{ game_id: 'Monsters:1', name: 'Goblin', type: 'monsters' }]))
  const out = await pfsrd2.suggestMonsters('gob', { tokenProvider: tok, fetchImpl })
  assert.equal(out[0].name, 'Goblin')
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/api\/pfsrd2\/search\/suggest\/unified\?/)
  assert.match(url, /q=gob/)
  assert.match(url, /type=monsters/)
  assert.match(url, /type=npcs/)
})

test('entryFull fetches the /full entry, url-encoding the game_id', async () => {
  const fetchImpl = fakeFetch(ok({ name: 'Goblin Dog', schema_version: 1.4 }))
  const out = await pfsrd2.entryFull('Monsters:3028', { tokenProvider: tok, fetchImpl })
  assert.equal(out.name, 'Goblin Dog')
  assert.match(fetchImpl.calls[0].url, /\/api\/pfsrd2\/entries\/Monsters%3A3028\/full$/)
})
