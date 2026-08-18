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

// The map is now a React Flow canvas: node/edge layout needs real DOM dimensions
// (absent in jsdom), so the graph structure itself is covered by chapterGraph.test.js.
// Here we assert the component's own chrome: the connectivity stats, the collapse
// toggle, the canvas + legend presence, and the empty state.

test('ChapterMap: the title reports rooms / connections / loops from the graph', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.match(screen.getByText(/Map —/).textContent, /4 rooms · 4 connections · 1 loop/)
})

test('ChapterMap: renders the canvas + exit legend when rooms are linked', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.ok(screen.getByTestId('map-canvas'))
  // The legend spells out that the lines are exits (the "no indication" fix).
  assert.match(screen.getByText(/Lines are/).textContent, /exits/)
})

test('ChapterMap: the title collapses and expands the canvas', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  const toggle = screen.getByRole('button', { name: /Map —/ })
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.ok(screen.getByTestId('map-canvas'))
  fireEvent.click(toggle)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(screen.queryByTestId('map-canvas'), null) // canvas hidden when collapsed
})

test('ChapterMap: no linked exits shows a hint, not an empty canvas', () => {
  render(<ChapterMap encounters={[{ id: 1, name: 'Lone', exits: [] }]} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByTestId('map-canvas'), null)
  assert.match(screen.getByText(/No exits linked/).textContent, /add Exits/)
})
