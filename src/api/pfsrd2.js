// Client for pfsrd2-data-api (/api/pfsrd2/*) — public game data, same-origin
// through the edge (the shared request() attaches X-Access-Token, which pfsrd2
// ignores). Used to search monsters and load full stat blocks for rendering.
//
// Note: pfsrd2 game_ids here are "Monsters:3028" / "NPCs:3025" form — this is the
// id the API looks entries up by, and exactly what the encounter monster ref
// stores so a later view can re-fetch the same creature.
import { request, buildHeaders, bodyHash } from './client.js'
import { getToken } from './token.js'
import { config } from '../config.js'

// pfsrd2 game ids look like "Monsters:2382" — the colon is part of the id and
// the API matches on the RAW colon (encoding it to %3A 404s). Encode everything
// else but keep the colon, matching the pfsrd2-display harness.
function gameIdPath(gameId) {
  return encodeURIComponent(gameId).replace(/%3A/gi, ':')
}

// Item content types, shared by the item suggest/trait/facet queries.
const ITEM_TYPES = ['equipment', 'weapons', 'armor', 'shields']

export const pfsrd2 = {
  // The standard character skills (name + key ability) for the skill-check picker.
  listSkills: (opts) => request('GET', '/api/pfsrd2/skills', opts),
  // Autocomplete over monsters + NPCs. The library CreatureSearch calls this as
  // search(q, filters); filters = { traits: string[] } → the API's comma-separated
  // traits param. Returns [{ game_id, name, type, level, edition, ... }].
  // The library calls these as search(q, filters) / suggestTraits(prefix, selected
  // [, context]) / loadFacets(); the trailing `opts` (never passed by the library)
  // is the request DI seam used by tests, mirroring entryFull/applyTemplatePost.
  suggestMonsters: (q, filters = {}, opts = {}) => {
    const params = new URLSearchParams({ q })
    params.append('type', 'monsters')
    params.append('type', 'npcs')
    if (filters.traits?.length) params.set('traits', filters.traits.join(','))
    if (filters.levelMin) params.set('level_min', filters.levelMin)
    if (filters.levelMax) params.set('level_max', filters.levelMax)
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },
  // Autocomplete over hazards + weather hazards, for the encounter's SEPARATE
  // "add hazard" search (not folded into the monster search). Same result shape as
  // suggestMonsters (game_id, name, type, level); the library CreatureSearch drives
  // it as search(q, filters).
  suggestHazards: (q, filters = {}, opts = {}) => {
    const params = new URLSearchParams({ q })
    params.append('type', 'hazards')
    params.append('type', 'weatherhazards')
    if (filters.levelMin) params.set('level_min', filters.levelMin)
    if (filters.levelMax) params.set('level_max', filters.levelMax)
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },
  // Autocomplete over afflictions (curses + diseases), for the encounter's SEPARATE
  // "add affliction" search. Same result shape as suggestMonsters.
  suggestAfflictions: (q, filters = {}, opts = {}) => {
    const params = new URLSearchParams({ q })
    params.append('type', 'curses')
    params.append('type', 'diseases')
    if (filters.levelMin) params.set('level_min', filters.levelMin)
    if (filters.levelMax) params.set('level_max', filters.levelMax)
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },
  // Co-occurring trait typeahead for the CreatureSearch trait filter: only traits
  // that still narrow the current (type + selected) set.
  suggestMonsterTraits: (prefix, selected = [], opts = {}) => {
    const params = new URLSearchParams({ limit: '10' })
    if (prefix) params.set('q', prefix)
    params.append('type', 'monsters')
    params.append('type', 'npcs')
    for (const t of selected) params.append('trait', t)
    return request('GET', `/api/pfsrd2/search/traits?${params.toString()}`, opts)
  },
  // Autocomplete over items. filters = { traits, category, subcategory } from the
  // library ItemSearch. Same result shape as suggestMonsters.
  suggestItems: (q, filters = {}, opts = {}) => {
    const params = new URLSearchParams({ q })
    for (const t of ITEM_TYPES) params.append('type', t)
    if (filters.traits?.length) params.set('traits', filters.traits.join(','))
    if (filters.category) params.set('category', filters.category)
    if (filters.subcategory) params.set('subcategory', filters.subcategory)
    if (filters.levelMin) params.set('level_min', filters.levelMin)
    if (filters.levelMax) params.set('level_max', filters.levelMax)
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },
  // Co-occurring trait typeahead for the ItemSearch trait filter, narrowed by the
  // active facet (3rd arg { category, subcategory } from the library).
  suggestItemTraits: (prefix, selected = [], context = {}, opts = {}) => {
    const params = new URLSearchParams({ limit: '10' })
    if (prefix) params.set('q', prefix)
    for (const t of ITEM_TYPES) params.append('type', t)
    for (const t of selected) params.append('trait', t)
    if (context.category) params.set('category', context.category)
    if (context.subcategory) params.set('subcategory', context.subcategory)
    return request('GET', `/api/pfsrd2/search/traits?${params.toString()}`, opts)
  },
  // Category → subcategories map for the ItemSearch facet dropdowns.
  loadItemFacets: async (opts = {}) => {
    const params = new URLSearchParams()
    for (const t of ITEM_TYPES) params.append('type', t)
    const data = await request('GET', `/api/pfsrd2/search/facets?${params.toString()}`, opts)
    return data.categories
  },
  // Full creature entry (with schema_version) for CreatureStatBlock.
  entryFull: (gameId, opts = {}) =>
    request('GET', `/api/pfsrd2/entries/${gameIdPath(gameId)}/full`, opts),

  // Spell autocomplete for the item composer's spell-holder typeahead (a scroll or
  // wand of X). Returns [{ game_id, name, level, ... }]; the apply endpoint enforces
  // the holder's rank/type boundary.
  suggestSpells: (q, opts = {}) => {
    const params = new URLSearchParams({ q, limit: '10' })
    params.append('type', 'spells')
    return request('GET', `/api/pfsrd2/search/suggest/unified?${params.toString()}`, opts)
  },

  // For the library's listTemplates({ get }): get(path) -> parsed JSON, path
  // relative to /api/pfsrd2 (e.g. /search?type=monster_templates&applicable_to=…).
  // Also backs the item-templating GET for fetchEligible({ get }) → the eligible
  // path carries a raw-colon game_id, which this passes through un-encoded (the
  // API matches on the raw colon; %3A 404s), matching applyItemPost below.
  templatesGet: (path, opts = {}) => request('GET', `/api/pfsrd2${path}`, opts),

  // For the library's applyItemEffect({ post }): a SIGNED raw POST to
  // /entries/{item}/apply/{effect}?grade=N that returns the raw Response (the
  // library reads res.ok/json itself). Same OAC signing as applyTemplatePost; the
  // path (with raw-colon game_ids and a grade query) comes from the library.
  applyItemPost: async (path, bodyStr, { tokenProvider = getToken, fetchImpl = fetch } = {}) => {
    const token = await tokenProvider()
    const headers = buildHeaders(token, { json: true })
    headers['x-amz-content-sha256'] = await bodyHash(bodyStr)
    return fetchImpl(`${config.apiBase}/api/pfsrd2${path}`, {
      method: 'POST',
      headers,
      body: bodyStr,
    })
  },

  // For the library's applyTemplate({ post }): a SIGNED raw POST to
  // /templates/apply that returns the raw Response (the library parses the
  // multipart body itself). Same OAC signing as request(); it doesn't throw —
  // applyTemplate checks res.ok.
  applyTemplatePost: async (bodyStr, { tokenProvider = getToken, fetchImpl = fetch } = {}) => {
    const token = await tokenProvider()
    const headers = buildHeaders(token, { json: true })
    headers['x-amz-content-sha256'] = await bodyHash(bodyStr)
    return fetchImpl(`${config.apiBase}/api/pfsrd2/templates/apply`, {
      method: 'POST',
      headers,
      body: bodyStr,
    })
  },
}
