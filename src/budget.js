// Encounter treasure valuation + XP/difficulty, built on the pfsrd2-display
// numeric accessors (Slice 2) and the PF2e rules calculators (pf2eRules.js).
// The pure functions take an `entryOf(gameId)` resolver so they're testable
// without fetching; the TreasureBudget component wires the real fetched entries.
import { itemPriceCp, creatureLevel, coinsToCp } from '@521studios/pfsrd2-display'
import { creatureXp, encounterThreat, treasureBudget } from './pf2eRules.js'
import { isCustomTreasure, isCombatRoom, contentMonsters, contentHazards, contentAfflictions, contentTreasure, contentCurrency, contentXPAwards } from './model.js'

// refGameId: the game_id a monster/treasure ref resolves to — a pristine ref, or
// a derived (templated/runed) ref's base.game_id.
export function refGameId(ref) {
  return (ref && (ref.game_id || (ref.base && ref.base.game_id))) || ''
}

// A derived ref (a runed weapon, a templated monster) carries a base + edits; its
// resolved price/level isn't the base entry's, so we flag rather than mis-value.
function isDerived(ref) {
  return !!(ref && (ref.base || (Array.isArray(ref.modifications) && ref.modifications.length)))
}

// treasureValueCp sums an encounter's treasure to copper: coin reward + each
// line's item price (variant-aware) × qty. Skips DESTROYED loot (not awarded).
// Lines whose value can't be resolved — a derived/runed item, a "Varies" price,
// or an entry not yet loaded — are returned in `unpriced` so the UI flags them
// for manual review instead of silently counting them as 0.
export function treasureValueCp(treasure, currency, entryOf) {
  let cp = coinsToCp(currency)
  const unpriced = []
  for (const line of treasure || []) {
    if (line.state === 'destroyed') continue
    // A degree-of-success line overrides the item price; the builder budgets the
    // Success tier — the reliable outcome, not the higher crit-success — falling
    // back to another set tier.
    if (line.value_tiers) {
      const v = line.value_tiers
      const best = [v.success, v.crit_success, v.failure, v.crit_failure].find((n) => typeof n === 'number')
      if (typeof best === 'number' && Number.isFinite(best)) cp += best * (line.qty || 1)
      else unpriced.push(line)
      continue
    }
    if (isCustomTreasure(line)) {
      // A freeform item carries its own gp value (in copper); a line left unvalued
      // (null) floors the total like any unpriced item.
      const v = line.ref.json.value_cp
      if (typeof v === 'number' && Number.isFinite(v)) cp += v * (line.qty || 1)
      else unpriced.push(line)
      continue
    }
    if (isDerived(line.ref)) {
      // A composed item (runed weapon/armor) carries its composed copper total in
      // ref.price_cp when every component was priced; sum it. A missing total (an
      // unpriced component, or an item composed before pricing shipped) still floors
      // the budget via unpriced. (4den)
      const v = line.ref.price_cp
      if (typeof v === 'number' && Number.isFinite(v)) cp += v * (line.qty || 1)
      else unpriced.push(line)
      continue
    }
    const gid = refGameId(line.ref)
    const entry = gid ? entryOf(gid) : null
    const per = entry ? itemPriceCp(entry, line.variant || undefined) : null
    if (per == null) {
      unpriced.push(line)
      continue
    }
    cp += per * (line.qty || 1)
  }
  return { cp, unpriced }
}

// treasureStanding compares an encounter's ACTUAL loot value (copper) against its
// treasure-budget target, for the header chip. Mirrors the TreasureBudget panel's
// floor reasoning: "over" is safe on a floor (true value ≥ the shown value), while
// "under" is only knowable once the value is COMPLETE — so a floor that's below
// target reports no verdict rather than a false "low". `targetGp` null (a Trivial
// or non-combat encounter has no target) → no verdict. Returns { verdict, floor }
// where verdict ∈ 'low' | 'on' | 'high' | null and floor marks an incomplete value.
export function treasureStanding(cp, targetGp, incomplete) {
  if (targetGp == null) return { verdict: null, floor: !!incomplete }
  const targetCp = targetGp * 100
  if (cp > targetCp) return { verdict: 'high', floor: !!incomplete }
  if (cp === targetCp) return { verdict: 'on', floor: !!incomplete }
  // cp < targetCp — only call it "low" once the value is complete (a floor might
  // still climb to/over target once the unpriced/unloaded items resolve).
  return incomplete ? { verdict: null, floor: true } : { verdict: 'low', floor: false }
}

