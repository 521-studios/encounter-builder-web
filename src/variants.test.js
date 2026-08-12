import { test } from 'node:test'
import assert from 'node:assert/strict'
import { variantIndex } from './variants.js'

const variants = [
  { name: 'Striking' },
  { name: 'Striking (Greater)' },
  { name: 'Striking (Major)' },
]

test('variantIndex resolves a known name to its index', () => {
  assert.equal(variantIndex(variants, 'Striking (Greater)'), 1)
  assert.equal(variantIndex(variants, 'Striking (Major)'), 2)
})

test('variantIndex falls back to 0 (base) for empty, unknown, or missing input', () => {
  assert.equal(variantIndex(variants, ''), 0)
  assert.equal(variantIndex(variants, undefined), 0)
  assert.equal(variantIndex(variants, 'Nonexistent'), 0)
  assert.equal(variantIndex([], 'Striking'), 0)
  assert.equal(variantIndex(undefined, 'Striking'), 0)
})
