// Expected-party inheritance: an encounter's effective party level + PC count is
// resolved encounter -> chapter -> campaign settings -> app default. Each layer
// stores nullable party_level/party_size; nil means "inherit from the layer
// below". The API stores the raw overrides (Slice 1); resolution lives here.

// PF2e's tables assume a party of four; level 1 is where play starts. Used when
// no layer sets a value.
export const PARTY_DEFAULT = { level: 1, size: 4 }

// The inheritance order, highest-precedence first.
const LAYER_ORDER = ['encounter', 'chapter', 'campaign']

// resolveField returns the first non-null value for `field` across the layers,
// with the source it came from (or 'default' when none set it).
function resolveField(field, layers) {
  for (const name of LAYER_ORDER) {
    const v = layers[name] && layers[name][field]
    if (v !== null && v !== undefined) return { value: v, source: name }
  }
  return { value: null, source: 'default' }
}

// resolveParty({ encounter, chapter, campaign }) -> the effective { level, size }
// plus where each came from ('encounter' | 'chapter' | 'campaign' | 'default').
// Any layer may be null/undefined/absent. Sources let the UI show "inherited
// from chapter" vs an explicit override.
export function resolveParty(layers = {}) {
  const lvl = resolveField('party_level', layers)
  const sz = resolveField('party_size', layers)
  return {
    level: lvl.value ?? PARTY_DEFAULT.level,
    size: sz.value ?? PARTY_DEFAULT.size,
    levelSource: lvl.source,
    sizeSource: sz.source,
  }
}

// Human label for an inheritance source, for hints like "inherited from chapter".
export function sourceLabel(source) {
  return { encounter: 'this encounter', chapter: 'chapter', campaign: 'campaign', default: 'default' }[source] || source
}

// partyFields builds the party portion of a PUT body from an override value,
// including a field only when it's set. This is the single clear-encoding
// convention across every writer (encounter, chapter, campaign settings, chapter
// rename): a nil override is OMITTED, and the full-replace PUT clears it back to
// inherit. (The API collapses absent and JSON null to a nil pointer, but keeping
// one encoding avoids relying on that.)
export function partyFields(value) {
  const out = {}
  if (value?.party_level != null) out.party_level = value.party_level
  if (value?.party_size != null) out.party_size = value.party_size
  return out
}