// hazardXp sums the hazards' XP: a Hazard N contributes the same XP as a Creature N
// (no elite/weak). Level comes from the indexed entry; a hazard whose level can't be
// read is returned in `unknown`.
export function hazardXp(hazards, partyLevel, entryOf) {
  let xp = 0
  const unknown = []
  for (const h of hazards || []) {
    const gid = refGameId(h.ref)
    const entry = gid ? entryOf(gid) : null
    // The full entry is flat under `hazard` (not stat_block); level lives there.
    const hz = entry && (entry.hazard || entry)
    const lvl = hz && hz.level != null ? hz.level : null
    if (lvl == null) {
      unknown.push(h)
      continue
    }
    xp += creatureXp(lvl, partyLevel, 'none') * (h.count || 1)
  }
  return { xp, unknown }
}

// afflictionXp sums leveled afflictions' XP: a leveled disease/curse (e.g. Blueblisters
// Disease 3) counts like a creature/hazard of that level. A "Varies"-level affliction
// (level_text, no level) has no XP — that's a 0 contribution, not unknown; only an
// unresolved entry is unknown.
export function afflictionXp(afflictions, partyLevel, entryOf) {
  let xp = 0
  const unknown = []
  for (const a of afflictions || []) {
    const gid = refGameId(a.ref)
    const entry = gid ? entryOf(gid) : null
    if (!entry) {
      unknown.push(a)
      continue
    }
    const af = entry.affliction || entry // flat under `affliction`
    if (af.level == null) continue // Varies-level → no XP, deliberately
    xp += creatureXp(af.level, partyLevel, 'none') * (a.count || 1)
  }
  return { xp, unknown }
}

// encounterXp sums the monsters' XP against the party level (Table 10-2 via
// creatureXp, honoring elite/weak). Monsters whose creature level can't be read
// (entry not loaded, or a level-changing template) are returned in `unknown`.
export function encounterXp(monsters, partyLevel, entryOf) {
  let xp = 0
  const unknown = []
  for (const m of monsters || []) {
    // A derived (templated) ref carries the resolved creature in ref.json — its
    // level already reflects every applied template (elite/weak is applied this way,
    // not via the legacy `adjustment` field), so read it directly and don't
    // double-shift. Pristine refs use the base entry level + the adjustment shift.
    const resolved = m.ref?.json || null
    let lvl, adjustment
    if (resolved) {
      lvl = creatureLevel(resolved)
      adjustment = 'none'
    } else {
      const gid = refGameId(m.ref)
      const entry = gid ? entryOf(gid) : null
      lvl = entry ? creatureLevel(entry) : null
      adjustment = m.adjustment
    }
    if (lvl == null) {
      unknown.push(m)
      continue
    }
    xp += creatureXp(lvl, partyLevel, adjustment) * (m.count || 1)
  }
  return { xp, unknown }
}

// awardXp sums an encounter's non-combat XP awards (story/exploration/ally
// grants). These advance the party — so they add to the XP total and the chapter
// rollups — but are deliberately NOT combat: they never feed encounterThreat or
// the treasure budget, which stay creature-derived.
export function awardXp(enc) {
  let xp = 0
  for (const a of contentXPAwards(enc)) xp += Number(a.amount) || 0
  return xp
}

