import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preprocessWikiLinks, wikiTargetId } from './wikiLinks.js'

const encounters = [
  { id: 9, name: 'A9. Walkway' },
  { id: 12, name: 'The Mushroom-Eyed People' },
]

test('preprocessWikiLinks rewrites a matching [[Name]] into a sentinel markdown link', () => {
  const out = preprocessWikiLinks('Go to [[A9. Walkway]] then talk.', encounters)
  assert.equal(out, 'Go to [A9. Walkway](#eb-encounter-9) then talk.')
})

test('preprocessWikiLinks is case-insensitive and trims', () => {
  assert.equal(preprocessWikiLinks('[[  the mushroom-eyed people  ]]', encounters), '[the mushroom-eyed people](#eb-encounter-12)')
})

test('preprocessWikiLinks leaves an unmatched link as plain text (brackets stripped)', () => {
  assert.equal(preprocessWikiLinks('See [[Nowhere Room]].', encounters), 'See Nowhere Room.')
})

test('preprocessWikiLinks handles multiple links + tolerates empty', () => {
  assert.equal(
    preprocessWikiLinks('[[A9. Walkway]] and [[The Mushroom-Eyed People]]', encounters),
    '[A9. Walkway](#eb-encounter-9) and [The Mushroom-Eyed People](#eb-encounter-12)',
  )
  assert.equal(preprocessWikiLinks('', encounters), '')
  assert.equal(preprocessWikiLinks('plain', []), 'plain')
})

test('wikiTargetId extracts the encounter id, and ignores other links', () => {
  assert.equal(wikiTargetId('#eb-encounter-9'), '9')
  assert.equal(wikiTargetId('https://example.com'), null)
  assert.equal(wikiTargetId('#other'), null)
  assert.equal(wikiTargetId(''), null)
})
