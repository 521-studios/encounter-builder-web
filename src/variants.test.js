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

test('variantIndex returns -1 (no version picked yet) for empty, unknown, or missing input', () => {
  assert.equal(variantIndex(variants, ''), -1)
  assert.equal(variantIndex(variants, undefined), -1)
  assert.equal(variantIndex(variants, 'Nonexistent'), -1)
  assert.equal(variantIndex([], 'Striking'), -1)
  assert.equal(variantIndex(undefined, 'Striking'), -1)
})
