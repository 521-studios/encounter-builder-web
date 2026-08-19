import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { errorMessage } from '../api/errors.js'
import { encounters } from '../api/encounters.js'
import { flushState, subscribeFlush, encKey } from '../store/store.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { settings as settingsApi } from '../api/settings.js'
import {
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  isCombatRoom,
  roomTypeLabel,
  buildInput,
  reorderById,
  emptyExit,
  incomingLinks,
  keyed,
} from '../model.js'
import { resolveParty } from '../party.js'
import { naturalSort } from '../sort.js'
import { BAND_LABELS, BASE_PARTY, treasureBudget } from '../pf2eRules.js'
import { useEncounterBudget } from '../useEncounterBudget.js'
import EncounterContent from './EncounterContent.jsx'
import PartyFields from './PartyFields.jsx'
import TreasureBudget from './TreasureBudget.jsx'
import EncounterPrintSheet from './EncounterPrintSheet.jsx'
import RemoveButton from './RemoveButton.jsx'

const ENCOUNTER_TABS = [
  { id: 'config', label: 'Config' },
  { id: 'encounter', label: 'Encounter' },
  { id: 'exits', label: 'Exits' },
]

export default function EncounterEditor({ campaignId, encounterId, onClose, onSaved, onDeleted, onSaveError, onSaveOk, onOpenEncounter }) {
  const [tab, setTab] = useState('config')
  const [enc, setEnc] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [releasing, setReleasing] = useState(false)
  const [printing, setPrinting] = useState(false) // full-screen print/PDF sheet overlay
  // The save indicator now reflects the store's flush layer (rtd8b): edits are
  // written to the store optimistically and it owns the debounced backend write.
  const saveState = useSyncExternalStore(subscribeFlush, () => flushState(encKey(campaignId, encounterId)))
  const [chapters, setChapters] = useState([]) // for the Chapter picker (keyboard-accessible move)
  const [siblingEncounters, setSiblingEncounters] = useState([]) // campaign encounters, for the exit target picker
  const [siblingsLoaded, setSiblingsLoaded] = useState(false) // the picker list finished loading (so an unresolved exit is genuinely deleted, not just still-loading)
  const [campaignSettings, setCampaignSettings] = useState(null) // party inheritance base (null = loading)
  const [partyContextError, setPartyContextError] = useState(false) // chapters/settings load failed
  const [showBudget, setShowBudget] = useState(false) // the treasure chip toggles the full budget table

  // encRef exposes the latest working copy to the flush handlers (for the error
  // label); syncedRef is the last sidebar-visible signature we told the parent
  // about, so we only refresh the tree on real name/chapter/status changes, not
  // on every keystroke. Dirty/saving/debounce now live in the store's flush layer.
  const encRef = useRef(null)
  const syncedRef = useRef({ name: null, chapter_id: null, status: null })
  encRef.current = enc

  useEffect(() => {
    let alive = true
    chaptersApi
      .list(campaignId)
      .then((cs) => alive && setChapters(cs))
      // Picker falls back to Unsorted-only; also flag it so the party-inheritance
      // hint (which reads the encounter's chapter override) isn't a silent lie.
      .catch(() => alive && setPartyContextError(true))
    encounters
      .list(campaignId)
      .then((es) => {
        if (!alive) return
        setSiblingEncounters(es)
        setSiblingsLoaded(true) // only now can an unresolved exit be called "deleted"
      })
      .catch(() => {}) // load failed → stays not-loaded, so we never falsely cry "deleted"
    settingsApi
      .get(campaignId)
      .then((s) => alive && setCampaignSettings(s))
      .catch(() => {
        if (!alive) return
        setCampaignSettings({}) // inheritance falls back to app default…
        setPartyContextError(true) // …but flag it so the shown value isn't a silent lie
      })
    return () => {
      alive = false
    }
  }, [campaignId])

  useEffect(() => {
    let alive = true
    setEnc(null)
    setError(null)
    encounters
      .get(campaignId, encounterId)
      .then((e) => {
        if (!alive) return
        setEnc(keyed(e))
        syncedRef.current = { name: e.name, chapter_id: e.chapter_id || '', status: e.status }
      })
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [campaignId, encounterId])

  const released = enc?.status === 'released'

  // Flush any pending (debounced) edit when leaving this encounter, so the last
  // <800ms aren't lost on a quick switch or close. The store's flush layer owns
  // the coalescing/retry; a failed flush surfaces via the edit handlers'
  // onError (the app-level banner), since the inline indicator is gone.
  useEffect(() => {
    return () => {
      encounters.flush(campaignId, encounterId)
    }
  }, [campaignId, encounterId])

  // Effective party (own override → chapter → campaign → app default) and the
  // shared treasure/difficulty budget. Computed before the early returns to
  // satisfy the rules of hooks; both tolerate a still-loading (null) encounter.
  const effectiveParty = resolveParty({
    encounter: enc,
    chapter: enc ? chapters.find((c) => c.id === enc.chapter_id) || null : null,
    campaign: campaignSettings || null,
  })
  const budget = useEncounterBudget(enc || {}, effectiveParty.level, effectiveParty.size)

  if (error && !enc) return <p className="error" role="alert">{error}</p>
  if (!enc) return <p>Loading encounter…</p>

  // On a successful flush the store hands back the saved record: refresh the
  // sidebar only on a real name/chapter/status change (not every keystroke), and
  // clear any lingering app-level banner for THIS encounter (id-keyed). A failed
  // flush shows the inline "Save failed" and surfaces the app banner, since the
  // editor may unmount mid-retry. These mirror the old autosave callbacks; only
  // the write mechanics moved into the store.
  const onFlushSaved = (saved) => {
    setError(null)
    const sig = { name: saved.name, chapter_id: saved.chapter_id || '', status: saved.status }
    const prev = syncedRef.current
    if (prev.name !== sig.name || prev.chapter_id !== sig.chapter_id || prev.status !== sig.status) {
      syncedRef.current = sig
      onSaved && onSaved(saved)
    }
    onSaveOk && onSaveOk(encounterId)
  }
  const onFlushError = (e) => {
    setError(errorMessage(e))
    onSaveError && onSaveError(`encounter “${encRef.current?.name || 'Untitled encounter'}”`, encounterId)
  }

  // Optimistic edit: update local state (instant render) and mirror the working
  // copy into the store, which debounces the backend write. rtd8b's forward-
  // compatible seam — when the editor goes store-first, `patch` becomes edit()
  // over the store's record with no local enc.
  const patch = (fields) => {
    const next = { ...enc, ...fields }
    setEnc(next)
    encounters.edit(campaignId, encounterId, next, { onSaved: onFlushSaved, onError: onFlushError })
  }
  const content = enc.content || []
  // A room with no monster/hazard/affliction item has no combat difficulty to show —
  // suppress the "Trivial 1" band and fall back to the room-type label.
  const hasChallenges = content.some((c) => c.type === 'monster' || c.type === 'hazard' || c.type === 'affliction')

  // The single ordered "Encounter" content list (every item type). Adding takes a
  // ready-built item so EncounterContent owns its id; all edits persist via patch.
  const setContentItem = (id, fields) => patch({ content: content.map((c) => (c.id === id ? { ...c, ...fields } : c)) })
  const addContentItem = (item) => patch({ content: [...content, item] })
  const removeContentItem = (id) => patch({ content: content.filter((c) => c.id !== id) })
  const reorderContent = (fromId, toId) => patch({ content: reorderById(content, fromId, toId) })

  // Exits: the room's connectivity edges. Each targets another encounter (a soft
  // reference) or an external destination named by label. Empty rows drop on save.
  const exits = enc.exits || []
  // Sibling encounters for the exit-destination picker — natural-sorted (A1, A2,
  // A3, A10, A25 — not lexical/creation order), matching the sidebar + rollup.
  const exitTargets = naturalSort(
    siblingEncounters.filter((e) => String(e.id) !== String(encounterId)), // not self
    (e) => e.name || '',
  )
  const setExit = (i, fields) =>
    patch({ exits: exits.map((e, j) => (j === i ? { ...e, ...fields } : e)) })
  const addExit = () => patch({ exits: [...exits, emptyExit()] })
  const removeExit = (i) => patch({ exits: exits.filter((_, j) => j !== i) })
  // Rooms whose exits point AT this encounter; "connect" adds the reciprocal exit here
  // (making the passage two-way).
  const incoming = incomingLinks(encounterId, siblingEncounters, exits)
  const connectIncoming = (sourceId) => patch({ exits: [...exits, { ...emptyExit(), to_encounter_id: sourceId }] })

  // Release hands the loot to the party: it saves current edits first (so the
  // released encounter matches what the GM sees), then flips it to released —
  // after which the editor renders read-only.
  async function release() {
    if (!window.confirm('Release this encounter to the party? It becomes read-only.')) return
    encounters.cancel(campaignId, encounterId) // drop the pending debounced flush; we save explicitly here
    setReleasing(true)
    setError(null)
    try {
      await encounters.update(campaignId, encounterId, buildInput(enc))
      const result = await encounters.release(campaignId, encounterId)
      setEnc(keyed(result))
      onSaved && onSaved(result)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setReleasing(false)
    }
  }

  const saveLabel = { saving: 'Saving…', unsaved: 'Unsaved changes…', error: 'Save failed', saved: 'Saved' }[saveState]

  async function del() {
    if (!window.confirm(`Delete encounter "${enc.name || 'Untitled encounter'}"? This can't be undone.`)) return
    encounters.cancel(campaignId, encounterId) // drop the pending flush; the encounter is going away
    try {
      await encounters.remove(campaignId, encounterId)
      onDeleted && onDeleted()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <section className="editor">
      {/* Title + tabs pin together as one sticky header; only the active panel scrolls. */}
      <div className="editor-header">
        <div className="editor-head">
          <input
            className="title-input"
            aria-label="encounter name"
            value={enc.name}
            disabled={released}
            onChange={(e) => patch({ name: e.target.value })}
          />
          {isCombatRoom(budget.roomType) && hasChallenges ? (
            <span
              className={`difficulty-badge difficulty-badge--${budget.threat}`}
              data-testid="difficulty-badge"
              title={
                `${BAND_LABELS[budget.threat]} encounter for a level-${effectiveParty.level} party (from monster XP)` +
                (effectiveParty.size !== BASE_PARTY
                  ? ` · ${BAND_LABELS[budget.canonicalThreat]} at ${BASE_PARTY} PCs (book standard)`
                  : '')
              }
            >
              {BAND_LABELS[budget.threat]} {effectiveParty.level}
            </span>
          ) : (
            <span
              className="difficulty-badge difficulty-badge--noncombat"
              data-testid="difficulty-badge"
              title={`${roomTypeLabel(budget.roomType)} room — no combat difficulty`}
            >
              {roomTypeLabel(budget.roomType)}
            </span>
          )}
          <button
            type="button"
            className="budget-chip"
            data-testid="treasure-chip"
            aria-expanded={showBudget}
            title="Treasure budget for this difficulty — click for the full table"
            onClick={() => setShowBudget((s) => !s)}
          >
            Treasure:{' '}
            {(() => {
              if (!isCombatRoom(budget.roomType)) return '—'
              const t = treasureBudget(effectiveParty.level, budget.threat, effectiveParty.size)
              return t == null ? '—' : `${t} gp`
            })()}
          </button>
          <span className="status">{enc.status}</span>
          <button type="button" className="link" onClick={() => setPrinting(true)}>Print / PDF</button>
          <button type="button" className="link danger" aria-label={`Delete ${enc.name || 'Untitled encounter'}`} onClick={del}>Delete</button>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </div>

        {released && <p className="muted">Released — read-only.</p>}
        {error && <p className="error" role="alert">{error}</p>}

        <div className="editor-tabrow">
          <div className="tabs" role="tablist" aria-label="Encounter sections">
            {ENCOUNTER_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`enctab-${t.id}`}
                aria-controls={`encpanel-${t.id}`}
                aria-selected={tab === t.id}
                className={`tab${tab === t.id ? ' tab--active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {!released && (
            <div className="editor-release">
              <span
                className={`save-state${saveState === 'error' ? ' save-state--error' : ''}`}
                data-testid="save-state"
                aria-live="polite"
              >
                {saveLabel}
              </span>
              <button onClick={release} disabled={releasing || saveState === 'saving'}>
                {releasing ? 'Releasing…' : 'Release to party'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tab-panel">
        {tab === 'config' && (
          <div role="tabpanel" id="encpanel-config" aria-labelledby="enctab-config">
            <label className="field">
              <span>Chapter</span>
              <select
                aria-label="chapter"
                value={chapters.some((c) => c.id === enc.chapter_id) ? enc.chapter_id : ''}
                disabled={released}
                onChange={(e) => patch({ chapter_id: e.target.value })}
              >
                <option value="">Unsorted</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Room type</span>
              <select
                aria-label="room type"
                value={enc.room_type || 'combat'}
                disabled={released}
                onChange={(e) => patch({ room_type: e.target.value })}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>{ROOM_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>

            <PartyFields
              value={{ party_level: enc.party_level ?? null, party_size: enc.party_size ?? null }}
              inherited={resolveParty({
                // Layers below the encounter: its chapter, then campaign settings.
                chapter: chapters.find((c) => c.id === enc.chapter_id) || null,
                campaign: campaignSettings || null,
              })}
              inheritedError={partyContextError}
              disabled={released}
              onChange={(next) => patch({ party_level: next.party_level, party_size: next.party_size })}
            />
            <label className="field">
              <span>Notes</span>
              <textarea value={enc.notes || ''} disabled={released} onChange={(e) => patch({ notes: e.target.value })} />
            </label>
          </div>
        )}

        {tab === 'encounter' && (
          <div role="tabpanel" id="encpanel-encounter" aria-labelledby="enctab-encounter">
            {showBudget && (
              <TreasureBudget budget={budget} partyLevel={effectiveParty.level} partySize={effectiveParty.size} />
            )}
            <EncounterContent
              content={content}
              entryOf={budget.entryOf}
              released={released}
              siblings={siblingEncounters}
              onOpenEncounter={onOpenEncounter}
              onSetItem={setContentItem}
              onAdd={addContentItem}
              onRemove={removeContentItem}
              onReorder={reorderContent}
            />
          </div>
        )}


        {tab === 'exits' && (
          <div role="tabpanel" id="encpanel-exits" aria-labelledby="enctab-exits">
            <fieldset>
              <legend>Exits</legend>
              <p className="muted">
                Where this room connects — the dungeon map graph. Link to another encounter,
                or name an external exit (Exterior, stairs up).
              </p>
              {exits.map((ex, i) => (
                <div className="exit" data-testid="exit" key={ex._key}>
                  <select
                    className="exit-target"
                    aria-label="exit target"
                    value={ex.to_encounter_id || ''}
                    disabled={released}
                    onChange={(e) => setExit(i, { to_encounter_id: e.target.value })}
                  >
                    <option value="">— External —</option>
                    {exitTargets.map((t) => (
                      <option key={t.id} value={t.id}>{t.name || 'Untitled'}</option>
                    ))}
                    {/* An id not in the picker is either a since-deleted encounter (shown
                        honestly as broken so the GM can re-point it) OR the picker just hasn't
                        loaded yet — in which case show a neutral placeholder, never a false
                        "(deleted encounter)" that makes a valid saved link look lost. */}
                    {ex.to_encounter_id && !exitTargets.some((t) => String(t.id) === String(ex.to_encounter_id)) && (
                      <option value={ex.to_encounter_id}>{siblingsLoaded ? '(deleted encounter)' : 'Linked encounter…'}</option>
                    )}
                  </select>
                  <input
                    className="exit-label"
                    aria-label="exit label"
                    placeholder={ex.to_encounter_id ? 'Passage (optional)' : 'Destination (e.g. Exterior)'}
                    value={ex.label || ''}
                    disabled={released}
                    onChange={(e) => setExit(i, { label: e.target.value })}
                  />
                  <label className="exit-secret">
                    <input
                      type="checkbox"
                      aria-label="secret door"
                      checked={!!ex.secret}
                      disabled={released}
                      onChange={(e) => setExit(i, { secret: e.target.checked })}
                    />{' '}
                    Secret
                  </label>
                  <input
                    className="exit-skill"
                    aria-label="exit skill check"
                    placeholder="Skill (optional)"
                    value={ex.skill || ''}
                    disabled={released}
                    onChange={(e) => setExit(i, { skill: e.target.value })}
                  />
                  <input
                    className="exit-dc"
                    type="number"
                    min="0"
                    aria-label="exit DC"
                    placeholder="DC"
                    value={ex.dc || ''}
                    disabled={released}
                    onChange={(e) => setExit(i, { dc: Number(e.target.value) })}
                  />
                  {!released && (
                    <RemoveButton label="exit" onRemove={() => removeExit(i)} />
                  )}
                </div>
              ))}
              {!released && (
                <button type="button" className="add-exit" onClick={addExit}>
                  + exit
                </button>
              )}

              {incoming.length > 0 && (
                <div className="exits-incoming" data-testid="exits-incoming">
                  <span className="field-label">Incoming</span>
                  {incoming.map((inc) => (
                    <div className="exit-incoming" key={inc.id}>
                      <span className="grow">
                        {inc.name} → here{inc.label ? ` (${inc.label})` : ''}
                      </span>
                      {inc.connected ? (
                        <span className="muted">two-way ✓</span>
                      ) : (
                        !released && (
                          <button type="button" className="link" onClick={() => connectIncoming(inc.id)}>
                            connect
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        )}
      </div>

      {printing && (
        <EncounterPrintSheet
          enc={enc}
          budget={budget}
          effectiveParty={effectiveParty}
          siblings={siblingEncounters}
          onClose={() => setPrinting(false)}
        />
      )}
    </section>
  )
}
