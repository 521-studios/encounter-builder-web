import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderHook, act } from '@testing-library/react'
import { useAutosave } from './useAutosave.js'

// Advance real time inside act() so the debounce timer + its setState flush cleanly.
const tick = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

test('useAutosave debounce-saves the scheduled value and reports saved', async () => {
  const calls = []
  const { result } = renderHook(() => useAutosave(async (v) => { calls.push(v) }, 10))
  assert.equal(result.current.state, 'saved')
  act(() => result.current.schedule('x'))
  assert.equal(result.current.state, 'unsaved') // flips immediately on edit
  await tick(30)
  assert.deepEqual(calls, ['x'])
  assert.equal(result.current.state, 'saved')
})

test('useAutosave coalesces edits during an in-flight save — newest wins', async () => {
  const calls = []
  let release
  const save = async (v) => {
    calls.push(v)
    if (v === 'a') await new Promise((r) => { release = r }) // block the first save
  }
  const { result } = renderHook(() => useAutosave(save, 5))
  act(() => result.current.schedule('a'))
  await tick(10) // 'a' save starts and blocks
  assert.deepEqual(calls, ['a'])
  act(() => { result.current.schedule('b'); result.current.schedule('c') }) // both while 'a' in-flight
  await tick(10)
  assert.deepEqual(calls, ['a']) // still blocked; b/c only pending
  await act(async () => { release() }) // 'a' resolves → drain loop takes the newest pending ('c')
  await tick(5)
  assert.deepEqual(calls, ['a', 'c']) // 'b' was superseded by 'c', never sent
  assert.equal(result.current.state, 'saved')
})

test('useAutosave surfaces a failed save as error state', async () => {
  const origErr = console.error
  console.error = () => {} // the hook logs the failure; keep test output clean
  try {
    const { result } = renderHook(() => useAutosave(async () => { throw new Error('boom') }, 5))
    act(() => result.current.schedule('x'))
    await tick(20)
    assert.equal(result.current.state, 'error')
  } finally {
    console.error = origErr
  }
})
