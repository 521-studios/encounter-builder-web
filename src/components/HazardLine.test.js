import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup } from '@testing-library/react'
import HazardLine from './HazardLine.jsx'

afterEach(() => cleanup())

// A hazard's full entry is flat under `hazard` (not stat_block) — level lives there.
const entry = { name: 'Web Lurker Noose', hazard: { level: 2, complexity: 'Complex' } }
const entryOf = (id) => (id === 'Hazards:1' ? entry : null)
const noop = () => {}

test('HazardLine renders the hazard header (name+count / HAZARD level)', () => {
  const hazard = { ref: { game_id: 'Hazards:1' }, count: 2, nickname: '' }
  const { container } = render(<HazardLine hazard={hazard} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.match(container.textContent, /Web Lurker Noose \(2\)/)
  assert.equal(screen.getByTestId('hazard-header-level').textContent, 'HAZARD 2')
})

test('HazardLine omits "(1)" for a single hazard', () => {
  const hazard = { ref: { game_id: 'Hazards:1' }, count: 1, nickname: '' }
  const { container } = render(<HazardLine hazard={hazard} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.doesNotMatch(container.textContent, /\(1\)/)
})

test('HazardLine shows the search picker (no header) when no hazard is chosen', () => {
  const hazard = { ref: { game_id: '' }, count: 1, nickname: '' }
  const { container } = render(<HazardLine hazard={hazard} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.equal(screen.queryByTestId('hazard-header'), null)
  assert.ok(container.querySelector('.hazard-search'))
})
