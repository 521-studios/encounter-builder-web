import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveParty, PARTY_DEFAULT, sourceLabel } from './party.js'

test('resolveParty falls back to the app default when nothing is set', () => {
  const r = resolveParty({})
  assert.equal(r.level, PARTY_DEFAULT.level)
  assert.equal(r.size, PARTY_DEFAULT.size)
  assert.equal(r.levelSource, 'default')
  assert.equal(r.sizeSource, 'default')
})

test('resolveParty inherits from campaign when chapter/encounter are unset', () => {
  const r = resolveParty({ campaign: { party_level: 5, party_size: 6 } })
  assert.equal(r.level, 5)
  assert.equal(r.size, 6)
  assert.equal(r.levelSource, 'campaign')
})

test('resolveParty: chapter overrides campaign', () => {
  const r = resolveParty({
    campaign: { party_level: 5, party_size: 4 },
    chapter: { party_level: 8 }, // size still inherits campaign
  })
  assert.equal(r.level, 8)
  assert.equal(r.levelSource, 'chapter')
  assert.equal(r.size, 4)
  assert.equal(r.sizeSource, 'campaign')
})

test('resolveParty: encounter overrides everything, per field', () => {
  const r = resolveParty({
    campaign: { party_level: 5, party_size: 4 },
    chapter: { party_level: 8, party_size: 5 },
    encounter: { party_level: 10 }, // size inherits chapter
  })
  assert.equal(r.level, 10)
  assert.equal(r.levelSource, 'encounter')
  assert.equal(r.size, 5)
  assert.equal(r.sizeSource, 'chapter')
})

test('resolveParty treats null and undefined as "inherit", 0 would pass through (but is invalid upstream)', () => {
  const r = resolveParty({
    campaign: { party_level: 3, party_size: 4 },
    chapter: { party_level: null, party_size: undefined },
  })
  assert.equal(r.level, 3) // chapter null -> inherit campaign
  assert.equal(r.levelSource, 'campaign')
})

test('sourceLabel maps sources to hints', () => {
  assert.equal(sourceLabel('chapter'), 'chapter')
  assert.equal(sourceLabel('campaign'), 'campaign')
  assert.equal(sourceLabel('default'), 'default')
  assert.equal(sourceLabel('encounter'), 'this encounter')
})
