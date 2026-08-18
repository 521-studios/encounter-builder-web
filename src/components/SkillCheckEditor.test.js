import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import SkillCheckEditor from './SkillCheckEditor.jsx'

afterEach(() => cleanup())
const noop = () => {}

test('SkillCheckEditor edits skill/dc through onChange', () => {
  const base = { skill: 'Perception', dc: 12, description: '' }
  let changed = null
  render(<SkillCheckEditor value={base} siblings={[]} onChange={(s) => (changed = s)} onRemove={noop} />)
  fireEvent.change(screen.getByLabelText('check skill'), { target: { value: 'Nature' } })
  assert.equal(changed.skill, 'Nature')
  fireEvent.change(screen.getByLabelText('check DC'), { target: { value: '15' } })
  assert.equal(changed.dc, 15)
})

test('SkillCheckEditor adds an alternative skill row', () => {
  let changed = null
  render(<SkillCheckEditor value={{ skill: 'Thievery', dc: 25 }} siblings={[]} onChange={(s) => (changed = s)} onRemove={noop} />)
  fireEvent.click(screen.getByText('+ alternative skill'))
  assert.equal(changed.alternatives.length, 1)
  assert.deepEqual(changed.alternatives[0], { skill: '', dc: 0 })
})

test('SkillCheckEditor is read-only when disabled: shows the label, no inputs', () => {
  render(<SkillCheckEditor value={{ skill: 'Thievery', dc: 25, successes: 4 }} disabled siblings={[]} onChange={noop} onRemove={noop} />)
  assert.equal(screen.getByTestId('check-label').textContent, 'Thievery DC 25 ×4')
  assert.equal(screen.queryByLabelText('check skill'), null)
})

test('SkillCheckEditor renders the effect as markdown with an Edit flip when it has content', () => {
  const { container } = render(<SkillCheckEditor value={{ skill: 'Perception', dc: 12, description: 'spot **it**' }} siblings={[]} onChange={noop} onRemove={noop} />)
  assert.equal(screen.queryByLabelText('check effect'), null) // preview, not a textarea
  assert.ok(container.querySelector('.description-preview'))
  fireEvent.click(screen.getByRole('button', { name: 'edit check effect' }))
  assert.ok(screen.getByLabelText('check effect')) // flips to the textarea
})

test('SkillCheckEditor opens the effect in edit mode when empty', () => {
  render(<SkillCheckEditor value={{ skill: 'Perception', dc: 12 }} siblings={[]} onChange={noop} onRemove={noop} />)
  assert.ok(screen.getByLabelText('check effect')) // textarea visible for a fresh check
})

test('SkillCheckEditor remove button calls onRemove', () => {
  let removed = false
  render(<SkillCheckEditor value={{ skill: 'Perception', dc: 12 }} siblings={[]} onChange={noop} onRemove={() => (removed = true)} />)
  fireEvent.click(screen.getByRole('button', { name: 'remove' }))
  assert.ok(removed)
})
