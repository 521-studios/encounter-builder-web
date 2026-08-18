import { partyFields } from './party.js'

// Enum values mirroring encounter-builder-api's model (internal/model/model.go).
// The API validates + normalizes these, so the UI just offers the valid choices.
export const ADJUSTMENTS = ['none', 'elite', 'weak']
export const SALE_CLASSES = ['normal', 'pure_treasure']
export const TREASURE_STATES = ['intact', 'consumed', 'destroyed']

// Room/area type. `combat` (default) is the builder's original unit and the only
// type with a meaningful difficulty band + treasure target; the others are
// non-combat rooms (the band is suppressed for them).
export const ROOM_TYPES = ['combat', 'hazard', 'haunt', 'exploration', 'social', 'knowledge', 'empty']
export const ROOM_TYPE_LABELS = {
  combat: 'Combat',
  hazard: 'Hazard',
  haunt: 'Haunt',
  exploration: 'Exploration',
  social: 'Social',
  knowledge: 'Knowledge',
  empty: 'Empty',
}
// A room shows its combat difficulty band + treasure target only when it's combat
// (empty/unset defaults to combat, matching the API).
export function isCombatRoom(roomType) {
  return !roomType || roomType === 'combat'
}
// Display label for a room type, falling back to the raw value for an unknown one
// (e.g. a type added server-side the client doesn't know yet).
export function roomTypeLabel(roomType) {
  return ROOM_TYPE_LABELS[roomType] || roomType
}

// Non-treasure reward kinds (informational — no gp/XP effect, unlike treasure/XP awards).
export const REWARD_KINDS = ['information', 'ritual', 'ally', 'item']
export const REWARD_KIND_LABELS = {
  information: 'Information',
  ritual: 'Ritual',
  ally: 'Ally',
  item: 'Item',
}

// Coin denominations, high-to-low for display.
export const CURRENCIES = ['pp', 'gp', 'sp', 'cp']

// _key is a client-only stable React key (line objects have no server id). It's
// stripped before sending to the API (which rejects unknown fields). withKey()
// stamps loaded lines the same way.
export function withKey(line) {
  return { ...line, _key: crypto.randomUUID() }
}

export function stripKey({ _key, ...rest }) {
  return rest
}

// Stamp a server encounter's lines with stable client keys (the server has no
// per-line ids); the keys are stripped again before save.
// A treasure pool groups loot by where it's found (a first-class entity so it can
// carry its own GM markdown description + an optional discovery gate). Every
// encounter with treasure keeps at least a default pool; `id` is the stable,
// persisted handle lines reference via pool_id.
export function emptyPool(name = '') {
  return { id: crypto.randomUUID(), name, description: '', gate: null }
}

export function keyed(e) {
  const treasure = (e.treasure || []).map(withKey)
  let pools = e.treasure_pools || []
  // Ensure a home for treasure: if there are lines but no pool holds them (none
  // exist, or a line's pool_id is empty/dangling), materialize a default pool and
  // adopt the orphans — like a dangling chapter_id renders under "Unsorted". A
  // treasureless encounter stays pool-less until the GM adds loot.
  if (treasure.length) {
    const ids = new Set(pools.map((p) => p.id))
    const orphaned = (t) => !t.pool_id || !ids.has(t.pool_id)
    if (!pools.length || treasure.some(orphaned)) {
      const def = pools[0] || emptyPool()
      if (!pools.length) pools = [def]
      for (const t of treasure) if (orphaned(t)) t.pool_id = def.id
    }
  }
  // Unified Challenges list: migrate the legacy arrays in (if `challenges` is absent),
  // and give each monster-type payload's loadout React keys for its inline editor.
  const challenges = migrateChallenges(e).map((c) =>
    c.type === 'monster' || c.type === 'hazard' || c.type === 'affliction'
      ? { ...c, monster: { ...c.monster, loadout: (c.monster?.loadout || []).map(withKey) } }
      : c,
  )
  return {
    ...e,
    challenges,
    treasure,
    treasure_pools: pools,
    xp_awards: (e.xp_awards || []).map(withKey),
    rewards: (e.rewards || []).map(withKey),
    exits: (e.exits || []).map(withKey),
  }
}

