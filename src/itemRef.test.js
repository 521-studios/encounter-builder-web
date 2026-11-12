import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildItemRef, materialPriceCp } from './itemRef.js'

test('an empty stack yields a pristine ref', () => {
  assert.deepEqual(buildItemRef('weapons:1', []), { game_id: 'weapons:1' })
  assert.deepEqual(buildItemRef('weapons:1', null), { game_id: 'weapons:1' })
})

test('a non-empty stack yields a derived ref with base, modifications (grade carried), and the last resolved json', () => {
  const stack = [
    { effect: { game_id: 'equipment:pot', name: 'Weapon Potency' }, grade: 2, item: { name: 'Rapier', v: 1 } },
    { effect: { game_id: 'equipment:strk', name: 'Striking' }, grade: null, item: { name: 'Rapier', v: 2 } },
  ]
  assert.deepEqual(buildItemRef('weapons:1', stack), {
    base: { game_id: 'weapons:1' },
    modifications: [
      { effect_game_id: 'equipment:pot', effect_name: 'Weapon Potency', grade: 2, price_cp: null, price_mode: 'add' },
      { effect_game_id: 'equipment:strk', effect_name: 'Striking', grade: null, price_cp: null, price_mode: 'add' },
    ],
    json: { name: 'Rapier', v: 2 }, // the LAST resolved item is the snapshot
  })
})

test("a 'set' component (a scroll/wand spell) IS the whole price — base + others ignored", () => {
  // A Scroll of Fireball: generic Magic Scroll base (no standalone price) + a rank-3
  // spell whose rank variant is 30 gp. The composed total is that rank price, not
  // base(null)+spell — which would leave it unpriced.
  const stack = [{ effect: { game_id: 's:fireball', name: 'Fireball' }, grade: null, price_cp: 3000, price_mode: 'set', item: {} }]
  const ref = buildItemRef('equipment:scroll', stack, '', null) // base has no price
  assert.equal(ref.price_cp, 3000)
  assert.equal(ref.modifications[0].price_mode, 'set')
})

test("a 'set' component with no resolved price leaves the line unpriced (no matching rank variant)", () => {
  const stack = [{ effect: { game_id: 's:x', name: 'Spell' }, grade: null, price_cp: null, price_mode: 'set', item: {} }]
  assert.equal(buildItemRef('equipment:staff', stack, '', 5000).price_cp, undefined) // base priced, but the 'set' part isn't
})

test('modifications default to add mode; a mix of add components stays additive', () => {
  const stack = [{ effect: { game_id: 'e:x', name: 'X' }, grade: null, price_cp: 200, item: {} }] // no price_mode key
  const ref = buildItemRef('w:1', stack, '', 100)
  assert.equal(ref.modifications[0].price_mode, 'add')
  assert.equal(ref.price_cp, 300)
})

test('buildItemRef sums base + component prices into ref.price_cp when all parts are priced', () => {
  const stack = [
    { effect: { game_id: 'e:pot', name: 'Weapon Potency' }, grade: 2, price_cp: 3500, item: {} }, // 35 gp
    { effect: { game_id: 'e:strk', name: 'Striking' }, grade: 4, price_cp: 6500, item: {} }, // 65 gp
  ]
  const ref = buildItemRef('weapons:1', stack, '', 100) // base 1 gp = 100 cp
  assert.equal(ref.price_cp, 100 + 3500 + 6500) // 10100 cp = 101 gp
  assert.equal(ref.modifications[0].price_cp, 3500)
  assert.equal(ref.modifications[1].price_cp, 6500)
})

test('buildItemRef omits ref.price_cp when a component (or the base) has no price', () => {
  const priced = { effect: { game_id: 'e:pot', name: 'P' }, grade: 2, price_cp: 3500, item: {} }
  const unpriced = { effect: { game_id: 'e:prop', name: 'Prop' }, grade: null, price_cp: null, item: {} }
  // A single unpriced component leaves the whole line unpriced (no undercount).
  assert.equal(buildItemRef('w:1', [priced, unpriced], '', 100).price_cp, undefined)
  // A missing base price does the same, even if every component is priced.
  assert.equal(buildItemRef('w:1', [priced], '', null).price_cp, undefined)
})

test('a custom name overlays onto the resolved json without mutating it; blank name is ignored', () => {
  const last = { name: 'Rapier', stat_block: {} }
  const stack = [{ effect: { game_id: 'equipment:pot', name: 'Weapon Potency' }, grade: 2, item: last }]

  const named = buildItemRef('weapons:1', stack, '  Sting  ')
  assert.equal(named.json.name, 'Sting') // trimmed + overlaid
  assert.equal(last.name, 'Rapier') // original untouched

  const blank = buildItemRef('weapons:1', stack, '   ')
  assert.equal(blank.json.name, 'Rapier') // blank falls back to the resolved name
})

