import { test } from 'node:test'
import assert from 'node:assert/strict'
import { treasureBudget, treasureTotalForLevel, creatureXp, budgetFor, encounterThreat, TREASURE_BY_LEVEL } from './pf2eRules.js'

test('treasureTotalForLevel returns the per-level total, party-scaled', () => {
  assert.equal(treasureTotalForLevel(5), 1350)
  assert.equal(treasureTotalForLevel(5, 6), Math.round((1350 * 6) / 4))
  assert.equal(treasureTotalForLevel(99), TREASURE_BY_LEVEL[20].total) // clamp
})

test('treasureBudget returns the Table 5-3 value for a 4-PC party', () => {
  assert.equal(treasureBudget(1, 'moderate'), 18)
  assert.equal(treasureBudget(6, 'severe'), 300)
  assert.equal(treasureBudget(20, 'extreme'), 98000)
})

test('treasureBudget scales linearly from 4 PCs', () => {
  assert.equal(treasureBudget(6, 'severe', 5), Math.round((300 * 5) / 4)) // 375
  assert.equal(treasureBudget(6, 'severe', 4), 300)
  assert.equal(treasureBudget(6, 'severe', 2), 150)
})

test('treasureBudget clamps out-of-range levels and rejects unknown bands', () => {
  assert.equal(treasureBudget(0, 'low'), TREASURE_BY_LEVEL[1].low)
  assert.equal(treasureBudget(99, 'low'), TREASURE_BY_LEVEL[20].low)
  assert.equal(treasureBudget(5, 'trivial'), null) // no Trivial treasure column
})

test('creatureXp maps level-relative-to-party via Table 10-2', () => {
  assert.equal(creatureXp(5, 5), 40) // party level = 40
  assert.equal(creatureXp(1, 5), 10) // PL-4
  assert.equal(creatureXp(9, 5), 160) // PL+4
})

test('creatureXp applies elite (+1) / weak (-1) before comparing', () => {
  assert.equal(creatureXp(4, 5, 'elite'), 40) // 4+1 = PL -> 40
  assert.equal(creatureXp(6, 5, 'weak'), 40) // 6-1 = PL -> 40
})

test('creatureXp is 0 below PL-4 and capped at PL+4 above', () => {
  assert.equal(creatureXp(0, 5), 0) // PL-5 -> negligible
  assert.equal(creatureXp(11, 5), 160) // PL+6 -> capped at PL+4 value
  assert.equal(creatureXp(null, 5), 0) // unknown level
})

test('budgetFor scales the Table 10-1 XP budget by party size', () => {
  assert.equal(budgetFor('moderate'), 80)
  assert.equal(budgetFor('moderate', 5), 80 + 20) // +1 PC * moderate adjust 20
  assert.equal(budgetFor('severe', 6), 120 + 30 * 2)
  assert.equal(budgetFor('extreme', 3), 160 - 40) // one fewer PC
})

test('encounterThreat classifies the XP sum into a band (4 PCs)', () => {
  assert.equal(encounterThreat(40), 'trivial') // below Low(60)
  assert.equal(encounterThreat(60), 'low')
  assert.equal(encounterThreat(80), 'moderate')
  assert.equal(encounterThreat(120), 'severe')
  assert.equal(encounterThreat(160), 'extreme')
  assert.equal(encounterThreat(300), 'extreme') // above Extreme still Extreme
  assert.equal(encounterThreat(10), 'trivial')
})

test('encounterThreat: an empty roster (0 XP) is Trivial, even for a small party', () => {
  assert.equal(encounterThreat(0), 'trivial')
  assert.equal(encounterThreat(0, 1), 'trivial') // solo: scaled Low budget rounds to 0
  assert.equal(encounterThreat(0, 6), 'trivial')
})

test('encounterThreat respects party-size scaling', () => {
  // For 5 PCs, Moderate budget is 100; 80 XP is now only Low (Low budget 80).
  assert.equal(encounterThreat(80, 5), 'low')
  assert.equal(encounterThreat(100, 5), 'moderate')
})
