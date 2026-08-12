import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage } from './errors.js'
import { ApiError } from './client.js'

test('errorMessage prefers the API body error over the generic message', () => {
  const e = new ApiError(400, { error: 'monster[0]: ref must reference content' })
  assert.equal(errorMessage(e), 'monster[0]: ref must reference content')
})

test('errorMessage falls back to message when body has no error field', () => {
  const e = new ApiError(500, 'plain text body')
  assert.equal(errorMessage(e), 'API request failed: 500')
})

test('errorMessage handles plain Errors and non-errors', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom')
  assert.equal(errorMessage('nope'), 'nope')
})
