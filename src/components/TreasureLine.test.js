import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import TreasureLine from './TreasureLine.jsx'

afterEach(() => cleanup())

const custom = { ref: { json: { name: 'shortsword', custom: true, price_cp: 900 } }, qty: 1 }
const creatures = [{ key: 'm1:1', label: 'Mitflit #1' }, { key: 'm1:2', label: 'Mitflit #2' }]

test('TreasureLine: the from select names the carrying creature (77l2)', () => {
  let last
  render(<TreasureLine treasure={custom} creatures={creatures} onChange={(t) => (last = t)} onRemove={() => {}} />)
  const from = screen.getByLabelText('from')
  assert.deepEqual([...from.options].map((o) => o.textContent), ['from: —', 'from: Mitflit #1', 'from: Mitflit #2'])
  fireEvent.change(from, { target: { value: 'm1:2' } })
  assert.equal(last.from_creature, 'm1:2')
  fireEvent.change(from, { target: { value: '' } })
  assert.equal(last.from_creature, undefined)
})

test('TreasureLine: a removed source creature is flagged', () => {
  render(<TreasureLine treasure={{ ...custom, from_creature: 'm1:3' }} creatures={creatures} onChange={() => {}} onRemove={() => {}} />)
  assert.match(screen.getByTestId('from-dangling').textContent, /source creature removed/)
  assert.equal(screen.getByLabelText('from').value, 'm1:3')
})

test('TreasureLine: no from select in a room without monsters', () => {
  render(<TreasureLine treasure={custom} creatures={[]} onChange={() => {}} onRemove={() => {}} />)
  assert.equal(screen.queryByLabelText('from'), null)
})
