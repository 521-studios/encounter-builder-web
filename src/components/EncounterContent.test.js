import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import EncounterContent from './EncounterContent.jsx'

afterEach(() => cleanup())

const content = ['a', 'b', 'c'].map((id) => ({ id, type: 'markdown', markdown: `text ${id}` }))

function mount(props = {}) {
  const moves = []
  render(
    <EncounterContent
      content={content}
      entryOf={() => null}
      released={false}
      siblings={[]}
      onOpenEncounter={() => {}}
      onSetItem={() => {}}
      onAdd={() => {}}
      onRemove={() => {}}
      onReorder={(from, to) => moves.push([from, to])}
      {...props}
    />,
  )
  return moves
}

// mfit: the drag handle is a keyboard reorder control too.
test('EncounterContent: arrow keys on a focused handle move the row up/down', () => {
  const moves = mount()
  const handles = screen.getAllByRole('button', { name: /reorder/ })
  assert.equal(handles.length, 3)
  assert.equal(handles[1].tabIndex, 0)
  fireEvent.keyDown(handles[1], { key: 'ArrowUp' })
  fireEvent.keyDown(handles[1], { key: 'ArrowDown' })
  assert.deepEqual(moves, [['b', 'a'], ['b', 'c']])
})

test('EncounterContent: arrows at the ends and other keys do nothing', () => {
  const moves = mount()
  const handles = screen.getAllByRole('button', { name: /reorder/ })
  fireEvent.keyDown(handles[0], { key: 'ArrowUp' })
  fireEvent.keyDown(handles[2], { key: 'ArrowDown' })
  fireEvent.keyDown(handles[1], { key: 'Enter' })
  assert.deepEqual(moves, [])
})

test('EncounterContent: a released encounter has no reorder handles', () => {
  mount({ released: true })
  assert.equal(screen.queryAllByRole('button', { name: /reorder/ }).length, 0)
})
