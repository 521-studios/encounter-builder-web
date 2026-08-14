import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup } from '@testing-library/react'
import MonsterLine from './MonsterLine.jsx'

afterEach(() => cleanup())

const entry = {
  name: 'Goblin Warrior',
  sources: [{ name: 'Bestiary', page: 192 }],
  stat_block: {
    creature_type: { level: -1 },
    sources: [{ name: 'Bestiary', page: 192 }],
    senses: { perception: { value: 5 } },
  },
}
const entryOf = (id) => (id === 'Monsters:1' ? entry : null)
const noop = () => {}

test('MonsterLine renders the book-style creature header (name+count / CREATURE level / source / initiative)', () => {
  const monster = { ref: { game_id: 'Monsters:1' }, count: 3, nickname: '', adjustment: 'none' }
  const { container } = render(<MonsterLine monster={monster} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.match(container.textContent, /Goblin Warrior \(3\)/)
  assert.equal(screen.getByTestId('monster-header-level').textContent, 'CREATURE -1')
  assert.match(screen.getByTestId('monster-header-init').textContent, /Initiative Perception \+5/)
  assert.match(container.textContent, /Bestiary 192/) // source book + page
})

test('MonsterLine omits "(1)" for a single creature and shifts level for elite', () => {
  const monster = { ref: { game_id: 'Monsters:1' }, count: 1, nickname: '', adjustment: 'elite' }
  const { container } = render(<MonsterLine monster={monster} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.doesNotMatch(container.textContent, /\(1\)/)
  assert.equal(screen.getByTestId('monster-header-level').textContent, 'CREATURE 0') // -1 + elite(+1)
})

test('MonsterLine shows the search picker (no header) when no monster is chosen', () => {
  const monster = { ref: { game_id: '' }, count: 1, nickname: '', adjustment: 'none' }
  const { container } = render(<MonsterLine monster={monster} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.equal(screen.queryByTestId('monster-header'), null)
  assert.ok(container.querySelector('.monster-search'))
})