// gameIdOf resolves a monster/treasure line's content game_id — the single rule
// both persistence (hasRef) and rendering (MonsterLine/TreasureLine) share, so
// they can't drift. A pristine ref carries game_id; a templated (derived) ref
// carries base.game_id. '' when the row is still being filled.
export function gameIdOf(line) {
  return line?.ref?.game_id || line?.ref?.base?.game_id || ''
}

// A monster/treasure line is persistable once it resolves to a game_id. A freshly-
// added row ({ ref: { game_id: '' } }) is still being filled and is dropped from
// the PUT body: it has nothing to save yet, and the API rejects an empty ref.
export function hasRef(line) {
  return Boolean(gameIdOf(line))
}

// A freeform/custom treasure item — one not in the pfsrd2 catalog (a gem, art
// object, trophy, quest item like AV's "peridot bead, 2 gp"). It rides in the
// ContentRef's opaque `json` field, which the API stores as-is and validates as
// non-empty content, so this needs no data/API change. Shape:
//   ref: { json: { name, value_cp } }   — value_cp null = unvalued (a worthless
//   trophy is 0); distinguished from a derived ref (which carries a base) and a
//   catalog ref (a game_id).
export function customTreasureRef(name = '', valueCp = null) {
  return { json: { name, value_cp: valueCp } }
}
// Custom-item value is stored in copper (matching the budget); the UI edits gp.
// An empty field is `null` (unvalued), NOT 0 — the two are distinct (a 0-gp trophy
// counts as 0; an unvalued item floors the total). Number('') === 0, so the empty
// case must be handled before coercing.
export const gpToCp = (str) => (str === '' ? null : Math.round(Number(str) * 100))
export const cpToGp = (cp) => (cp == null ? '' : cp / 100)
export function isCustomTreasure(line) {
  const r = line?.ref
  return Boolean(r?.json) && !r.game_id && !r.base
}
// A treasure line references content (kept by the save filter) when it has a
// catalog game_id, a derived base, or a custom item with ACTUAL content — a name or
// a value. A freshly-added blank custom row (autosave caught mid-add, before the GM
// types anything) is dropped like an empty catalog row, so it doesn't persist and
// reload as a permanently-unvalued ghost line.
export function hasTreasureContent(line) {
  if (hasRef(line)) return true
  if (!isCustomTreasure(line)) return false
  const j = line.ref.json
  return Boolean(j?.name?.trim()) || j?.value_cp != null
}

// Build the PUT body (EncounterInput) from an encounter. Shared by the editor's
// autosave and the sidebar's "move to chapter" so both send the exact same shape
// — PUT replaces the resource, so every field must be echoed (a partial body
// would blank the omitted fields). Client-only _key/_name are stripped;
// half-filled rows without a ref are dropped. `status` is included only when
// present (release is a separate endpoint).
// Serialize a treasure line for the API: drop the client-only _key and an empty
// value_tiers (all tiers null) — the API rejects value_tiers with no tier set, so an
// in-progress "variable value" toggle isn't sent until the GM enters a number.
export function treasureLineInput(line) {
  const { _key, value_tiers, ...rest } = line
  const hasTier =
    value_tiers &&
    [value_tiers.crit_success, value_tiers.success, value_tiers.failure, value_tiers.crit_failure].some(
      (n) => typeof n === 'number',
    )
  return hasTier ? { ...rest, value_tiers } : rest
}

// A gate only counts once it's complete (skill + dc >= 1) — the API rejects an
// empty {}, so an in-progress "gated" toggle isn't sent until the GM fills it in.
function poolGateInput(gate) {
  if (gate && gate.skill?.trim() && gate.dc >= 1) return { skill: gate.skill.trim(), dc: gate.dc }
  return undefined
}

// Pools to persist: those referenced by a kept treasure line, or carrying their
// own content (name / description / a complete gate). An empty, unused default pool
// is dropped so it doesn't linger as a ghost — the client re-materializes one when
// loot returns.
function treasurePoolsInput(enc) {
  const kept = (enc.treasure || []).filter(hasTreasureContent)
  const usedIds = new Set(kept.map((t) => t.pool_id).filter(Boolean))
  const out = []
  for (const p of enc.treasure_pools || []) {
    if (!p.id) continue
    const gate = poolGateInput(p.gate)
    if (usedIds.has(p.id) || p.name?.trim() || p.description?.trim() || gate) {
      out.push({ id: p.id, name: p.name || '', description: p.description || '', gate })
    }
  }
  return out
}

