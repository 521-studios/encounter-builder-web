import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import MarkdownBlock from './MarkdownBlock.jsx'

afterEach(() => cleanup())
const noop = () => {}

test('MarkdownBlock preview shows the rendered body + an Edit button that calls onEdit', () => {
  let edited = false
  const { container } = render(
    <MarkdownBlock block={{ title: 'Tactics', body: 'they flee' }} editing={false} ariaLabel="challenge section" siblings={[]} onSet={noop} onEdit={() => (edited = true)} onDone={noop} onRemove={noop} />,
  )
  assert.match(container.textContent, /they flee/)
  fireEvent.click(screen.getByRole('button', { name: 'edit challenge section' }))
  assert.ok(edited)
})

test('MarkdownBlock edit mode exposes title/body inputs; typing calls onSet', () => {
  let set = null
  render(
    <MarkdownBlock block={{ title: '', body: '' }} editing ariaLabel="challenge section" siblings={[]} onSet={(f) => (set = f)} onEdit={noop} onDone={noop} onRemove={noop} />,
  )
  fireEvent.change(screen.getByLabelText('challenge section body'), { target: { value: 'x' } })
  assert.deepEqual(set, { body: 'x' })
})

test('MarkdownBlock renders an empty section placeholder when there is no body', () => {
  const { container } = render(
    <MarkdownBlock block={{ title: '', body: '' }} editing={false} ariaLabel="challenge section" siblings={[]} onSet={noop} onEdit={noop} onDone={noop} onRemove={noop} />,
  )
  assert.match(container.textContent, /\(empty section\)/)
})

test('MarkdownBlock released is preview-only: no edit/remove affordance', () => {
  render(
    <MarkdownBlock block={{ body: 'z' }} editing released ariaLabel="challenge section" siblings={[]} onSet={noop} onEdit={noop} onDone={noop} onRemove={noop} />,
  )
  assert.equal(screen.queryByRole('button', { name: 'edit challenge section' }), null)
  assert.equal(screen.queryByRole('button', { name: 'remove challenge section' }), null)
})
