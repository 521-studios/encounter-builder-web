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
    release: (cid, id, opts = {}) => {
      // force=true releases past the draft→done completeness gate (rvd4); the API
      // reads it off the query string, not the body.
      const { force, ...rest } = opts
      return request('POST', `${encBase(cid)}/${enc(id)}/release${force ? '?force=true' : ''}`, rest)
    },
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

// Clear cached records AND their flush metadata (timers/dirty/handlers), so a
// sign-out / mode switch can't leave a stale 'Save failed' or leak meta entries.
// cid omitted → clear everything; also used for test isolation.
export function resetStore(cid) {
  if (cid == null) {
    cache.clear()
    resetFlush()
    return
  }
  cache.delete(String(cid))
  const prefix = `${String(cid)}::`
  for (const [k, x] of meta) {
    if (k.startsWith(prefix)) {
      if (x.timer) clearTimeout(x.timer)
      meta.delete(k)
    }
  }
}

// ─── flush layer (rtd8b / rtd8b-2): optimistic write-behind, generic over entity ───
//
// An entity's edit() holds the working copy on the flush record (x.record) and
// debounces a backend write via a per-entity persist fn; the read cache is warmed
// by that persist at flush time (not by edit itself), so a concurrent list()
// replacing the cache can't clobber a dirty edit. This is the forward-compatible
// store-first seam: today a component mirrors its local state into edit() on each
// keystroke; later it drops local state and mutates the store directly, with the
// flush layer unchanged.
//
// Per-record flush state (saved|unsaved|saving|error) is observable via
// subscribeFlush + flushState(key), for the Saving… indicator today and the record
// itself under store-first later. handlers.{onSaved,onError} carry the app-callback
// logic (sidebar refresh / error banner) that stays in the component for now; the
// flush mechanics (debounce, mid-flight coalescing, retry-on-next-edit, flush-on-
// leave) live here and are shared by encounters, chapters, and settings.
// Save-indicator labels, shared by every persist-on-change surface.
export const SAVE_LABEL = { saving: 'Saving…', unsaved: 'Unsaved…', error: 'Save failed', saved: 'Saved' }

// Flush keys — all prefixed by `${cid}::` so resetStore(cid) prunes a campaign's
// whole flush set in one sweep, regardless of entity.
export const encKey = (cid, id) => `${String(cid)}::enc::${String(id)}`
export const chKey = (cid, id) => `${String(cid)}::ch::${String(id)}`
export const setKey = (cid) => `${String(cid)}::set`