// The encounter's markdown body as titled blocks. text_blocks is authoritative; a
// legacy single `description` (pre-blocks) surfaces as ONE untitled block so it stays
// visible and migrates into text_blocks on the next save. Used by both the editor
// (display) and toEncounterInput (serialization) so the two never diverge.
export function encounterBlocks(enc) {
  if (enc?.text_blocks?.length) return enc.text_blocks
  if (enc?.description) return [{ title: '', body: enc.description }]
  return []
}

// A block list → its serialized form: trim titles, drop rows with neither title
// nor body. Shared by text_blocks and challenge_blocks so they never diverge.
function blocksInput(blocks) {
  return (blocks || [])
    .map((b) => ({ title: (b.title || '').trim(), body: b.body || '' }))
    .filter((b) => b.title || b.body)
}

// ── Unified Challenges list ────────────────────────────────────────────────────
// One ordered, drag-reorderable list interleaving monster / hazard / affliction /
// skill-check / markdown items. Supersedes the separate monsters/hazards/afflictions/
// skill_checks/challenge_blocks arrays: those are migrated in on load (keyed) and
// cleared on save, so `challenges` becomes authoritative — the description→text_blocks
// pattern. Each item is { id, type, monster? | skill_check? | markdown? } (monster
// carries monster/hazard/affliction, distinguished by type); id is the stable reorder key.
export const CHALLENGE_TYPES = ['monster', 'hazard', 'affliction', 'skill_check', 'markdown']
export const CHALLENGE_TYPE_LABELS = {
  monster: 'Monster',
  hazard: 'Hazard',
  affliction: 'Affliction',
  skill_check: 'Skill check',
  markdown: 'Markdown section',
}

export function emptyChallenge(type) {
  const id = crypto.randomUUID()
  if (type === 'monster' || type === 'hazard' || type === 'affliction')
    return { id, type, monster: { ref: { game_id: '' }, count: 1, adjustment: 'none', nickname: '', loadout: [] } }
  if (type === 'skill_check') return { id, type, skill_check: { skill: '', dc: 0, description: '' } }
  return { id, type: 'markdown', markdown: { title: '', body: '' } }
}

// Build the unified list from a raw encounter: its `challenges` if present, else the
// legacy arrays in their old section order (monsters, hazards, afflictions, skill
// checks, then challenge markdown). Every item gets a stable id.
export function migrateChallenges(e) {
  if (e?.challenges?.length) return e.challenges.map((c) => ({ ...c, id: c.id || crypto.randomUUID() }))
  const out = []
  for (const m of e?.monsters || []) out.push({ id: crypto.randomUUID(), type: 'monster', monster: m })
  for (const h of e?.hazards || []) out.push({ id: crypto.randomUUID(), type: 'hazard', monster: h })
  for (const a of e?.afflictions || []) out.push({ id: crypto.randomUUID(), type: 'affliction', monster: a })
  for (const s of e?.skill_checks || []) out.push({ id: crypto.randomUUID(), type: 'skill_check', skill_check: s })
  for (const b of e?.challenge_blocks || []) out.push({ id: crypto.randomUUID(), type: 'markdown', markdown: b })
  return out
}

export function challengeItems(enc) {
  return enc?.challenges || []
}

