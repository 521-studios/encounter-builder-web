import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import WikiMarkdown from './WikiMarkdown.jsx'

afterEach(() => cleanup())

const encounters = [{ id: 9, name: 'A9. Walkway' }]

test('WikiMarkdown renders a resolved [[link]] as a clickable link that opens the encounter', () => {
  const opened = []
  render(
    <WikiMarkdown text="Cross to [[A9. Walkway]] now." encounters={encounters} onOpenEncounter={(id) => opened.push(id)} />,
  )
  const link = screen.getByRole('link', { name: 'A9. Walkway' })
  assert.ok(link)
  fireEvent.click(link)
  assert.deepEqual(opened, ['9']) // delegated click resolved the sentinel href
})

test('WikiMarkdown renders an unresolved [[link]] as plain text, not a link', () => {
  render(<WikiMarkdown text="See [[Nowhere]]." encounters={encounters} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByRole('link'), null)
  assert.match(screen.getByTestId('wiki-markdown').textContent, /See Nowhere\./)
})

test('WikiMarkdown does not hijack an ordinary markdown link', () => {
  const opened = []
  render(<WikiMarkdown text="[docs](https://example.com)" encounters={encounters} onOpenEncounter={(id) => opened.push(id)} />)
  const link = screen.getByRole('link', { name: 'docs' })
  const notPrevented = fireEvent.click(link) // false only if a handler called preventDefault
  assert.equal(opened.length, 0) // a normal link never triggers encounter navigation
  assert.equal(notPrevented, true) // default navigation left intact
})
