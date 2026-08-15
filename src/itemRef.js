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
export function buildItemRef(baseGameId, stack, name) {
  if (!stack || stack.length === 0) return { game_id: baseGameId }
  const last = stack[stack.length - 1].item
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const json = trimmed ? { ...last, name: trimmed } : last
  return {
    base: { game_id: baseGameId },
    modifications: stack.map((s) => ({
      effect_game_id: s.effect.game_id,
      effect_name: s.effect.name,
      grade: s.grade ?? null,
    })),
    json,
  }
}