const AUTOSAVE_MS = 800
const meta = new Map() // key -> { dirty, saving, state, timer, record, persist, onSaved, onError }
const flushListeners = new Set()
function metaOf(key) {
  let x = meta.get(key)
  if (!x) {
    x = { dirty: false, saving: false, state: 'saved', timer: null, record: null, persist: null, onSaved: null, onError: null }
    meta.set(key, x)
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
export function flushState(key) {
  return meta.get(key)?.state || 'saved'
}
// Test isolation: drop timers + flush metadata.
export function resetFlush() {
  for (const x of meta.values()) if (x.timer) clearTimeout(x.timer)
  meta.clear()
}

// The coalescing save loop, generic over the entity: read the freshest working
// copy (x.record, set synchronously by flushEdit — immune to a concurrent list()
// replacing a read cache) each pass so overlapping edits can't reorder; persist
// via the entity's x.persist; on failure keep dirty (retry on next edit) and
// surface via x.onError.
async function runFlush(key) {
  const x = metaOf(key)
  if (x.saving || !x.dirty) return
  x.saving = true
  setFlushState(x, 'saving')
  try {
    while (x.dirty) {
      x.dirty = false
      const rec = x.record
      if (rec == null) break // removed/cancelled mid-flush — nothing to persist
      const saved = await x.persist(rec)
      x.onSaved && x.onSaved(saved)
    }
    setFlushState(x, 'saved')
  } catch (e) {
    // Keep a trace: the 'error' state + banner are static (a stale label), so the
    // specific failure — 401 vs 422 vs network — is otherwise observable nowhere.
    console.error('flush failed:', e)
    x.dirty = true // retry on the next edit, not on a timer
    setFlushState(x, 'error')
    x.onError && x.onError(e)
  } finally {
    x.saving = false
    notifyFlush()
  }
}

// Generic optimistic edit: store the working copy + the entity's persist fn +
// handlers, mark dirty, debounce the write. flushNow forces it; flushCancel drops
// it. Entity wrappers (encounters/chapters/settings .edit) provide persist.
function flushEdit(key, record, { persist, onSaved, onError }) {
  const x = metaOf(key)
  x.record = record
  x.persist = persist
  x.onSaved = onSaved
  x.onError = onError
  x.dirty = true
  if (x.state !== 'saving') setFlushState(x, 'unsaved')
  if (x.timer) clearTimeout(x.timer)
  x.timer = setTimeout(() => runFlush(key), AUTOSAVE_MS)
}
function flushNow(key) {
  const x = metaOf(key)
  if (x.timer) {
    clearTimeout(x.timer)
    x.timer = null
  }
  return runFlush(key)
}
function flushCancel(key) {
  const x = metaOf(key)
  if (x.timer) {
    clearTimeout(x.timer)
    x.timer = null
  }
  x.dirty = false
  setFlushState(x, 'saved')
}

export const store = {
  encounters: {
    // Fresh from the backend; replaces the cached working set for this campaign.
    async list(cid, opts) {
      const arr = await backend().encounters.list(cid, opts)
      slice(cid).encounters = new Map((arr || []).map((e) => [String(e.id), e]))
      return arr
    },
    // Read-through: the unsaved working copy if this record is mid-edit, else the
    // cached record, else fetch and cache.
    async get(cid, id, opts) {
      const dx = meta.get(encKey(cid, id))
      if (dx?.dirty && dx.record) return dx.record // don't serve a stale record over unsaved edits
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

    // Optimistic edit: mirror the working copy into the store and debounce the
    // backend write. handlers.{onSaved,onError} are refreshed each call so the
    // flush uses the latest closures. rtd8b's write path — the editor calls this
    // on every change instead of PUTting on a timer itself. persist keeps the read
    // cache warm and writes the saved record through so a post-flush get() isn't
    // stale; the working copy lives on the flush record (immune to list() clobber).
    edit(cid, id, record, handlers = {}) {
      flushEdit(encKey(cid, id), record, {
        persist: async (rec) => {
          const saved = await backend().encounters.update(cid, id, buildInput(rec))
          slice(cid).encounters.set(String(id), saved)
          return saved
        },
        onSaved: handlers.onSaved,
        onError: handlers.onError,
      })
    },
    // Flush a pending edit now (leaving the editor); safe when nothing is pending.
    flush: (cid, id) => flushNow(encKey(cid, id)),
    // Drop a pending debounced flush without persisting — for callers that take
    // over the write (release) or make it moot (delete).
    cancel: (cid, id) => flushCancel(encKey(cid, id)),
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
    // Optimistic edit for the chapter detail (full-replace PUT of the built input).
    edit: (cid, id, input, handlers = {}) =>
      flushEdit(chKey(cid, id), input, {
        persist: (rec) => backend().chapters.update(cid, id, rec),
        onSaved: handlers.onSaved,
        onError: handlers.onError,
      }),
    flush: (cid, id) => flushNow(chKey(cid, id)),
    cancel: (cid, id) => flushCancel(chKey(cid, id)),
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
    // Optimistic edit for the campaign-settings detail (one record per campaign,
    // no id). persist writes through the settings cache.
    edit: (cid, input, handlers = {}) =>
      flushEdit(setKey(cid), input, {
        persist: async (rec) => {
          const v = await backend().settings.put(cid, rec)
          slice(cid).settings = v
          return v
        },
        onSaved: handlers.onSaved,
        onError: handlers.onError,
      }),
    flush: (cid) => flushNow(setKey(cid)),
    cancel: (cid) => flushCancel(setKey(cid)),
  },
}