// Move item `fromId` to sit where `toId` is (drag-reorder). Pure so the splice
// arithmetic is testable. Unknown ids or a no-op move return the list unchanged.
export function reorderById(list, fromId, toId) {
  if (fromId === toId) return list
  const from = (list || []).findIndex((c) => c.id === fromId)
  const to = (list || []).findIndex((c) => c.id === toId)
  if (from < 0 || to < 0) return list
  const arr = [...list]
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  return arr
}
// Typed views for the difficulty budget + entry prefetch. Prefer the unified list;
// fall back to a legacy array for an encounter not yet migrated (e.g. a raw rollup
// sibling that never passed through keyed()).
export function challengeMonsters(enc) {
  return enc?.challenges ? enc.challenges.filter((c) => c.type === 'monster').map((c) => c.monster || {}) : enc?.monsters || []
}
export function challengeHazards(enc) {
  return enc?.challenges ? enc.challenges.filter((c) => c.type === 'hazard').map((c) => c.monster || {}) : enc?.hazards || []
}
export function challengeAfflictions(enc) {
  return enc?.challenges ? enc.challenges.filter((c) => c.type === 'affliction').map((c) => c.monster || {}) : enc?.afflictions || []
}
export function challengeSkillChecks(enc) {
  return enc?.challenges ? enc.challenges.filter((c) => c.type === 'skill_check').map((c) => c.skill_check || {}) : enc?.skill_checks || []
}

// Serialize the unified list for a save: drop incomplete placeholders (a monster with
// no ref, a skill check without skill + DC≥1, an empty markdown), cleaning each payload
// through its existing serializer. Keeps id + type so reorder identity is stable.
export function challengesInput(enc) {
  const out = []
  for (const c of enc?.challenges || []) {
    if (c.type === 'monster' || c.type === 'hazard' || c.type === 'affliction') {
      if (!hasRef(c.monster || {})) continue
      out.push({ id: c.id, type: c.type, monster: monsterInput(c.monster) })
    } else if (c.type === 'skill_check') {
      const s = skillCheckInput(c.skill_check || {})
      if (!(s.skill && s.dc >= 1)) continue
      out.push({ id: c.id, type: c.type, skill_check: s })
    } else if (c.type === 'markdown') {
      const [md] = blocksInput([c.markdown || {}])
      if (!md) continue
      out.push({ id: c.id, type: c.type, markdown: md })
    }
  }
  return out
}

// When markdown block `removed` is deleted, every higher block shifts down one, so the
// set of edit-mode block indices must remap: indices below `removed` stay, the removed
// one drops, and indices above decrement. Pure so the off-by-one is testable.
export function reindexEditingAfterRemove(editing, removed) {
  const next = new Set()
  for (const k of editing) {
    if (k < removed) next.add(k)
    else if (k > removed) next.add(k - 1)
  }
  return next
}

export function toEncounterInput(enc) {
  const input = {
    name: enc.name,
    chapter_id: enc.chapter_id || '',
    // Markdown body: titled blocks. Migrate-on-save — a legacy `description` folds
    // into an untitled block (encounterBlocks) and description clears here, so it's
    // written once and never double-counted. Empty blocks (no title + no body) drop.
    text_blocks: blocksInput(encounterBlocks(enc)),
    description: '',
    notes: enc.notes || '',
    // Unified Challenges list (supersedes monsters/hazards/afflictions/skill_checks/
    // challenge_blocks — those are omitted here so the full-replace PUT clears them).
    challenges: challengesInput(enc),
    treasure: (enc.treasure || []).filter(hasTreasureContent).map(treasureLineInput),
    treasure_pools: treasurePoolsInput(enc),
    xp_awards: (enc.xp_awards || []).map(awardInput).filter((a) => a.amount > 0),
    room_type: enc.room_type || 'combat',
    rewards: (enc.rewards || []).map(rewardInput).filter((r) => r.label),
    // Keep every exit row, INCLUDING blank ones — a "+ exit" placeholder must persist
    // so it survives a navigate-away before the GM fills in the target/label (the map
    // ignores empty exits; the API accepts them). Don't filter here.
    exits: (enc.exits || []).map(exitInput),
    currency: enc.currency || {},
  }
  // Party overrides use the shared clear-encoding: set when overridden, omitted
  // when nil so the full-replace PUT clears back to inherit (encounter -> chapter
  // -> campaign).
  Object.assign(input, partyFields(enc))
  if (enc.status) input.status = enc.status
  return input
}

// The exact PUT body for a save: toEncounterInput plus the rule that a released
// encounter's body must not carry status — release is its own endpoint, so a
// regular save/move must never move status. (Today's callers only save drafts,
// so the strip is defensive; the invariant is asserted in the tests.)
export function buildInput(enc) {
  const input = toEncounterInput(enc)
  if (enc.status === 'released') delete input.status
  return input
}

