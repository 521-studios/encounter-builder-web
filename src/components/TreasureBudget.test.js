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

test('TreasureBudget shows the canonical 4-PC band + normalized XP when the table is not 4 PCs', () => {
  // A1 scenario: 60 XP reads Trivial for a 6-PC table but Low at the 4-PC book standard.
  render(
    <TreasureBudget
      budget={budget({ xp: 60, threat: 'trivial', canonicalThreat: 'low', xpPer4: 40 })}
      partyLevel={1}
      partySize={6}
    />,
  )
  assert.equal(screen.getByTestId('encounter-threat').textContent, 'Trivial') // as-configured (6 PCs)
  const canon = screen.getByTestId('budget-canonical')
  assert.match(canon.textContent, /At 4 PCs \(book standard\)/)
  assert.equal(screen.getByTestId('canonical-threat').textContent, 'Low') // book-standard difficulty band
  assert.match(canon.textContent, /~40 XP award/) // party-size–normalized award (distinct from the band)
  assert.doesNotMatch(canon.textContent, /\(floor\)/) // complete → not a floor
})

test('TreasureBudget marks the canonical band a floor when monster XP is incomplete', () => {
  // An unreadable monster level floors the XP → the canonical band could understate,
  // so the lens must say so rather than present it as authoritative "book standard".
  render(
    <TreasureBudget
      budget={budget({ xp: 60, threat: 'trivial', canonicalThreat: 'low', xpPer4: 40, unknownCount: 1 })}
      partyLevel={1}
      partySize={6}
    />,
  )
  assert.match(screen.getByTestId('budget-canonical').textContent, /Low \(floor\)/)
})

test('TreasureBudget hides the canonical lens when the table IS 4 PCs (no redundancy)', () => {
  render(
    <TreasureBudget
      budget={budget({ xp: 60, threat: 'trivial', canonicalThreat: 'trivial', xpPer4: 60 })}
      partyLevel={1}
      partySize={4}
    />,
  )
  assert.equal(screen.queryByTestId('budget-canonical'), null)
})

test('TreasureBudget surfaces non-combat awards as advancement XP without moving the band', () => {
  // Combat XP 120 → Severe; a 30 XP non-combat award reads as advancement, not a bump.
  render(<TreasureBudget budget={budget({ awardXp: 30, totalXp: 150 })} partyLevel={5} partySize={4} />)
  assert.equal(screen.getByTestId('encounter-threat').textContent, 'Severe') // band still from combat XP
  assert.equal(screen.getByTestId('award-xp').textContent, ' + 30 non-combat = 150 XP total')
})

test('TreasureBudget hides the award line when there are no awards (default awardXp 0)', () => {
  render(<TreasureBudget budget={budget()} partyLevel={5} partySize={4} />)
  assert.equal(screen.queryByTestId('award-xp'), null)
})

test('TreasureBudget surfaces a load failure with Retry', () => {
  render(<TreasureBudget budget={budget({ cp: 1000, failedCount: 2 })} partyLevel={5} partySize={4} />)
  assert.match(screen.getByTestId('budget-error').textContent, /failed to load/)
  assert.ok(screen.getByRole('button', { name: /Retry/ }))
})
