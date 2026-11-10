import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { reorderById } from '../model.js'
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
  fireEvent.keyDown(handles[1], { key: 'ArrowUp', altKey: true })
  fireEvent.keyDown(handles[1], { key: 'ArrowDown', ctrlKey: true })
  assert.deepEqual(moves, [])
})

// A handled arrow must not also scroll the page, and an ignored one must.
test('EncounterContent: a handled arrow prevents the default scroll', () => {
  mount()
  const handles = screen.getAllByRole('button', { name: /reorder/ })
  assert.equal(fireEvent.keyDown(handles[1], { key: 'ArrowUp' }), false) // false = default prevented
  assert.equal(fireEvent.keyDown(handles[0], { key: 'ArrowUp' }), true) // at the top: not handled
})

// Moving a row re-orders the DOM, which drops focus; it must land back on the moved row.
test('EncounterContent: focus follows the moved row', async () => {
  function Harness() {
    const [list, setList] = useState(content)
    return (
      <EncounterContent
        content={list}
        entryOf={() => null}
        released={false}
        siblings={[]}
        onOpenEncounter={() => {}}
        onSetItem={() => {}}
        onAdd={() => {}}
        onRemove={() => {}}
        onReorder={(from, to) => {
          // Browsers drop focus when a focused node is moved (insertBefore). jsdom
          // doesn't, so drop it here the way a browser would.
          document.activeElement?.blur()
          setList((l) => reorderById(l, from, to))
        }}
      />
    )
  }
  render(<Harness />)
  const b = document.querySelector('#content-item-b .drag-handle')
  b.focus()
  fireEvent.keyDown(b, { key: 'ArrowDown' })
  await new Promise((r) => requestAnimationFrame(r))
  assert.deepEqual([...document.querySelectorAll('.challenge-row')].map((r) => r.id), ['content-item-a', 'content-item-c', 'content-item-b'])
  assert.equal(document.activeElement, document.querySelector('#content-item-b .drag-handle'))
})

test('EncounterContent: a released encounter has no reorder handles', () => {
  mount({ released: true })
  assert.equal(screen.queryAllByRole('button', { name: /reorder/ }).length, 0)
})
