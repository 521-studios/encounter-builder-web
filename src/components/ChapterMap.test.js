import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ChapterMap from './ChapterMap.jsx'

afterEach(() => cleanup())

const chapter = [
  { id: 1, name: 'A1', room_type: 'combat', exits: [{ to_encounter_id: '2', label: 'door' }, { to_encounter_id: '3' }] },
  { id: 2, name: 'A2', room_type: 'hazard', exits: [{ to_encounter_id: '1' }] }, // 1↔2 loop
  { id: 3, name: 'A3', room_type: 'knowledge', exits: [] }, // spur off A1 → dead-end
]

test('ChapterMap renders a node per encounter and an edge per intra-chapter exit', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.equal(screen.getAllByTestId('map-node').length, 3)
  assert.equal(screen.getAllByTestId('map-edge').length, 3) // 1→2, 1→3, 2→1
  assert.match(screen.getByText(/Map —/).textContent, /3 rooms · 3 connections · 1 loop/)
})

test('ChapterMap marks a dead-end room', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  const deadEnds = screen.getAllByTestId('map-node').filter((n) => n.getAttribute('data-dead-end'))
  assert.equal(deadEnds.length, 1) // only A3
})

test('ChapterMap: clicking a node opens that encounter', () => {
  const opened = []
  render(<ChapterMap encounters={chapter} onOpenEncounter={(id) => opened.push(id)} />)
  fireEvent.click(screen.getByLabelText('Open A2'))
  assert.deepEqual(opened, ['2'])
})

test('ChapterMap: no linked exits shows a hint, not an empty SVG', () => {
  render(<ChapterMap encounters={[{ id: 1, name: 'Lone', exits: [] }]} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByTestId('map-svg'), null)
  assert.match(screen.getByText(/No exits linked/).textContent, /add Exits/)
})
