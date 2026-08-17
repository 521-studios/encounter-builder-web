// localStore — the in-browser source of truth for the no-sign-in encounter
// builder. It implements the same method surface as the encounters/chapters/
// settings/letsroll API clients, but reads/writes a single localStorage blob
// instead of the server. The API clients delegate here when isAnon() (see
// api/anon.js), so every existing component keeps working unchanged.
//
// Shape parity matters: the editor reads back `saved.id/name/chapter_id/status`
// and ChapterTree reads `enc.id` on create, so these methods MINT ids and echo
// full, server-shaped records — they are not no-ops. Ids are client-minted
// UUIDs (crypto.randomUUID, already used in model.js); the server's own id
// algorithm is opaque and never depended on.
//
// This is the shared "store" the project is converging on — today filled from
// localStorage for anon; a later pass fills it from the API for the authed app
// too. See the project_quick_encounter_builder memory.

const STORAGE_KEY = 'eb:anon:v1'

// The quick tool has no campaign/chapter ceremony: one synthetic campaign holds
// a flat list of encounters. am_gm:true so CampaignList surfaces it.
export const LOCAL_CAMPAIGN = { id: 'local', name: 'My Encounters', gm_user_id: 'local', am_gm: true }

const uuid = () => crypto.randomUUID()

// A fresh encounter's server-supplied defaults, so list/get records are
// well-formed even before the editor has touched every field.
const encounterDefaults = () => ({
  status: 'draft',
  currency: {},
  monsters: [],
  hazards: [],
  afflictions: [],
  treasure: [],
  treasure_pools: [],
  xp_awards: [],
  rewards: [],
  skill_checks: [],
  exits: [],
})

function emptyState() {
  return { encounters: {}, chapters: {}, settings: {} }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    return {
      encounters: parsed.encounters || {},
      chapters: parsed.chapters || {},
      settings: parsed.settings || {},
    }
  } catch {
    // Corrupt blob or storage unavailable (private mode) — start clean rather
    // than crash the app.
    return emptyState()
  }
}

let state = load()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota/private mode: keep working from in-memory state; the session's work
    // just won't survive a reload. Non-fatal by design.
  }
}

// Reset — used by tests and (later) a "clear my work" control.
export function resetLocalStore() {
  state = emptyState()
  persist()
}

export const localStore = {
  // Single synthetic campaign, shaped like a lets-roll game row.
  games: () => [LOCAL_CAMPAIGN],

  encounters: {
    list: () => Object.values(state.encounters),
    get: (id) => {
      const e = state.encounters[id]
      if (!e) throw new Error(`encounter ${id} not found`)
      return e
    },
    create: (input = {}) => {
      const rec = { ...encounterDefaults(), ...input, id: uuid() }
      // create input never carries a status; keep the default 'draft'.
      rec.status = 'draft'
      state.encounters[rec.id] = rec
      persist()
      return rec
    },
    update: (id, input = {}) => {
      // Full replace (PUT semantics), but preserve id and the server-owned
      // status (release is the only thing that flips it).
      const prev = state.encounters[id]
      const rec = { ...input, id, status: prev?.status || 'draft' }
      state.encounters[id] = rec
      persist()
      return rec
    },
    remove: (id) => {
      delete state.encounters[id]
      persist()
      return null
    },
    release: (id) => {
      const prev = state.encounters[id]
      if (!prev) throw new Error(`encounter ${id} not found`)
      const rec = { ...prev, status: 'released' }
      state.encounters[id] = rec
      persist()
      return rec
    },
  },

  chapters: {
    list: () => Object.values(state.chapters),
    create: (input = {}) => {
      const rec = { ...input, id: uuid() }
      state.chapters[rec.id] = rec
      persist()
      return rec
    },
    update: (id, input = {}) => {
      const rec = { ...input, id }
      state.chapters[id] = rec
      persist()
      return rec
    },
    remove: (id) => {
      delete state.chapters[id]
      persist()
      return null
    },
  },

  settings: {
    get: () => state.settings || {},
    put: (input = {}) => {
      state.settings = { ...input }
      persist()
      return state.settings
    },
  },
}