test('a grade of 0 or undefined normalizes to null in modifications', () => {
  const stack = [{ effect: { game_id: 'e:x', name: 'X' }, item: {} }] // no grade key
  assert.equal(buildItemRef('w:1', stack).modifications[0].grade, null)
})

// pfsrd2's material price ruling, as relayed (76bn). gp → cp ×100.
const COLD_LOW = { grade: 'low', price_cp: 4000, cp_per_bulk: 400, per_bulk_text: '+4 gp per Bulk' }
const weapon = (bulk) => ({ type: 'weapon', stat_block: { item_category: 'Weapons', bulk } })
const armor = (bulk) => ({ type: 'armor', stat_block: { item_category: 'Armor', bulk } })

test('materialPriceCp: weapons count Bulk from the first (L and – count as 1)', () => {
  assert.equal(materialPriceCp(COLD_LOW, weapon({ value: 1, text: '1' })), 4400) // 44 gp
  assert.equal(materialPriceCp(COLD_LOW, weapon({ value: null, text: 'L' })), 4400) // L counts as 1
  assert.equal(materialPriceCp(COLD_LOW, weapon({ value: null, text: '–' })), 4400) // negligible too
  assert.equal(materialPriceCp(COLD_LOW, weapon({ value: 2, text: '2' })), 4800) // 48 gp
  // Standard cold iron at 1 Bulk: 880 + 88 = 968 gp.
  assert.equal(materialPriceCp({ price_cp: 88000, cp_per_bulk: 8800 }, weapon({ value: 1 })), 96800)
})

test('materialPriceCp: armor uses carried Bulk (worn + 1; L armor = 1)', () => {
  const low = { price_cp: 14000, cp_per_bulk: 1400 }
  assert.equal(materialPriceCp(low, armor({ value: 2, text: '2' })), 18200) // 140 + 14×3 = 182 gp
  assert.equal(materialPriceCp(low, armor({ value: null, text: 'L' })), 15400) // L armor = 1
})

test('materialPriceCp: ammunition, shields and flat grades take the bare listed price', () => {
  const ammo = { type: 'weapon', stat_block: { bulk: { text: 'L' }, statistics: { category: 'Ammunition' } } }
  assert.equal(materialPriceCp(COLD_LOW, ammo), 4000) // 40 gp per 10, no Bulk add
  assert.equal(materialPriceCp({ price_cp: 40000, form: 'buckler' }, { type: 'shield', stat_block: { bulk: { value: 1 } } }), 40000)
  assert.equal(materialPriceCp({ price_cp: 50000 }, armor({ value: 1 })), 50000) // no per-Bulk add (Elven Chain)
})

test('materialPriceCp: anything it cannot price honestly is null (line stays unpriced)', () => {
  assert.equal(materialPriceCp(null, weapon({ value: 1 })), null)
  assert.equal(materialPriceCp({ cp_per_bulk: 400 }, weapon({ value: 1 })), null) // no listed price
  assert.equal(materialPriceCp({ price_cp: 4000, per_bulk_text: '+4 gp per Bulk' }, weapon({ value: 1 })), null) // unparsed add
  assert.equal(materialPriceCp(COLD_LOW, weapon(undefined)), null) // no Bulk
  assert.equal(materialPriceCp(COLD_LOW, weapon({ text: 'varies' })), null) // unreadable Bulk
})

test("a 'replace-base' material replaces the base price and runes still add on top", () => {
  const stack = [
    { effect: { game_id: 'm:cold', name: 'Cold Iron Weapon' }, grade: 'low', price_cp: 4400, price_mode: 'replace-base', item: { name: 'Longsword' } },
    { effect: { game_id: 'r:pot', name: 'Weapon Potency' }, grade: 2, price_cp: 3500, price_mode: 'add', item: { name: 'Longsword' } },
  ]
  assert.equal(buildItemRef('w:ls', stack, '', 100).price_cp, 7900) // 44 gp + 35 gp, not 1 gp + …
  assert.equal(buildItemRef('w:ls', stack, '', null).price_cp, 7900) // the replaced base needn't be priced
  stack[0].price_cp = null
  assert.equal(buildItemRef('w:ls', stack, '', 100).price_cp, undefined) // unpriceable material → unpriced line
})
