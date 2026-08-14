import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import TreasureRollup from './TreasureRollup.jsx'

afterEach(() => cleanup())

const base = {
  totalCp: 0, totalTargetCp: 0, totalXp: 0, rows: [],
  anyIncomplete: false, loading: false, failedCount: 0, onRetry: () => {},
}
const secondaryOf = (r) => r.secondary

test('TreasureRollup shows loot over/under the target and the total XP', () => {
  const rollup = {
    ...base, totalCp: 5000, totalTargetCp: 3500, totalXp: 160,
    rows: [{ id: 'e1', name: 'A', secondary: 'Severe', cp: 5000, targetCp: 3500, incomplete: false }],
  }
  render(<TreasureRollup rollup={rollup} title="Chapter treasure" secondaryLabel="Difficulty" secondaryOf={secondaryOf} />)
  assert.equal(screen.getByTestId('rollup-total').textContent, '50 gp')
  assert.match(screen.getByTestId('rollup-delta').textContent, /over/) // 50 gp > 35 gp target
  assert.match(screen.getByTestId('rollup-xp').textContent, /160 XP/)
})

test('TreasureRollup reads "under" when loot is below the target', () => {
  const rollup = { ...base, totalCp: 1000, totalTargetCp: 3500, rows: [{ id: 'e1', name: 'A', secondary: 'x', cp: 1000, targetCp: 3500, incomplete: false }] }
  render(<TreasureRollup rollup={rollup} title="T" secondaryOf={secondaryOf} />)
  assert.match(screen.getByTestId('rollup-delta').textContent, /under/)
})

test('TreasureRollup marks a floor when a row is incomplete', () => {
  const rollup = {
    ...base, totalCp: 1000, totalTargetCp: 0, anyIncomplete: true,
    rows: [{ id: 'e1', name: 'A', secondary: 'Trivial', cp: 1000, targetCp: 0, incomplete: true }],
  }
  const { container } = render(<TreasureRollup rollup={rollup} title="T" secondaryOf={secondaryOf} />)
  assert.match(container.textContent, /\(floor\)/) // total is a floor
  assert.match(container.textContent, /10 gp\*/) // per-row asterisk
})

test('TreasureRollup collapses and expands when its title is clicked', () => {
  const rollup = { ...base, totalCp: 1000, rows: [{ id: 'e1', name: 'A', secondary: 'x', cp: 1000, targetCp: 0, incomplete: false }] }
  render(<TreasureRollup rollup={rollup} title="Chapter treasure" secondaryOf={secondaryOf} />)
  const title = screen.getByRole('button', { name: /Chapter treasure/ })
  assert.ok(screen.getByTestId('rollup-total'))
  fireEvent.click(title)
  assert.equal(screen.queryByTestId('rollup-total'), null) // collapsed hides the body
  fireEvent.click(title)
  assert.ok(screen.getByTestId('rollup-total')) // expands again
})

test('TreasureRollup shows the empty label, and the load-error alert over it', () => {
  const { rerender } = render(<TreasureRollup rollup={base} title="T" secondaryOf={secondaryOf} emptyLabel="Nothing yet." />)
  assert.equal(screen.getByTestId('rollup-empty').textContent, 'Nothing yet.')
  rerender(<TreasureRollup rollup={base} title="T" secondaryOf={secondaryOf} loadError onReload={() => {}} />)
  assert.ok(screen.getByTestId('rollup-load-error'))
  assert.equal(screen.queryByTestId('rollup-empty'), null) // load error wins over the empty label
})
