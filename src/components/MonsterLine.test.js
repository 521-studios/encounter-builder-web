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

// bd_521Studios-t04v: a templated monster carries its resolved creature in ref.json.
// gameIdsInEncounter skips derived refs, so entryOf(base) is null — the line must read
// the snapshot (name + header) rather than showing "Loading…" forever or falling back
// to the raw game_id. Base game_id 'Monsters:99' is absent from entryOf to simulate the
// un-prefetched base.
test('MonsterLine reads a templated monster from its ref.json snapshot (no Loading…, snapshot name + level)', () => {
  const monster = {
    ref: {
      base: { game_id: 'Monsters:99' },
      modifications: [{ template_game_id: 'elite', template_name: 'Elite' }],
      json: {
        name: 'Elite Goblin Warrior',
        stat_block: { creature_type: { level: 2 }, senses: { perception: { value: 5 } } },
      },
    },
    count: 1,
    nickname: '',
    adjustment: 'none',
  }
  const { container } = render(<MonsterLine monster={monster} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.doesNotMatch(container.textContent, /Loading…/) // snapshot present → not loading
  assert.match(container.textContent, /Elite Goblin Warrior/) // name from snapshot, not raw game_id
  assert.doesNotMatch(container.textContent, /Monsters:99/) // never the raw base game_id
  assert.equal(screen.getByTestId('monster-header-level').textContent, 'CREATURE 2') // snapshot level
})

test('MonsterLine still shows Loading… for a pristine ref whose base entry has not loaded', () => {
  const monster = { ref: { game_id: 'Monsters:99' }, count: 1, nickname: '', adjustment: 'none' }
  const { container } = render(<MonsterLine monster={monster} entryOf={entryOf} onChange={noop} onRemove={noop} />)
  assert.match(container.textContent, /Loading…/) // no entry, no snapshot → genuinely loading
})