// rollupEncounters aggregates a set of encounters into a treasure total vs the
// summed per-encounter budget (each encounter's difficulty-band target), plus a
// per-encounter breakdown. `partyFor(encounter) -> {level, size}` resolves each
// encounter's effective party (its own override → chapter → campaign → default);
// `entryOf(gameId)` resolves a loaded item/creature entry. Both are injected so
// this stays pure/testable — the rollup component wires the real fetches.
export function rollupEncounters(encounters, entryOf, partyFor) {
  const rows = []
  let totalCp = 0
  let totalTargetCp = 0
  let totalXp = 0
  for (const enc of encounters || []) {
    const { level, size } = partyFor(enc)
    const { cp, unpriced } = treasureValueCp(contentTreasure(enc), contentCurrency(enc), entryOf)
    const { xp: mXp, unknown: mUnknown } = encounterXp(contentMonsters(enc), level, entryOf)
    const { xp: hXp, unknown: hUnknown } = hazardXp(contentHazards(enc), level, entryOf)
    const { xp: aXp, unknown: aUnknown } = afflictionXp(contentAfflictions(enc), level, entryOf)
    const xp = mXp + hXp + aXp
    const unknown = [...mUnknown, ...hUnknown, ...aUnknown]
    // Non-combat rooms (hazard/haunt/social/knowledge/…) have no meaningful combat
    // band or treasure target — suppress both; their loot still counts as value.
    const combat = isCombatRoom(enc.room_type)
    const threat = combat ? encounterThreat(xp, size) : null // creatures + hazards, no awards
    const targetGp = combat ? treasureBudget(level, threat, size) : null // null for Trivial / non-combat
    const targetCp = targetGp == null ? 0 : targetGp * 100
    const encXp = xp + awardXp(enc) // advancement XP includes non-combat awards
    rows.push({
      id: enc.id,
      name: enc.name,
      cp,
      xp: encXp,
      threat,
      roomType: enc.room_type || 'combat',
      targetCp,
      incomplete: unpriced.length > 0 || unknown.length > 0,
    })
    totalCp += cp
    totalTargetCp += targetCp
    totalXp += encXp
  }
  return { totalCp, totalTargetCp, totalXp, rows, anyIncomplete: rows.some((r) => r.incomplete) }
}

// rollupByChapter summarizes a whole campaign one row PER CHAPTER (not per
// encounter): each chapter's encounters are aggregated via rollupEncounters and
// its treasure / target / XP summed. Chapters render in order; encounters with no
// chapter (or a dangling chapter_id) collect into a trailing "Unsorted" row only
// when non-empty. XP sums as a number (advancement XP — combat + non-combat awards);
// difficulty bands don't add.
export function rollupByChapter(chapters, encounters, entryOf, partyFor) {
  const list = encounters || []
  const byChapter = new Map()
  for (const enc of list) {
    const k = enc.chapter_id || ''
    if (!byChapter.has(k)) byChapter.set(k, [])
    byChapter.get(k).push(enc)
  }
  const chapterIds = new Set((chapters || []).map((c) => c.id))

  const rows = []
  let totalCp = 0
  let totalTargetCp = 0
  let totalXp = 0
  const pushRow = (id, name, encs) => {
    const r = rollupEncounters(encs, entryOf, partyFor)
    rows.push({ id, name, xp: r.totalXp, cp: r.totalCp, targetCp: r.totalTargetCp, incomplete: r.anyIncomplete })
    totalCp += r.totalCp
    totalTargetCp += r.totalTargetCp
    totalXp += r.totalXp
  }

  for (const ch of chapters || []) pushRow(ch.id, ch.name, byChapter.get(ch.id) || [])
  // Chapterless + dangling-chapter encounters → one Unsorted row (only if any).
  const unsorted = list.filter((e) => !e.chapter_id || !chapterIds.has(e.chapter_id))
  if (unsorted.length) pushRow('', 'Unsorted', unsorted)

  return { totalCp, totalTargetCp, totalXp, rows, anyIncomplete: rows.some((r) => r.incomplete) }
}

// gameIdsInEncounter: the distinct entry ids an encounter references (monsters +
// treasure, skipping derived refs whose base we don't price/level directly and
// destroyed treasure). Used to batch the entry fetches.
export function gameIdsInEncounter(enc) {
  const ids = new Set()
  for (const m of contentMonsters(enc)) {
    if (!isDerived(m.ref)) {
      const g = refGameId(m.ref)
      if (g) ids.add(g)
    }
  }
  for (const h of contentHazards(enc)) {
    const g = refGameId(h.ref)
    if (g) ids.add(g)
  }
  for (const a of contentAfflictions(enc)) {
    const g = refGameId(a.ref)
    if (g) ids.add(g)
  }
  for (const t of enc?.treasure || []) {
    if (t.state === 'destroyed' || isDerived(t.ref)) continue
    const g = refGameId(t.ref)
    if (g) ids.add(g)
  }
  return [...ids]
}
