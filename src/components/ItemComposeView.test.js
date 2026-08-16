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

test('ItemComposeView surfaces a 409 boundary refusal INLINE, keeping the compose panel (2zi8)', async () => {
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
  // A boundary refusal is non-fatal: it shows inline as "Not allowed: <reason>" (no
  // "Could not load item" load-error wrapper) and the compose panel stays put. (2zi8)
  const err = await screen.findByTestId('apply-error')
  assert.equal(err.textContent, 'Not allowed: ineligible')
  assert.doesNotMatch(document.body.textContent, /Could not load item/)
  assert.ok(screen.getByTestId('picker'), 'the compose panel remains open after a refusal')
})

test('ItemComposeView surfaces a Customize/eligibility failure inline and restores the retry button (2zi8)', async () => {
  const deps = makeDeps({ fetchEligible: async () => { throw new Error('boom') } })
  render(<ItemComposeView treasure={{ ref: { game_id: 'Weapons:1' } }} onChange={() => {}} deps={deps} />)
  await screen.findByTestId('card') // base item still renders
  fireEvent.click(screen.getByTestId('customize-item'))
  // Inline error, not the fatal "Could not load item" wrapper, and — since the picker
  // never opened — we drop back out of customize mode so the Customize button returns.
  const err = await screen.findByTestId('apply-error')
  assert.match(err.textContent, /boom/)
  assert.doesNotMatch(document.body.textContent, /Could not load item/)
  assert.ok(screen.getByTestId('customize-item'), 'the Customize button is available again to retry')
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

test('ItemComposeView composes the treasure price: base + applied rune grade price_cp → ref.price_cp (4den)', async () => {
  const refs = []
  const deps = makeDeps({
    // base 1 gp = 100 cp (entryFull lives under deps.api, so override the whole api bag)
    api: { entryFull: async () => ({ name: 'Longsword', stat_block: { price: { value: 1, currency: 'gp' } } }), applyItemPost: async () => ({}), templatesGet: async () => ({}), suggestSpells: async () => [] },
    // eligibility now carries structured price_cp per grade; the stub applies Rune:striking @ grade(level) 2
    fetchEligible: async () => ({
      runes: {
        fundamental: [{ game_id: 'Rune:striking', name: 'Striking', grades: [{ level: 2, price_cp: 6500 }] }],
        property: [],
      },
    }),
  })
  await openPicker((t) => refs.push(t.ref), deps)
  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.equal(refs.length, 1))
  const ref = refs.at(-1)
  assert.equal(ref.modifications[0].price_cp, 6500) // the grade price rode into the modification
  assert.equal(ref.price_cp, 6600) // base 100 + striking 6500, composed total in copper
})

test('ItemComposeView leaves ref.price_cp unset when the applied component has no price (4den)', async () => {
  const refs = []
  const deps = makeDeps({
    api: { entryFull: async () => ({ name: 'Longsword', stat_block: { price: { value: 1, currency: 'gp' } } }), applyItemPost: async () => ({}), templatesGet: async () => ({}), suggestSpells: async () => [] },
    // the applied rune isn't in eligibility (or carries no price_cp) → component price null
    fetchEligible: async () => ({ runes: { fundamental: [], property: [] } }),
  })
  await openPicker((t) => refs.push(t.ref), deps)
  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.equal(refs.length, 1))
  const ref = refs.at(-1)
  assert.equal(ref.modifications[0].price_cp, null)
  assert.equal(ref.price_cp, undefined) // one unpriced component → no composed total
})

test('ItemComposeView preserves per-modification price_cp across reload so the total stays composed (4den)', async () => {
  const refs = []
  const deps = makeDeps({
    api: { entryFull: async () => ({ name: 'Longsword', stat_block: { price: { value: 1, currency: 'gp' } } }), applyItemPost: async () => ({}), templatesGet: async () => ({}), suggestSpells: async () => [] },
    fetchEligible: async () => ({ runes: { fundamental: [{ game_id: 'Rune:striking', name: 'Striking', grades: [{ level: 2, price_cp: 6500 }] }], property: [] } }),
  })
  // Mount an ALREADY-composed item: a persisted modification carrying its price_cp. The
  // rebuild re-applies it (no eligibility fetch) and must carry price_cp back onto the stack.
  const treasure = {
    ref: {
      base: { game_id: 'Weapons:1' },
      modifications: [{ effect_game_id: 'Rune:striking', effect_name: 'Striking', grade: 2, price_cp: 6500 }],
      json: { name: 'Striking Longsword', stat_block: {} },
    },
  }
  render(<ItemComposeView treasure={treasure} onChange={(t) => refs.push(t.ref)} deps={deps} />)
  await screen.findByTestId('card')
  // Re-open customize and apply a second rune; the RELOADED first rune's price must still count.
  fireEvent.click(screen.getByTestId('customize-item'))
  await screen.findByTestId('picker')
  fireEvent.click(screen.getByText('apply'))
  await waitFor(() => assert.equal(refs.length, 1))
  // base 100 + reloaded striking 6500 + new striking 6500 = 13100 (a dropped reload price → undefined)
  assert.equal(refs.at(-1).price_cp, 13100)
})