export function emptyMonster() {
  return withKey({ ref: { game_id: '' }, count: 1, adjustment: 'none', nickname: '', loadout: [] })
}

// One piece of a monster's equipment loadout (0o77): a catalog or composed (runed)
// item ref + qty (+ variant). Same ref shape as treasure — ItemComposeView authors
// it, budget.js prices it, and "send to treasure" copies it into the loot.
export function emptyLoadoutItem() {
  return withKey({ ref: { game_id: '' }, qty: 1, variant: '' })
}

// Serialize a loadout item for the API: drop _key, keep ref opaque, floor qty at 1,
// include variant only when set.
export function loadoutItemInput(item) {
  const { _key, ...rest } = item
  return {
    ref: rest.ref,
    qty: Math.max(1, Math.round(Number(rest.qty) || 1)),
    ...(rest.variant ? { variant: rest.variant } : {}),
  }
}

// Serialize a monster line: drop _key and clean its loadout (drop ref-less rows +
// their _keys). Loadout is omitted when empty so the wire stays minimal.
export function monsterInput(m) {
  const { _key, loadout, ...rest } = m
  const lo = (loadout || []).filter(hasRef).map(loadoutItemInput)
  return lo.length ? { ...rest, loadout: lo } : rest
}

// A hazard row: ref + count (a haunt/hazard has no elite/weak, so no adjustment).
export function emptyHazard() {
  return withKey({ ref: { game_id: '' }, count: 1, nickname: '' })
}

// An affliction row (curse/disease): ref + count. No elite/weak (no adjustment) and no
// nickname — AfflictionLine derives its label purely from the entry name, so a nickname
// field would be dead weight that only round-trips an empty string to the API.
export function emptyAffliction() {
  return withKey({ ref: { game_id: '' }, count: 1 })
}

// A non-combat XP award line (story/exploration/quest milestone, ally recruited).
// amount is XP; reason is the GM's label. _key is the client-only React key.
export function emptyAward() {
  return withKey({ amount: 0, reason: '' })
}

// Serialize an XP award for the API: drop the client _key, coerce amount to a
// whole number, trim the reason. Empty/zero-amount lines are filtered out by the
// caller (the API rejects amount < 1). amount is rounded to an integer because the
// API's Go `int` rejects a fractional JSON number outright — which would fail the
// whole PUT and surface only as an opaque "Save failed" (XP is always whole anyway).
export function awardInput(a) {
  const { _key, ...rest } = a
  return { amount: Math.round(Number(rest.amount) || 0), reason: (rest.reason || '').trim() }
}

// A non-treasure reward slot (information/ritual/ally/item). kind + a short label,
// with optional GM markdown. _key is the client-only React key.
export function emptyReward() {
  return withKey({ kind: 'information', label: '', description: '' })
}

// Serialize a reward for the API: drop the client _key, trim the label. Rows with
// an empty label are filtered out by the caller (the API requires a label).
export function rewardInput(r) {
  const { _key, ...rest } = r
  return { kind: rest.kind, label: (rest.label || '').trim(), description: rest.description || '' }
}

// A structured skill-check / discovery entry (e.g. "DC 12 Perception to spot the
// loose planks"). skill + dc + a markdown effect. _key is the client-only React key.
export function emptySkillCheck() {
  return withKey({ skill: '', dc: 0, description: '' })
}

export const SKILL_CHECK_DEGREES = ['crit_success', 'success', 'failure', 'crit_failure']
export const SKILL_CHECK_DEGREE_LABELS = {
  crit_success: 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  crit_failure: 'Critical Failure',
}

