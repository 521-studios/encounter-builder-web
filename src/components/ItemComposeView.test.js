import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ItemComposeView from './ItemComposeView.jsx'

afterEach(() => cleanup())

// ItemComposeView is integration glue over the pfsrd2 client + the library's
// ItemSlotPicker/apply machinery. Node 24 has no unflagged test:mock.module, so the
// component takes a `deps` bag (default = the real client/library); here we inject
// fakes: a stub SlotPicker that surfaces the callbacks as plain controls, a stub Card
// that just shows the item name, and controllable async apply/eligible fakes. The pure
// transforms (customizedItem/mergeItemPatches/buildItemRef) run for real. (j54u)

const BASE = { name: 'Longsword', stat_block: {} }

function StubPicker({ name, stack, onApply, onRemoveLast, onClearAll, onNameChange }) {
  return (
    <div data-testid="picker">
      <span data-testid="stack-len">{stack.length}</span>
      <input aria-label="item name" value={name} onChange={(e) => onNameChange(e.target.value)} />
      <button onClick={() => onApply({ game_id: 'Rune:striking', name: 'Striking' }, { grade: 2 })}>apply</button>
      <button onClick={onRemoveLast}>removeLast</button>
      <button onClick={onClearAll}>clearAll</button>
    </div>
  )
}
function StubCard({ data }) {
  return <div data-testid="card">{data?.name}</div>
}

function makeDeps(overrides = {}) {
  return {
    api: {
      entryFull: async () => BASE,
      applyItemPost: async () => ({}),
      templatesGet: async () => ({}),
      suggestSpells: async () => [],
    },
    fetchEligible: async () => ({ groups: [] }), // truthy → the picker opens
    applyItemEffect: async () => ({
      item: { name: 'Striking Longsword', stat_block: {} },
      patches: [{ change_category: 'x' }],
      applied: 'Striking',
    }),
    SlotPicker: StubPicker,
    Card: StubCard,
    ...overrides,
  }
}

// Mount a pristine item and open the Customize panel (base load + eligibility both async).
async function openPicker(onChange, deps) {
  render(<ItemComposeView treasure={{ ref: { game_id: 'Weapons:1' } }} onChange={onChange} deps={deps} />)
  await screen.findByTestId('card') // base item loaded
  fireEvent.click(screen.getByTestId('customize-item'))
  await screen.findByTestId('picker') // eligibility loaded → panel open
}

test('ItemComposeView surfaces a 409 boundary refusal as a GM-facing "Not allowed" message', async () => {
  const deps = makeDeps({
    applyItemEffect: async () => {
      const e = new Error('nope')
      e.status = 409
      e.body = 'ineligible'
      throw e
    },
  })
  await openPicker(() => {}, deps)
  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.match(document.body.textContent, /Not allowed: ineligible/))
})

test('ItemComposeView persists a derived ref on apply, then reverts to pristine on remove', async () => {
  const refs = []
  await openPicker((t) => refs.push(t.ref), makeDeps())

  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.equal(refs.length, 1))
  const derived = refs.at(-1)
  assert.equal(derived.base.game_id, 'Weapons:1')
  assert.equal(derived.modifications.length, 1)
  assert.equal(derived.modifications[0].effect_game_id, 'Rune:striking')
  assert.equal(derived.modifications[0].grade, 2) // graded rune carries its grade

  // Removing the only modification returns a pristine { game_id } ref (no modifications).
  fireEvent.click(screen.getByText('removeLast'))
  await waitFor(() => assert.equal(refs.length, 2))
  assert.deepEqual(refs.at(-1), { game_id: 'Weapons:1' })
})

test('ItemComposeView clearAll empties the stack (pristine ref)', async () => {
  const refs = []
  await openPicker((t) => refs.push(t.ref), makeDeps())
  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.equal(refs.length, 1))
  fireEvent.click(screen.getByText('clearAll'))
  await waitFor(() => assert.equal(refs.length, 2))
  assert.deepEqual(refs.at(-1), { game_id: 'Weapons:1' })
})

test('ItemComposeView overlays the custom name onto the composed item and persists it', async () => {
  const refs = []
  await openPicker((t) => refs.push(t.ref), makeDeps())

  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.equal(refs.length, 1))

  fireEvent.change(screen.getByLabelText('item name'), { target: { value: 'Bane of Goblins' } })
  await waitFor(() => assert.equal(refs.length, 2))
  // The name is overlaid onto the resolved json snapshot (the composed item), not the base.
  assert.equal(refs.at(-1).json.name, 'Bane of Goblins')
  // And the rendered card shows the overlaid name (customizedItem).
  assert.equal(screen.getByTestId('card').textContent, 'Bane of Goblins')
})
