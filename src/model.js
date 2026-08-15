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
  return {
    ...e,
    monsters: (e.monsters || []).map(withKey),
    treasure,
    treasure_pools: pools,
    xp_awards: (e.xp_awards || []).map(withKey),
    rewards: (e.rewards || []).map(withKey),
    skill_checks: (e.skill_checks || []).map(withKey),
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

export function toEncounterInput(enc) {
  const input = {
    name: enc.name,
    chapter_id: enc.chapter_id || '',
    description: enc.description || '',
    notes: enc.notes || '',
    monsters: (enc.monsters || []).filter(hasRef).map(stripKey),
    treasure: (enc.treasure || []).filter(hasTreasureContent).map(treasureLineInput),
    treasure_pools: treasurePoolsInput(enc),
    xp_awards: (enc.xp_awards || []).map(awardInput).filter((a) => a.amount > 0),
    room_type: enc.room_type || 'combat',
    rewards: (enc.rewards || []).map(rewardInput).filter((r) => r.label),
    skill_checks: (enc.skill_checks || []).map(skillCheckInput).filter((s) => s.skill && s.dc >= 1),
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
  return withKey({ ref: { game_id: '' }, count: 1, adjustment: 'none', nickname: '' })
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

// Serialize a skill check for the API: drop the client _key, trim the skill, coerce
// dc to a whole number. Incomplete rows (no skill or dc < 1) are filtered by the
// caller (the API requires skill + dc >= 1). dc is rounded because the API's Go
// `int` rejects a fractional JSON number outright — which would fail the whole PUT
// as an opaque "Save failed" (DCs are always whole anyway).
export function skillCheckInput(s) {
  const { _key, ...rest } = s
  return { skill: (rest.skill || '').trim(), dc: Math.round(Number(rest.dc) || 0), description: rest.description || '' }
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
