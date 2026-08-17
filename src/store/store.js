// store — the app's single source of truth for encounters/chapters/settings,
// with a swappable backend. This is the unification the app is converging on
// (rtd8): both the authed app and the no-sign-in builder run on ONE store; only
// the backend differs.
//
//   local backend  → localStore (localStorage), used when isAnon()
//   api backend    → encounter-builder-api via request() (bearer), otherwise
//
// rtd8a (this pass) makes the store the READ source: get() is read-through
// (served from the in-memory cache, else fetched and cached), list() refreshes
// the cache, and mutations write through to both the backend and the cache.
// Writes are still synchronous-through here — the editor's own debounced autosave
// still drives them; rtd8b moves that debounce into a flush layer so writes go
// optimistic/async. The public api/{encounters,chapters,settings}.js modules are
// thin re-exports of this store, so components are unchanged.
import { request } from '../api/client.js'
import { isAnon } from '../api/anon.js'
import { localStore } from './localStore.js'
import { buildInput } from '../model.js'

const enc = encodeURIComponent
const encBase = (cid) => `/api/app/campaigns/${enc(cid)}/encounters`
const chBase = (cid) => `/api/app/campaigns/${enc(cid)}/chapters`
const setBase = (cid) => `/api/app/campaigns/${enc(cid)}/settings`

// The API backend: the request()-based CRUD (the authed path, verbatim). Async.
const apiBackend = {
  encounters: {
    list: (cid, opts = {}) => request('GET', encBase(cid), opts),
    get: (cid, id, opts = {}) => request('GET', `${encBase(cid)}/${enc(id)}`, opts),
    create: (cid, input, opts = {}) => request('POST', encBase(cid), { body: input, ...opts }),
    update: (cid, id, input, opts = {}) => request('PUT', `${encBase(cid)}/${enc(id)}`, { body: input, ...opts }),
    remove: (cid, id, opts = {}) => request('DELETE', `${encBase(cid)}/${enc(id)}`, opts),
    release: (cid, id, opts = {}) => request('POST', `${encBase(cid)}/${enc(id)}/release`, opts),
  },
  chapters: {
    list: (cid, opts = {}) => request('GET', chBase(cid), opts),
    create: (cid, input, opts = {}) => request('POST', chBase(cid), { body: input, ...opts }),
    update: (cid, id, input, opts = {}) => request('PUT', `${chBase(cid)}/${enc(id)}`, { body: input, ...opts }),
    remove: (cid, id, opts = {}) => request('DELETE', `${chBase(cid)}/${enc(id)}`, opts),
  },
  settings: {
    get: (cid, opts = {}) => request('GET', setBase(cid), opts),
    put: (cid, input, opts = {}) => request('PUT', setBase(cid), { body: input, ...opts }),
  },
}

// The local backend: localStore, adapted to the (campaignId, …) signature the
// store calls with (the single synthetic campaign makes campaignId a no-op).
// Synchronous — the store awaits both backends uniformly (await of a value is fine).
const localBackend = {
  encounters: {
    list: () => localStore.encounters.list(),
    get: (_cid, id) => localStore.encounters.get(id),
    create: (_cid, input) => localStore.encounters.create(input),
    update: (_cid, id, input) => localStore.encounters.update(id, input),
    remove: (_cid, id) => localStore.encounters.remove(id),
    release: (_cid, id) => localStore.encounters.release(id),
  },
  chapters: {
    list: () => localStore.chapters.list(),
    create: (_cid, input) => localStore.chapters.create(input),
    update: (_cid, id, input) => localStore.chapters.update(id, input),
    remove: (_cid, id) => localStore.chapters.remove(id),
  },
  settings: {
    get: () => localStore.settings.get(),
    put: (_cid, input) => localStore.settings.put(input),
  },
}

const backend = () => (isAnon() ? localBackend : apiBackend)

// Per-campaign cache: the working set the store serves reads from. encounters are
// keyed by id (string); settings is a single value (undefined = not yet loaded).
const cache = new Map() // campaignId -> { encounters: Map<id, rec>, settings: value|undefined }
function slice(cid) {
  const key = String(cid)
  let s = cache.get(key)
  if (!s) {
    s = { encounters: new Map(), settings: undefined }
    cache.set(key, s)
  }
  return s
}

// Clear cached records. cid omitted → clear everything (sign-out / mode switch);
// also used for test isolation.
export function resetStore(cid) {
  if (cid == null) cache.clear()
  else cache.delete(String(cid))
}

// ─── flush layer (rtd8b): optimistic write-behind over the working set ───
//
// edit(cid, id, record, handlers) writes the (rich, keyed) record into the cache
// — the WORKING COPY — marks it dirty, and debounces a backend write. This is the
// forward-compatible store-first seam: today the editor mirrors its local `enc`
// into edit() on each keystroke; later the editor drops local state and `patch`
// IS edit(), with the flush layer unchanged. buildInput() is applied at flush
// time, so the store holds exactly the record the editor will one day render from.
//
// Per-record flush state (saved|unsaved|saving|error) is observable via
// subscribeFlush + flushState, for the editor's Saving… indicator today and the
// record itself under store-first later. handlers.{onSaved,onError} carry the
// app-callback logic (sidebar refresh / error banner) that stays in the editor
// for now; the flush mechanics (debounce, mid-flight coalescing, retry-on-next-
// edit, flush-on-leave) live here.
const AUTOSAVE_MS = 800
const meta = new Map() // `${cid}::${id}` -> { dirty, saving, state, timer, handlers }
const flushListeners = new Set()
const mkey = (cid, id) => `${String(cid)}::${String(id)}`
function metaOf(cid, id) {
  const k = mkey(cid, id)
  let x = meta.get(k)
  if (!x) {
    x = { dirty: false, saving: false, state: 'saved', timer: null, handlers: {} }
    meta.set(k, x)
  }
  return x
}
function notifyFlush() {
  for (const l of flushListeners) l()
}
function setFlushState(x, state) {
  if (x.state !== state) {
    x.state = state
    notifyFlush()
  }
}

