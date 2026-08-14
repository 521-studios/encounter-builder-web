import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup } from '@testing-library/react'
import TreasureBudget from './TreasureBudget.jsx'

afterEach(() => cleanup())

// A severe-band budget at party level 5 / 4 PCs → Table 5-3 target = 200 gp.
const budget = (over) => ({
  cp: 0, xp: 120, threat: 'severe', loading: false,
  unpricedCount: 0, unknownCount: 0, failedCount: 0, onRetry: () => {}, ...over,
})

test('TreasureBudget marks loot OVER the Table 5-3 target (✓)', () => {
  render(<TreasureBudget budget={budget({ cp: 25000 })} partyLevel={5} partySize={4} />)
  assert.equal(screen.getByTestId('encounter-threat').textContent, 'Severe')
  assert.equal(screen.getByTestId('treasure-value').textContent, '250 gp')
  assert.match(screen.getByTestId('treasure-delta').textContent, /over the Severe target/)
  assert.match(document.querySelector('td[data-band="severe"]').textContent, /✓/)
})

test('TreasureBudget marks a complete value UNDER target (▲)', () => {
  render(<TreasureBudget budget={budget({ cp: 1000 })} partyLevel={5} partySize={4} />)
  assert.match(screen.getByTestId('treasure-delta').textContent, /under the Severe target/)
  assert.match(document.querySelector('td[data-band="severe"]').textContent, /▲/)
})

test('TreasureBudget flags a floor when a line is unpriced and never claims "under"', () => {
  render(<TreasureBudget budget={budget({ cp: 1000, unpricedCount: 1 })} partyLevel={5} partySize={4} />)
  assert.match(screen.getByTestId('treasure-value').parentElement.textContent, /\(floor\)/)
  assert.match(screen.getByTestId('treasure-delta').textContent, /not yet met/) // never "under" on a floor
  assert.match(screen.getByTestId('budget-flags').textContent, /not valued/)
})

test('TreasureBudget surfaces a load failure with Retry', () => {
  render(<TreasureBudget budget={budget({ cp: 1000, failedCount: 2 })} partyLevel={5} partySize={4} />)
  assert.match(screen.getByTestId('budget-error').textContent, /failed to load/)
  assert.ok(screen.getByRole('button', { name: /Retry/ }))
})
