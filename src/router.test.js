import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLocation, locationFor, urlFor } from './router.js'

test('parseLocation: no campaign → campaign list (empty)', () => {
  assert.deepEqual(parseLocation(''), { campaignId: null, view: { kind: 'empty' } })
  assert.deepEqual(parseLocation('?foo=bar'), { campaignId: null, view: { kind: 'empty' } })
})

test('parseLocation: campaign only → selected campaign, empty main', () => {
  assert.deepEqual(parseLocation('?campaign=C1'), { campaignId: 'C1', view: { kind: 'empty' } })
})

test('parseLocation: encounter / chapter / settings views', () => {
  assert.deepEqual(parseLocation('?campaign=C1&encounter=E9'), {
    campaignId: 'C1',
    view: { kind: 'encounter', encounterId: 'E9' },
  })
  assert.deepEqual(parseLocation('?campaign=C1&chapter=H3'), {
    campaignId: 'C1',
    view: { kind: 'chapter', chapterId: 'H3' },
  })
  assert.deepEqual(parseLocation('?campaign=C1&view=settings'), {
    campaignId: 'C1',
    view: { kind: 'campaign' },
  })
})

test('parseLocation: encounter wins over chapter when both present (defensive)', () => {
  assert.deepEqual(parseLocation('?campaign=C1&encounter=E9&chapter=H3').view, {
    kind: 'encounter',
    encounterId: 'E9',
  })
})

test('parseLocation tolerates a leading location.search with "?"', () => {
  assert.equal(parseLocation('?campaign=C1').campaignId, 'C1')
})

test('locationFor: root when no campaign', () => {
  assert.equal(locationFor(null, { kind: 'empty' }), '')
  assert.equal(locationFor(undefined), '')
})

test('locationFor encodes each view kind', () => {
  assert.equal(locationFor('C1', { kind: 'empty' }), 'campaign=C1')
  assert.equal(locationFor('C1', { kind: 'encounter', enc: { id: 'E9' } }), 'campaign=C1&encounter=E9')
  assert.equal(locationFor('C1', { kind: 'chapter', chapter: { id: 'H3' } }), 'campaign=C1&chapter=H3')
  assert.equal(locationFor('C1', { kind: 'campaign' }), 'campaign=C1&view=settings')
})

test('locationFor falls back to campaign-only when the view id is missing', () => {
  assert.equal(locationFor('C1', { kind: 'encounter', enc: {} }), 'campaign=C1')
  assert.equal(locationFor('C1', { kind: 'chapter' }), 'campaign=C1')
})

test('urlFor builds the path+query (root or ?…)', () => {
  assert.equal(urlFor(null, { kind: 'empty' }), '/')
  assert.equal(urlFor('C1', { kind: 'encounter', enc: { id: 'E9' } }), '/?campaign=C1&encounter=E9')
})

test('round-trip: locationFor → parseLocation preserves the nav target', () => {
  const cases = [
    ['C1', { kind: 'empty' }, { kind: 'empty' }],
    ['C1', { kind: 'campaign' }, { kind: 'campaign' }],
    ['C1', { kind: 'encounter', enc: { id: 'E9' } }, { kind: 'encounter', encounterId: 'E9' }],
    ['C1', { kind: 'chapter', chapter: { id: 'H3' } }, { kind: 'chapter', chapterId: 'H3' }],
  ]
  for (const [cid, view, expectedView] of cases) {
    const parsed = parseLocation('?' + locationFor(cid, view))
    assert.equal(parsed.campaignId, cid)
    assert.deepEqual(parsed.view, expectedView)
  }
})

test('ids are URL-encoded/decoded (uuids with reserved chars survive)', () => {
  const id = 'a b/c?d'
  const q = locationFor(id, { kind: 'empty' })
  assert.equal(parseLocation('?' + q).campaignId, id)
})
