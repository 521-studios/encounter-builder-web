import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pfsrd2 } from './pfsrd2.js'
import { bodyHash } from './client.js'

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
  const out = await pfsrd2.suggestMonsters('gob', {}, { tokenProvider: tok, fetchImpl })
  assert.equal(out[0].name, 'Goblin')
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/api\/pfsrd2\/search\/suggest\/unified\?/)
  assert.match(url, /q=gob/)
  assert.match(url, /type=monsters/)
  assert.match(url, /type=npcs/)
  assert.ok(!url.includes('traits='), 'no traits param without a filter')
})

test('suggestMonsters forwards a traits filter as the comma-separated traits param', async () => {
  const fetchImpl = fakeFetch(ok([]))
  await pfsrd2.suggestMonsters('gob', { traits: ['Undead', 'Fire'] }, { tokenProvider: tok, fetchImpl })
  const url = fetchImpl.calls[0].url
  assert.match(url, /traits=Undead%2CFire/)
})

test('suggestMonsterTraits queries /search/traits with types + selected chips', async () => {
  const fetchImpl = fakeFetch(ok(['Undead']))
  const out = await pfsrd2.suggestMonsterTraits('un', ['Fire'], { tokenProvider: tok, fetchImpl })
  assert.deepEqual(out, ['Undead'])
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/api\/pfsrd2\/search\/traits\?/)
  assert.match(url, /q=un/)
  assert.match(url, /type=monsters/)
  assert.match(url, /type=npcs/)
  assert.match(url, /trait=Fire/)
  assert.match(url, /limit=10/) // client overrides the API's default 50
})

test('suggestMonsterTraits omits q when no prefix is given', async () => {
  const fetchImpl = fakeFetch(ok([]))
  await pfsrd2.suggestMonsterTraits('', [], { tokenProvider: tok, fetchImpl })
  assert.ok(!fetchImpl.calls[0].url.includes('q='), 'no q param without a prefix')
})

test('suggestItems queries suggest/unified for equipment/weapons/armor/shields', async () => {
  const fetchImpl = fakeFetch(ok([{ game_id: 'Weapons:1', name: 'Sword Cane', type: 'weapons' }]))
  const out = await pfsrd2.suggestItems('sword', {}, { tokenProvider: tok, fetchImpl })
  assert.equal(out[0].name, 'Sword Cane')
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/api\/pfsrd2\/search\/suggest\/unified\?/)
  assert.match(url, /q=sword/)
  for (const t of ['equipment', 'weapons', 'armor', 'shields']) {
    assert.match(url, new RegExp(`type=${t}`))
  }
})

test('suggestItems forwards traits + category + subcategory filters', async () => {
  const fetchImpl = fakeFetch(ok([]))
  await pfsrd2.suggestItems(
    'rune',
    { traits: ['Magical'], category: 'Runes', subcategory: 'Property Runes' },
    { tokenProvider: tok, fetchImpl },
  )
  const url = fetchImpl.calls[0].url
  assert.match(url, /traits=Magical/)
  assert.match(url, /category=Runes/)
  assert.match(url, /subcategory=Property\+Runes/)
})

test('suggestItemTraits narrows /search/traits by the active facet context', async () => {
  const fetchImpl = fakeFetch(ok(['Magical']))
  await pfsrd2.suggestItemTraits(
    'mag',
    ['Evocation'],
    { category: 'Runes', subcategory: 'Property Runes' },
    { tokenProvider: tok, fetchImpl },
  )
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/api\/pfsrd2\/search\/traits\?/)
  assert.match(url, /q=mag/)
  assert.match(url, /trait=Evocation/)
  assert.match(url, /category=Runes/)
  assert.match(url, /subcategory=Property\+Runes/)
  assert.match(url, /limit=10/)
  for (const t of ['equipment', 'weapons', 'armor', 'shields']) {
    assert.match(url, new RegExp(`type=${t}`))
  }
})

test('loadItemFacets returns the categories map from /search/facets', async () => {
  const fetchImpl = fakeFetch(ok({ categories: { Runes: ['Property Runes'], Armor: ['Base Armor'] } }))
  const cats = await pfsrd2.loadItemFacets({ tokenProvider: tok, fetchImpl })
  assert.deepEqual(cats, { Runes: ['Property Runes'], Armor: ['Base Armor'] })
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/api\/pfsrd2\/search\/facets\?/)
  for (const t of ['equipment', 'weapons', 'armor', 'shields']) {
    assert.match(url, new RegExp(`type=${t}`))
  }
})

