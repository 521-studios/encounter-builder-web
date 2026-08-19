import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abilityLabel } from './useSkills.js'

test('abilityLabel capitalizes the 3-letter attribute; empty for none', () => {
  assert.equal(abilityLabel('dex'), 'Dex')
  assert.equal(abilityLabel('wis'), 'Wis')
  assert.equal(abilityLabel(''), '')
  assert.equal(abilityLabel(undefined), '')
})
