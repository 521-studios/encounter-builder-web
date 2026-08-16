import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup } from '@testing-library/react'
import AfflictionLine from './AfflictionLine.jsx'

afterEach(() => cleanup())

// An affliction's full entry is flat under `affliction` (not stat_block) — the type and
// level live there. A disease with a numeric level → "Disease N"; a curse whose level is
// "Varies" → "Curse Varies" via level_text.
const disease = { name: 'Blueblisters', affliction: { affliction_type: 'disease', level: 3 } }
const varies = { name: 'Doom Curse', affliction: { affliction_type: 'curse', level_text: 'Varies' } }
const entryOf = (id) =>
  id === 'Diseases:1' ? disease : id === 'Curses:1' ? varies : null
const noop = () => {}

test('AfflictionLine renders the affliction header (name+count / Disease level)', () => {
  const affliction = { ref: { game_id: 'Diseases:1' }, count: 2 }
  const { container } = render(<AfflictionLine affliction={affliction} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.match(container.textContent, /Blueblisters \(2\)/)
  assert.equal(screen.getByTestId('affliction-header-level').textContent, 'Disease 3')
})

test('AfflictionLine uses level_text (e.g. Varies) when there is no numeric level', () => {
  const affliction = { ref: { game_id: 'Curses:1' }, count: 1 }
  render(<AfflictionLine affliction={affliction} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.equal(screen.getByTestId('affliction-header-level').textContent, 'Curse Varies')
})

test('AfflictionLine omits "(1)" for a single affliction', () => {
  const affliction = { ref: { game_id: 'Diseases:1' }, count: 1 }
  const { container } = render(<AfflictionLine affliction={affliction} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.doesNotMatch(container.textContent, /\(1\)/)
})

test('AfflictionLine shows the search picker (no header) when no affliction is chosen', () => {
  const affliction = { ref: { game_id: '' }, count: 1 }
  const { container } = render(<AfflictionLine affliction={affliction} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.equal(screen.queryByTestId('affliction-header'), null)
  assert.ok(container.querySelector('.affliction-search'))
})