test('applyTemplatePost signs the body with x-amz-content-sha256 (OAC) + X-Access-Token', async () => {
  const body = JSON.stringify({ creature: { name: 'Goblin' }, template_game_id: 'Templates:1' })
  const raw = { ok: true, status: 200 }
  const fetchImpl = fakeFetch(raw)
  const res = await pfsrd2.applyTemplatePost(body, { tokenProvider: tok, fetchImpl })
  assert.equal(res, raw) // returns the RAW response (library parses the multipart)
  const call = fetchImpl.calls[0]
  assert.match(call.url, /\/api\/pfsrd2\/templates\/apply$/)
  assert.equal(call.opts.method, 'POST')
  assert.equal(call.opts.body, body)
  assert.equal(call.opts.headers['Content-Type'], 'application/json')
  assert.equal(call.opts.headers['X-Access-Token'], 'jwt')
  // the OAC payload hash must be sha256 of the exact body string
  assert.equal(call.opts.headers['x-amz-content-sha256'], await bodyHash(body))
})

test('applyItemPost signs the item body (OAC) and posts to the library-supplied path', async () => {
  const body = JSON.stringify({ name: 'Rapier', stat_block: {} })
  const raw = { ok: true, status: 200 }
  const fetchImpl = fakeFetch(raw)
  const path = '/entries/weapons:1/apply/equipment:pot?grade=2'
  const res = await pfsrd2.applyItemPost(path, body, { tokenProvider: tok, fetchImpl })
  assert.equal(res, raw) // returns the RAW response (the library reads it)
  const call = fetchImpl.calls[0]
  assert.match(call.url, /\/api\/pfsrd2\/entries\/weapons:1\/apply\/equipment:pot\?grade=2$/)
  assert.ok(!call.url.includes('%3A'), 'must not encode the colon')
  assert.equal(call.opts.method, 'POST')
  assert.equal(call.opts.body, body)
  assert.equal(call.opts.headers['X-Access-Token'], 'jwt')
  assert.equal(call.opts.headers['x-amz-content-sha256'], await bodyHash(body))
})

test('suggestHazards queries suggest/unified for hazards + weatherhazards', async () => {
  const fetchImpl = fakeFetch(ok([{ game_id: 'Hazards:1', name: 'Spike Launcher', level: 1 }]))
  const out = await pfsrd2.suggestHazards('spike', {}, { tokenProvider: tok, fetchImpl })
  assert.equal(out[0].name, 'Spike Launcher')
  const url = fetchImpl.calls[0].url
  assert.match(url, /type=hazards/)
  assert.match(url, /type=weatherhazards/)
  assert.match(url, /q=spike/)
})

test('suggestSpells queries suggest/unified for type=spells', async () => {
  const fetchImpl = fakeFetch(ok([{ game_id: 'spells:1', name: 'Fireball', level: 3 }]))
  const out = await pfsrd2.suggestSpells('fire', { tokenProvider: tok, fetchImpl })
  assert.equal(out[0].name, 'Fireball')
  const url = fetchImpl.calls[0].url
  assert.match(url, /\/search\/suggest\/unified\?/)
  assert.match(url, /type=spells/)
  assert.match(url, /q=fire/)
})

test('entryFull keeps the raw colon in the game_id (the API 404s on %3A)', async () => {
  const fetchImpl = fakeFetch(ok({ name: 'Goblin Dog', schema_version: 1.4 }))
  const out = await pfsrd2.entryFull('Monsters:3028', { tokenProvider: tok, fetchImpl })
  assert.equal(out.name, 'Goblin Dog')
  assert.match(fetchImpl.calls[0].url, /\/api\/pfsrd2\/entries\/Monsters:3028\/full$/)
  assert.ok(!fetchImpl.calls[0].url.includes('%3A'), 'must not encode the colon')
})

test('suggest fns forward level_min/level_max (and omit unset)', async () => {
  const mFetch = fakeFetch(ok([]))
  await pfsrd2.suggestMonsters('orc', { levelMin: '1', levelMax: '5' }, { tokenProvider: tok, fetchImpl: mFetch })
  assert.match(mFetch.calls[0].url, /level_min=1/)
  assert.match(mFetch.calls[0].url, /level_max=5/)

  const iFetch = fakeFetch(ok([]))
  await pfsrd2.suggestItems('rune', { levelMin: '3' }, { tokenProvider: tok, fetchImpl: iFetch })
  assert.match(iFetch.calls[0].url, /level_min=3/)
  assert.ok(!iFetch.calls[0].url.includes('level_max'), 'no level_max when unset')
})
