import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import TreasurePackage from './TreasurePackage.jsx'
import { contentInput, treasureMoving } from '../model.js'

afterEach(() => cleanup())

const entries = { 'Items:1': { name: 'Dart' }, 'Items:2': { name: 'Idol' } }
const entryOf = (id) => entries[id] || null
const content = [
  { id: 't1', type: 'treasure', treasure: { ref: { game_id: 'Items:1' }, qty: 30, state: 'intact' } },
  { id: 'c1', type: 'coin', coin: { gp: 5 } },
  { id: 'p1', type: 'pool', pool: { name: 'Altar', gate: { skill: 'Perception', dc: 18 } } },
  { id: 't2', type: 'treasure', treasure: { ref: { game_id: 'Items:2' }, qty: 1, state: 'intact' } },
  { id: 'c2', type: 'coin', coin: { gp: 50 } },
]

// Renders the package and returns a getter for the content the last onChange sent.
function setup(c = content) {
  let last = c
  const utils = render(
    <TreasurePackage content={c} entryOf={entryOf} onChange={(n) => (last = n)} onRelease={() => {}} />,
  )
  return { ...utils, last: () => last }
}

test('treasureMoving mirrors the API: qty_moving capped, else intact=all, pruned=none', () => {
  assert.equal(treasureMoving({ qty: 3 }), 3)
  assert.equal(treasureMoving({ qty: 3, state: 'consumed' }), 0)
  assert.equal(treasureMoving({ qty: 30, state: 'destroyed', qty_moving: 18 }), 18)
  assert.equal(treasureMoving({ qty: 2, qty_moving: 9 }), 2)
})

test('partial qty needs a reason + note before Release is enabled', () => {
  const s = setup()
  fireEvent.change(screen.getByLabelText('Dart moving'), { target: { value: '18' } })
  const t1 = s.last().find((c) => c.id === 't1').treasure
  assert.equal(t1.qty_moving, 18)
  cleanup()
  const withShort = content.map((c) => (c.id === 't1' ? { ...c, treasure: { ...t1 } } : c))
  setup(withShort)
  assert.match(screen.getByTestId('package-todo').textContent, /1 exclusion needs/)
  assert.equal(screen.getByRole('button', { name: /Release to party/ }).disabled, true)
  cleanup()
  const reasoned = content.map((c) =>
    c.id === 't1' ? { ...c, treasure: { ...t1, state: 'destroyed', state_note: '12 broke' } } : c,
  )
  setup(reasoned)
  assert.equal(screen.queryByTestId('package-todo'), null)
  assert.equal(screen.getByRole('button', { name: /Release to party/ }).disabled, false)
})

test('raising qty back to full clears the exclusion', () => {
  const short = content.map((c) =>
    c.id === 't1' ? { ...c, treasure: { ...c.treasure, qty_moving: 18, state: 'destroyed', state_note: 'x' } } : c,
  )
  const s = setup(short)
  fireEvent.change(screen.getByLabelText('Dart moving'), { target: { value: '30' } })
  const t1 = s.last().find((c) => c.id === 't1').treasure
  assert.equal(t1.qty_moving, undefined)
  assert.equal(t1.state, 'intact')
})

test('an unfound gated pool leaves its loot + coin behind and totals coins moving vs excluded', () => {
  const unfound = content.map((c) => (c.id === 'p1' ? { ...c, pool: { ...c.pool, not_found: true } } : c))
  setup(unfound)
  assert.equal(screen.getByLabelText('Idol moving').value, '0')
  assert.equal(screen.getByLabelText('Idol moving').disabled, true)
  assert.match(screen.getByTestId('package-coins').textContent, /5 gp moving · 50 gp excluded/)
  assert.equal(screen.queryByTestId('package-todo'), null) // pool-not-found needs no per-line note
})

test('the found toggle and coin exclusion write not_found / coin state, and contentInput keeps them', () => {
  const s = setup()
  fireEvent.click(screen.getByLabelText('Altar found'))
  let next = s.last()
  assert.equal(next.find((c) => c.id === 'p1').pool.not_found, true)
  cleanup()
  const s2 = setup()
  fireEvent.click(screen.getByLabelText('5 gp moving'))
  next = s2.last()
  const coin = next.find((c) => c.id === 'c1').coin
  assert.equal(coin.state, 'consumed')
  const sent = contentInput({ content: [...next.filter((c) => c.id !== 'p1'), { id: 'p1', type: 'pool', pool: { name: 'Altar', gate: { skill: 'Perception', dc: 18 }, not_found: true } }] })
  assert.deepEqual(sent.find((c) => c.id === 'c1').coin, { gp: 5, state: 'consumed' })
  assert.equal(sent.find((c) => c.id === 'p1').pool.not_found, true)
})

// 77l2: each creature is a treasure source.
const mitflits = [
  { id: 'm1', type: 'monster', monster: { ref: { game_id: 'Monsters:1' }, count: 2, nickname: 'Mitflit' } },
  { id: 's1', type: 'treasure', treasure: { ref: { game_id: 'Items:1' }, qty: 1, from_creature: 'm1:1' } },
  { id: 's2', type: 'treasure', treasure: { ref: { game_id: 'Items:2' }, qty: 1, from_creature: 'm1:2' } },
  { id: 'gone', type: 'treasure', treasure: { ref: { game_id: 'Items:1' }, qty: 4, from_creature: 'm1:9' } },
]

test('gear of a creature not killed stays behind without a note; a killed one moves', () => {
  let last = mitflits
  render(
    <TreasurePackage content={mitflits} entryOf={entryOf} kills={{ 'm1:1': { killed: true } }} onChange={(n) => (last = n)} onRelease={() => {}} />,
  )
  const items = screen.getAllByTestId('package-item')
  assert.equal(items[0].querySelector('input').value, '1') // Mitflit #1 killed
  assert.equal(items[1].querySelector('input').value, '0') // Mitflit #2 alive
  assert.match(screen.getByTestId('package-not-killed').textContent, /Mitflit #2 not killed/)
  assert.equal(items[2].querySelector('input').value, '4') // dangling source: ordinary treasure
  assert.equal(screen.queryByTestId('package-todo'), null) // the default needs no note
  assert.equal(screen.getByRole('button', { name: 'Release to party' }).disabled, false)

  // The GM can still send it: an explicit qty_moving overrides the default.
  fireEvent.change(items[1].querySelector('input'), { target: { value: '1' } })
  assert.equal(last.find((c) => c.id === 's2').treasure.qty_moving, 1)
})

test('setting not-killed gear back to 0 returns it to the live default', () => {
  let last
  const c = mitflits.map((x) => (x.id === 's2' ? { ...x, treasure: { ...x.treasure, qty_moving: 1 } } : x))
  render(<TreasurePackage content={c} entryOf={entryOf} kills={{}} onChange={(n) => (last = n)} onRelease={() => {}} />)
  fireEvent.change(screen.getAllByTestId('package-item')[1].querySelector('input'), { target: { value: '0' } })
  assert.equal(last.find((x) => x.id === 's2').treasure.qty_moving, undefined)
})