export function subscribeFlush(listener) {
  flushListeners.add(listener)
  return () => flushListeners.delete(listener)
}
export function flushState(cid, id) {
  return meta.get(mkey(cid, id))?.state || 'saved'
}
// Test isolation: drop timers + flush metadata.
export function resetFlush() {
  for (const x of meta.values()) if (x.timer) clearTimeout(x.timer)
  meta.clear()
}

// The coalescing save loop, lifted verbatim in spirit from EncounterEditor: read
// the freshest working copy each pass so overlapping edits can't reorder; on
// failure keep dirty (retry on the next edit) and surface via handlers.onError.
async function runFlush(cid, id) {
  const x = metaOf(cid, id)
  if (x.saving || !x.dirty) return
  x.saving = true
  setFlushState(x, 'saving')
  try {
    while (x.dirty) {
      x.dirty = false
      const rec = slice(cid).encounters.get(String(id))
      if (!rec) break // removed mid-flush — nothing to persist
      const saved = await backend().encounters.update(cid, id, buildInput(rec))
      x.handlers.onSaved && x.handlers.onSaved(saved)
    }
    setFlushState(x, 'saved')
  } catch (e) {
    x.dirty = true // retry on the next edit, not on a timer
    setFlushState(x, 'error')
    x.handlers.onError && x.handlers.onError(e)
  } finally {
    x.saving = false
    notifyFlush()
  }
}

export const store = {
  encounters: {
    // Fresh from the backend; replaces the cached working set for this campaign.
    async list(cid, opts) {
      const arr = await backend().encounters.list(cid, opts)
      slice(cid).encounters = new Map((arr || []).map((e) => [String(e.id), e]))
      return arr
    },
    // Read-through: cached record, else fetch and cache.
    async get(cid, id, opts) {
      const s = slice(cid)
      const k = String(id)
      if (s.encounters.has(k)) return s.encounters.get(k)
      const rec = await backend().encounters.get(cid, id, opts)
      s.encounters.set(k, rec)
      return rec
    },
    // Write-through: persist, then reflect the returned record in the cache.
    async create(cid, input, opts) {
      const rec = await backend().encounters.create(cid, input, opts)
      slice(cid).encounters.set(String(rec.id), rec)
      return rec
    },
    async update(cid, id, input, opts) {
      const rec = await backend().encounters.update(cid, id, input, opts)
      slice(cid).encounters.set(String(id), rec)
      return rec
    },
    async remove(cid, id, opts) {
      const r = await backend().encounters.remove(cid, id, opts)
      slice(cid).encounters.delete(String(id))
      return r
    },
    async release(cid, id, opts) {
      const rec = await backend().encounters.release(cid, id, opts)
      slice(cid).encounters.set(String(id), rec)
      return rec
    },

    // Optimistic edit: update the working copy now (instant UI), debounce the
    // backend write. handlers.{onSaved,onError} are refreshed each call so the
    // flush always uses the latest closures. rtd8b's write path — the editor
    // calls this on every change instead of PUTting on a timer itself.
    edit(cid, id, record, handlers = {}) {
      slice(cid).encounters.set(String(id), record)
      const x = metaOf(cid, id)
      x.handlers = handlers
      x.dirty = true
      if (x.state !== 'saving') setFlushState(x, 'unsaved')
      if (x.timer) clearTimeout(x.timer)
      x.timer = setTimeout(() => runFlush(cid, id), AUTOSAVE_MS)
    },

    // Flush any pending edit now (leaving the editor). Returns the flush promise
    // so a caller can await it; safe to call when nothing is pending.
    flush(cid, id) {
      const x = metaOf(cid, id)
      if (x.timer) {
        clearTimeout(x.timer)
        x.timer = null
      }
      return runFlush(cid, id)
    },

    // Drop a pending debounced flush without persisting — for callers that take
    // over the write explicitly (release, which saves-then-releases) or make it
    // moot (delete). Clears the timer + dirty so the flush-on-leave can't re-fire.
    cancel(cid, id) {
      const x = metaOf(cid, id)
      if (x.timer) {
        clearTimeout(x.timer)
        x.timer = null
      }
      x.dirty = false
      setFlushState(x, 'saved')
    },
  },
  // Chapters have no per-record read (only list), so they pass through — list is
  // always fresh, mutations are awaited. (The sidebar re-lists after each.) These
  // are async so a caller always gets a thenable: the local backend returns sync
  // values, and callers do `chapters.list(cid).then(...)`.
  chapters: {
    list: async (cid, opts) => backend().chapters.list(cid, opts),
    create: async (cid, input, opts) => backend().chapters.create(cid, input, opts),
    update: async (cid, id, input, opts) => backend().chapters.update(cid, id, input, opts),
    remove: async (cid, id, opts) => backend().chapters.remove(cid, id, opts),
  },
  settings: {
    async get(cid, opts) {
      const s = slice(cid)
      if (s.settings !== undefined) return s.settings
      const v = await backend().settings.get(cid, opts)
      s.settings = v
      return v
    },
    async put(cid, input, opts) {
      const v = await backend().settings.put(cid, input, opts)
      slice(cid).settings = v
      return v
    },
  },
}
