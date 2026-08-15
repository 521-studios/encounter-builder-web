import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ChapterMap from './ChapterMap.jsx'

afterEach(() => cleanup())

// A1→A2→A3→A1 is a real (one-directional) loop; A4 hangs off A1 as a spur → dead-end.
const chapter = [
  { id: 1, name: 'A1', room_type: 'combat', exits: [{ to_encounter_id: '2', label: 'door' }, { to_encounter_id: '4' }] },
  { id: 2, name: 'A2', room_type: 'hazard', exits: [{ to_encounter_id: '3' }] },
  { id: 3, name: 'A3', room_type: 'knowledge', exits: [{ to_encounter_id: '1' }] },
  { id: 4, name: 'A4', room_type: 'empty', exits: [] },
]

test('ChapterMap renders a node per encounter and an edge per intra-chapter exit', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.equal(screen.getAllByTestId('map-node').length, 4)
  assert.equal(screen.getAllByTestId('map-edge').length, 4) // 1→2, 1→4, 2→3, 3→1
  assert.match(screen.getByText(/Map —/).textContent, /4 rooms · 4 connections · 1 loop/)
})

test('ChapterMap marks a dead-end room and highlights a loop edge', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  const deadEnds = screen.getAllByTestId('map-node').filter((n) => n.getAttribute('data-dead-end'))
  assert.equal(deadEnds.length, 1) // only A4
  const loopEdges = screen.getAllByTestId('map-edge').filter((e) => e.getAttribute('data-loop'))
  assert.equal(loopEdges.length, 1) // the loop-closing passage is highlighted
})

test('ChapterMap: clicking a node opens that encounter', () => {
  const opened = []
  render(<ChapterMap encounters={chapter} onOpenEncounter={(id) => opened.push(id)} />)
  fireEvent.click(screen.getByLabelText('Open A2'))
  assert.deepEqual(opened, ['2'])
})

test('ChapterMap: the title collapses and expands the graph', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  const toggle = screen.getByRole('button', { name: /Map —/ })
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.ok(screen.getByTestId('map-svg'))
  fireEvent.click(toggle)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(screen.queryByTestId('map-svg'), null) // graph hidden when collapsed
})

test('ChapterMap: no linked exits shows a hint, not an empty SVG', () => {
  render(<ChapterMap encounters={[{ id: 1, name: 'Lone', exits: [] }]} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByTestId('map-svg'), null)
  assert.match(screen.getByText(/No exits linked/).textContent, /add Exits/)
})
