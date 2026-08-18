// Build a treasure item's ContentRef from its applied-effect stack — the item
// analog of buildMonsterRef, the round-trip contract the item-templating feature
// rests on:
//   empty stack -> pristine  { game_id }
//   non-empty   -> derived   { base:{game_id},
//                              modifications:[{effect_game_id, effect_name, grade}],
//                              json:<last resolved item, custom name overlaid> }
// json is the resolved snapshot downstream/released consumers read; modifications
// are the provenance ItemComposeView re-applies to reconstruct the stack on load.
// A grade is carried only for graded effects (a rune's +1/+2/…); it's omitted (null)
// for property runes, materials, and spells. The custom `name` belongs to the
// COMPOSED item: it is persisted only alongside a modification (an empty stack is a
// pristine ref that carries no name), so a plain catalog item stays priceable and a
// rename with no composition uses the freeform custom-item path instead.
//
// price_mode says how a component's price combines into the composed total (qeai):
//   'add' — additive on top of the base price (runes). The default.
//   'set' — the component IS the whole price; base + others are ignored (a spell on a
//           scroll/wand: a Scroll of Fireball costs the rank-3 scroll price, and its
//           generic "Magic Scroll" base carries no standalone price to add to).
// Stored inside each opaque modification (the API treats modifications as raw JSON),
// so it round-trips without an API change; absent → 'add' (pre-qeai composed refs).
export function buildItemRef(baseGameId, stack, name, basePriceCp = null) {
  if (!stack || stack.length === 0) return { game_id: baseGameId }
  const last = stack[stack.length - 1].item
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const json = trimmed ? { ...last, name: trimmed } : last
  const modifications = stack.map((s) => ({
    effect_game_id: s.effect.game_id,
    effect_name: s.effect.name,
    grade: s.grade ?? null,
    // Copper price of this component (a rune grade, or a scroll/wand's rank price),
    // carried so the treasure budget can value the line without re-fetching
    // eligibility on reload (4den/qeai).
    price_cp: typeof s.price_cp === 'number' ? s.price_cp : null,
    price_mode: s.price_mode || 'add',
  }))
  const priceCp = composedPriceCp(modifications, basePriceCp)
  return {
    base: { game_id: baseGameId },
    modifications,
    json,
    ...(priceCp != null ? { price_cp: priceCp } : {}),
  }
}

// The composed copper total for a derived item, or null when it can't be fully priced
// (a single unpriced part leaves the whole line unpriced rather than undercounting —
// budget.js then floors it). A 'set' component (a scroll/wand's spell) defines the
// total outright; otherwise it's the base price plus every additive component.
function composedPriceCp(modifications, basePriceCp) {
  const setMod = modifications.find((m) => m.price_mode === 'set')
  if (setMod) return typeof setMod.price_cp === 'number' ? setMod.price_cp : null
  const allPriced = typeof basePriceCp === 'number' && modifications.every((m) => typeof m.price_cp === 'number')
  return allPriced ? modifications.reduce((sum, m) => sum + m.price_cp, basePriceCp) : null
}