// Serialize a skill check for the API: drop the client _key, trim the skill, coerce
// dc to a whole number. Incomplete rows (no skill or dc < 1) are filtered by the
// caller (the API requires skill + dc >= 1). dc is rounded because the API's Go
// `int` rejects a fractional JSON number outright — which would fail the whole PUT
// as an opaque "Save failed" (DCs are always whole anyway).
export function skillCheckInput(s) {
  const { _key, ...rest } = s
  const out = { skill: (rest.skill || '').trim(), dc: Math.round(Number(rest.dc) || 0), description: rest.description || '' }
  // xhwl: richer structure, all optional. Successes only when >1 (1 is the default);
  // alternatives dropped if incomplete (API requires skill + dc>=1); outcomes keep
  // only the non-empty degrees.
  const successes = Math.round(Number(rest.successes) || 0)
  if (successes > 1) out.successes = successes
  const alternatives = (rest.alternatives || [])
    .map((a) => ({ skill: (a.skill || '').trim(), dc: Math.round(Number(a.dc) || 0) }))
    .filter((a) => a.skill && a.dc >= 1)
  if (alternatives.length) out.alternatives = alternatives
  const outcomes = {}
  for (const k of SKILL_CHECK_DEGREES) if ((rest.outcomes?.[k] || '').trim()) outcomes[k] = rest.outcomes[k]
  if (Object.keys(outcomes).length) out.outcomes = outcomes
  return out
}

// The one-line label for a skill check — "Perception DC 18", "Thievery DC 25 ×4",
// "Thievery DC 22 or Religion DC 20". Shared by the read-only editor + print sheet.
export function skillCheckLabel(s) {
  let base = `${s.skill || 'Skill'}${s.dc ? ` DC ${s.dc}` : ''}`
  if (Number(s.successes) > 1) base += ` ×${s.successes}`
  for (const a of s.alternatives || []) if (a.skill && a.dc) base += ` or ${a.skill} DC ${a.dc}`
  return base
}

// An exit / connectivity edge: a passage to another encounter (to_encounter_id, a
// soft reference) or an external destination named by label ("Exterior"). `secret`
// marks a secret door (per-direction), and skill/dc are an optional check to find or
// traverse it. _key is the client-only React key.
export function emptyExit() {
  return withKey({ to_encounter_id: '', label: '', secret: false, skill: '', dc: 0 })
}

// Incoming connectivity for the exits editor: sibling encounters whose exits point AT
// `encounterId`. One entry per source (deduped), each with its `label` and a
// `connected` flag — true when this room already links back (the passage is two-way).
// Pure/testable; the editor renders these + a "connect" that adds the reciprocal exit.
export function incomingLinks(encounterId, siblingEncounters, currentExits) {
  const id = String(encounterId)
  const backLinks = new Set((currentExits || []).map((e) => String(e.to_encounter_id)).filter(Boolean))
  const out = []
  const seen = new Set()
  for (const s of siblingEncounters || []) {
    const sid = String(s.id)
    if (sid === id || seen.has(sid)) continue
    const hit = (s.exits || []).find((x) => String(x.to_encounter_id) === id)
    if (!hit) continue
    seen.add(sid)
    out.push({ id: sid, name: s.name || 'Untitled', label: hit.label || '', connected: backLinks.has(sid) })
  }
  return out
}

// Serialize an exit for the API: drop the client _key, trim the label/skill, round DC.
export function exitInput(e) {
  const { _key, ...rest } = e
  return {
    to_encounter_id: rest.to_encounter_id || '',
    label: (rest.label || '').trim(),
    secret: !!rest.secret,
    skill: (rest.skill || '').trim(),
    dc: Math.round(Number(rest.dc) || 0),
  }
}

export function emptyTreasure() {
  return withKey({
    ref: { game_id: '' },
    qty: 1,
    variant: '', // chosen version by name (e.g. "Striking (Greater)"); '' = none picked yet
    masked: false,
    mask_label: '',
    identify_dc: 0,
    sale_class: 'normal',
    state: 'intact',
  })
}

// clearSaveErrorOnSave decides whether an app-level save-error banner should clear
// when a record saves. It clears ONLY when the record that just saved is the SAME
// one that failed (matched by id) — a DIFFERENT record saving must not wipe record
// X's still-unsaved warning (views are mutually exclusive, so X isn't on screen to
// re-fail). ids may be number (list) or string (URL restore), so compare as strings.
// Returns the next saveError value: null to clear, or the unchanged {what,id}. (3kni)
export function clearSaveErrorOnSave(saveError, saved) {
  if (!saveError || !saved || saved.id == null || saveError.id == null) return saveError
  return String(saveError.id) === String(saved.id) ? null : saveError
}
