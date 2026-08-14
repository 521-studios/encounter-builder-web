import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@521studios/pfsrd2-display'
import { errorMessage } from '../api/errors.js'
import { encounters } from '../api/encounters.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { settings as settingsApi } from '../api/settings.js'
import { CURRENCIES, buildInput, emptyMonster, emptyTreasure, keyed } from '../model.js'
import { resolveParty } from '../party.js'
import { BAND_LABELS } from '../pf2eRules.js'
import { useEncounterBudget } from '../useEncounterBudget.js'
import MonsterLine from './MonsterLine.jsx'
import TreasureLine from './TreasureLine.jsx'
import PartyFields from './PartyFields.jsx'
import TreasureBudget from './TreasureBudget.jsx'

const AUTOSAVE_MS = 800

export default function EncounterEditor({ campaignId, encounterId, onClose, onSaved, onDeleted, onSaveError }) {
  const [enc, setEnc] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('saved') // saved | unsaved | saving | error
  const [releasing, setReleasing] = useState(false)
  const [chapters, setChapters] = useState([]) // for the Chapter picker (keyboard-accessible move)
  const [campaignSettings, setCampaignSettings] = useState(null) // party inheritance base (null = loading)
  const [partyContextError, setPartyContextError] = useState(false) // chapters/settings load failed

  // Refs let the debounced autosave read the latest edit without re-subscribing:
  // encRef is the current working copy; dirtyRef marks unsaved user edits;
  // savingRef serializes overlapping PUTs; syncedRef is the last sidebar-visible
  // signature we told the parent about (so we only refresh the tree on real
  // name/chapter/status changes, not on every keystroke).
  const encRef = useRef(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
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
    dirtyRef.current = false
    setSaveState('saved')
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

  // Autosave: debounce a PUT whenever there are unsaved user edits. Re-runs on
  // every edit (enc changes) — the pending timer is cleared, so only the last
  // edit in a burst fires. The while-loop coalesces edits that arrive mid-save,
  // reading encRef fresh each pass so overlapping PUTs can't reorder.
  useEffect(() => {
    if (!enc || released || !dirtyRef.current) return
    const t = setTimeout(async () => {
      if (savingRef.current || !dirtyRef.current) return
      savingRef.current = true
      setSaveState('saving')
      try {
        while (dirtyRef.current) {
          dirtyRef.current = false
          const saved = await encounters.update(campaignId, encounterId, buildInput(encRef.current))
          setError(null)
          const sig = { name: saved.name, chapter_id: saved.chapter_id || '', status: saved.status }
          const prev = syncedRef.current
          if (prev.name !== sig.name || prev.chapter_id !== sig.chapter_id || prev.status !== sig.status) {
            syncedRef.current = sig
            onSaved && onSaved(saved)
          }
        }
        setSaveState('saved')
      } catch (e) {
        setError(errorMessage(e))
        setSaveState('error')
        dirtyRef.current = true // ponytail: retry on the next edit, not on a timer
      } finally {
        savingRef.current = false
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [enc, released, campaignId, encounterId, onSaved])

  // Flush a pending (debounced) autosave when leaving this encounter, so the last
  // <800ms of edits aren't lost on a quick switch or close. Fire-and-forget: the
  // editor is going away. Skip if a save is already in flight — its coalescing
  // loop picks up the dirty edit — to avoid a second concurrent PUT.
  useEffect(() => {
    return () => {
      const leaving = encRef.current
      if (dirtyRef.current && !savingRef.current && leaving && leaving.status !== 'released') {
        dirtyRef.current = false
        // The editor is unmounting, so its "Save failed" indicator is gone — a
        // failed flush must surface at the app level or the edit is lost silently.
        encounters
          .update(campaignId, encounterId, buildInput(leaving))
          .catch(() => onSaveError && onSaveError(`encounter “${leaving.name || 'Untitled encounter'}”`))
      }
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

  const patch = (fields) => {
    dirtyRef.current = true
    setSaveState((s) => (s === 'saving' ? s : 'unsaved'))
    setEnc({ ...enc, ...fields })
  }
  const monsters = enc.monsters || []
  const treasure = enc.treasure || []

  const setMonster = (i, m) => patch({ monsters: monsters.map((x, j) => (j === i ? m : x)) })
  const setTreasure = (i, t) => patch({ treasure: treasure.map((x, j) => (j === i ? t : x)) })

  // Release hands the loot to the party: it saves current edits first (so the
  // released encounter matches what the GM sees), then flips it to released —
  // after which the editor renders read-only.
  async function release() {
    if (!window.confirm('Release this encounter to the party? It becomes read-only.')) return
    dirtyRef.current = false // cancel any pending autosave; we save explicitly here
    setReleasing(true)
    setError(null)
    try {
      await encounters.update(campaignId, encounterId, buildInput(enc))
      const result = await encounters.release(campaignId, encounterId)
      setEnc(keyed(result))
      setSaveState('saved')
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
    dirtyRef.current = false // cancel any pending autosave; the encounter is going away
    try {
      await encounters.remove(campaignId, encounterId)
      onDeleted && onDeleted()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <section className="editor">
      <div className="editor-head">
        <input
          className="title-input"
          aria-label="encounter name"
          value={enc.name}
          disabled={released}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <span
          className={`difficulty-badge difficulty-badge--${budget.threat}`}
          data-testid="difficulty-badge"
          title={`${BAND_LABELS[budget.threat]} encounter for a level-${effectiveParty.level} party (from monster XP)`}
        >
          {BAND_LABELS[budget.threat]} {effectiveParty.level}
        </span>
        <span className="status">{enc.status}</span>
        <button type="button" className="link danger" aria-label={`Delete ${enc.name || 'Untitled encounter'}`} onClick={del}>Delete</button>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>

      {released && <p className="muted">Released — read-only.</p>}
      {error && <p className="error" role="alert">{error}</p>}

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
        <span>Description</span>
        <textarea
          className="description-input"
          value={enc.description || ''}
          disabled={released}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Scene-setting, read-aloud text, GM notes… (markdown)"
        />
      </label>
      {enc.description && (
        <div className="description-preview" data-testid="description-preview">
          <Markdown block text={enc.description} />
        </div>
      )}

      <label className="field">
        <span>Notes</span>
        <textarea
          value={enc.notes || ''}
          disabled={released}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </label>

      <fieldset className="coins">
        <legend>Coin</legend>
        {CURRENCIES.map((c) => (
          <label key={c} className="coin">
            {c}
            <input
              type="number"
              min="0"
              value={enc.currency?.[c] || 0}
              disabled={released}
              onChange={(e) => patch({ currency: { ...enc.currency, [c]: Number(e.target.value) } })}
            />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Monsters</legend>
        {monsters.map((m, i) => (
          <MonsterLine
            key={m._key}
            monster={m}
            entryOf={budget.entryOf}
            disabled={released}
            onChange={(m2) => setMonster(i, m2)}
            onRemove={() => patch({ monsters: monsters.filter((_, j) => j !== i) })}
          />
        ))}
        {!released && (
          <button type="button" onClick={() => patch({ monsters: [...monsters, emptyMonster()] })}>
            + monster
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>Treasure</legend>
        {treasure.map((t, i) => (
          <TreasureLine
            key={t._key}
            treasure={t}
            disabled={released}
            onChange={(t2) => setTreasure(i, t2)}
            onRemove={() => patch({ treasure: treasure.filter((_, j) => j !== i) })}
          />
        ))}
        {!released && (
          <button type="button" onClick={() => patch({ treasure: [...treasure, emptyTreasure()] })}>
            + treasure
          </button>
        )}
      </fieldset>

      <TreasureBudget
        budget={budget}
        partyLevel={effectiveParty.level}
        partySize={effectiveParty.size}
      />

      {!released && (
        <div className="actions">
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
    </section>
  )
}
