import { partyFields } from './party.js'

// Enum values mirroring encounter-builder-api's model (internal/model/model.go).
// The API validates + normalizes these, so the UI just offers the valid choices.
export const ADJUSTMENTS = ['none', 'elite', 'weak']
export const SALE_CLASSES = ['normal', 'pure_treasure']
export const TREASURE_STATES = ['intact', 'consumed', 'destroyed']

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
export function keyed(e) {
  return {
    ...e,
    monsters: (e.monsters || []).map(withKey),
    treasure: (e.treasure || []).map(withKey),
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

// Build the PUT body (EncounterInput) from an encounter. Shared by the editor's
// autosave and the sidebar's "move to chapter" so both send the exact same shape
// — PUT replaces the resource, so every field must be echoed (a partial body
// would blank the omitted fields). Client-only _key/_name are stripped;
// half-filled rows without a ref are dropped. `status` is included only when
// present (release is a separate endpoint).
export function toEncounterInput(enc) {
  const input = {
    name: enc.name,
    chapter_id: enc.chapter_id || '',
    description: enc.description || '',
    notes: enc.notes || '',
    monsters: (enc.monsters || []).filter(hasRef).map(stripKey),
    treasure: (enc.treasure || []).filter(hasRef).map(stripKey),
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
