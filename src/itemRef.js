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
//   'replace-base' — the component replaces the BASE price; runes still add on top (a
//           precious material: a cold iron longsword's price is the material grade's,
//           not 1 gp + it — see materialPriceCp).
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
  const replaceMod = modifications.find((m) => m.price_mode === 'replace-base')
  const start = replaceMod ? replaceMod.price_cp : basePriceCp
  const adds = modifications.filter((m) => m !== replaceMod)
  const allPriced = typeof start === 'number' && adds.every((m) => typeof m.price_cp === 'number')
  return allPriced ? adds.reduce((sum, m) => sum + m.price_cp, start) : null
}

// THE precious-material price rule (76bn; pfsrd2's ruling, Devon confirmed "count from
// 1st Bulk"). `row` is the chosen /eligible grade_prices row, `item` the base entry.
// Returns the copper price that REPLACES the base item's, or null when it can't be
// priced honestly (the line then stays unpriced rather than mis-valued):
//   shield (row.form)  → the row's flat price for that form
//   ammunition         → the bare listed price (it's per 10; no Bulk add)
//   no per-Bulk add    → the flat listed price (e.g. Elven Chain)
//   weapon / armor     → price_cp + cp_per_bulk × max(B, 1), where B is the integer
//                        Bulk (L and – count as 1); for armor B is CARRIED Bulk
//                        (worn + 1; L armor = 1).
// e.g. low-grade cold iron (40 gp + 4 gp/Bulk): 1-Bulk or L weapon 44 gp, 2-Bulk 48 gp;
// worn-2 armor (140 gp + 14 gp/Bulk) = 140 + 14×3 = 182 gp.
export function materialPriceCp(row, item) {
  if (!row || typeof row.price_cp !== 'number') return null
  if (row.form) return row.price_cp
  const sb = (item && item.stat_block) || item || {}
  if (sb.statistics?.category === 'Ammunition') return row.price_cp
  if (typeof row.cp_per_bulk !== 'number') return row.per_bulk_text ? null : row.price_cp // unparsed add → unpriced
  const worn = numericBulk(sb.bulk)
  if (worn == null) return null
  const isArmor = item?.type === 'armor' || sb.item_category === 'Armor'
  const bulk = isArmor ? (worn < 1 ? 1 : worn + 1) : Math.max(worn, 1)
  return row.price_cp + row.cp_per_bulk * bulk
}

// numericBulk reads a stat_block bulk section as a number: its value when numeric,
// else its text ("L"/"–"/"-"/"" → 0, the light/negligible end; "2" → 2). null when
// unreadable.
function numericBulk(bulk) {
  if (!bulk) return null
  if (typeof bulk.value === 'number') return bulk.value
  const t = String(bulk.text ?? '').trim()
  if (t === '' || t === 'L' || t === '-' || t === '–' || t === '—') return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
