// Client for pfsrd2-data-api (/api/pfsrd2/*) — public game data, same-origin
// through the edge (the shared request() attaches X-Access-Token, which pfsrd2
// ignores). Used to search monsters and load full stat blocks for rendering.
//
// Note: pfsrd2 game_ids here are "Monsters:3028" / "NPCs:3025" form — this is the
// id the API looks entries up by, and exactly what the encounter monster ref
// stores so a later view can re-fetch the same creature.
import { request } from './client.js'

// pfsrd2 game ids look like "Monsters:2382" — the colon is part of the id and
// the API matches on the RAW colon (encoding it to %3A 404s). Encode everything
// else but keep the colon, matching the pfsrd2-display harness.
function gameIdPath(gameId) {
  return encodeURIComponent(gameId).replace(/%3A/gi, ':')
}

export const pfsrd2 = {
  // Autocomplete over monsters + NPCs. Returns [{ game_id, name, type, level, edition, ... }].
  suggestMonsters: (q, opts = {}) => {
    const params = new URLSearchParams({ q })
    params.append('type', 'monsters')
    params.append('type', 'npcs')
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },
  // Autocomplete over items (equipment/weapons/armor/shields). Same result shape
  // as suggestMonsters, so the library ItemSearch consumes it directly.
  suggestItems: (q, opts = {}) => {
    const params = new URLSearchParams({ q })
    for (const t of ['equipment', 'weapons', 'armor', 'shields']) params.append('type', t)
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },
  // Full creature entry (with schema_version) for CreatureStatBlock.
  entryFull: (gameId, opts = {}) =>
    request('GET', `/api/pfsrd2/entries/${gameIdPath(gameId)}/full`, opts),
}
