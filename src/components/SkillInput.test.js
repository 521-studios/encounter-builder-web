import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SkillInput from './SkillInput.jsx'

afterEach(() => cleanup())
const noop = () => {}

test('SkillInput clears its display on focus (full list) without changing the stored value; reverts on blur', () => {
  let changed = null
  render(<SkillInput aria-label="skill" value="Perception" onChange={(v) => (changed = v)} />)
  const input = screen.getByLabelText('skill')
  assert.equal(input.value, 'Perception')
  fireEvent.focus(input)
  assert.equal(input.value, '') // display cleared → the datalist shows every option, not just "Perception"
  assert.equal(changed, null) // the stored value is NOT touched on focus
  fireEvent.blur(input)
  assert.equal(input.value, 'Perception') // reverts when nothing was picked
})

test('SkillInput onChange fires the picked/typed value', () => {
  let changed = null
  render(<SkillInput aria-label="skill" value="Perception" onChange={(v) => (changed = v)} />)
  const input = screen.getByLabelText('skill')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'Nature' } })
  assert.equal(changed, 'Nature')
  assert.equal(input.value, 'Nature')
})

test('SkillInput references the shared #skill-options datalist', () => {
  render(<SkillInput aria-label="skill" value="" onChange={noop} />)
  assert.equal(screen.getByLabelText('skill').getAttribute('list'), 'skill-options')
})
