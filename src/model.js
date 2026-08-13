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

// Build the PUT body (EncounterInput) from an encounter. Shared by the editor's
// save and the sidebar's "move to chapter" so both send the exact same shape —
// PUT replaces the resource, so every field must be echoed (a partial body would
// blank the omitted fields). Client-only _key/_name are stripped. `status` is
// included only when present (release is a separate endpoint).
export function toEncounterInput(enc) {
  const input = {
    name: enc.name,
    chapter_id: enc.chapter_id || '',
    description: enc.description || '',
    notes: enc.notes || '',
    monsters: (enc.monsters || []).map(stripKey),
    treasure: (enc.treasure || []).map(stripKey),
    currency: enc.currency || {},
  }
  if (enc.status) input.status = enc.status
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
