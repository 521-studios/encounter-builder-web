import { test } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen } from '@testing-library/react'

test('a failing assert on a rendered DOM node reports its outerHTML', () => {
  render(<button type="button">Go</button>)
  const b = screen.getByRole('button')
  const short = (e) => e.message.includes('<button type="button">Go</button>') && e.message.length < 300
  for (const name of ['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual']) {
    assert.throws(() => assert[name](b, null), short)
    assert.throws(() => assert[name](null, b), short)
    assert[name](b, b)
  }
  for (const name of ['notEqual', 'notStrictEqual', 'notDeepEqual', 'notDeepStrictEqual']) {
    assert.throws(() => assert[name](b, b), short)
    assert[name](b, null)
  }
  assert.deepEqual(document.createElement('i'), document.createElement('i')) // deep, not identity
  assert.throws(() => assert.equal(b, null, new TypeError('mine')), TypeError)
  assert.throws(() => assert.equal(b, null, 'custom'), { message: 'custom' })
})

test('asserts without a DOM node still compare', () => {
  assert.throws(() => assert.equal(1, 2), { name: 'AssertionError' })
  assert.throws(() => assert.deepEqual({ a: 1 }, { a: 2 }), { name: 'AssertionError' })
  assert.throws(() => assert.notEqual(1, 1), { name: 'AssertionError' })
})
