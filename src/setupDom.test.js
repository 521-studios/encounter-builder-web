import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen } from '@testing-library/react'

// test/support/setup-dom.mjs keeps a failing assert on a DOM node from deep-inspecting
// React's fiber graph (that ran ares out of memory). Without the guard, these messages
// would be inspect() dumps, not the node's outerHTML.
test('a failing assert on a rendered DOM node reports its outerHTML', () => {
  render(<button type="button">Go</button>)
  const b = screen.getByRole('button')
  assert.throws(() => assert.equal(b, null), { message: `'<button type="button">Go</button>' equal 'null'` })
  assert.throws(() => assert.notEqual(b, b), { name: 'AssertionError' })
  assert.throws(() => assert.deepEqual(b, null, 'custom'), { message: 'custom' })
  assert.equal(b, b)
  assert.notEqual(b, null)
})
