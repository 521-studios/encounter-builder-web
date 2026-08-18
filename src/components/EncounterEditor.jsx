import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { errorMessage } from '../api/errors.js'
import { encounters } from '../api/encounters.js'
import { flushState, subscribeFlush, encKey } from '../store/store.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { settings as settingsApi } from '../api/settings.js'
import {
  CURRENCIES,
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  isCombatRoom,
  roomTypeLabel,
  REWARD_KINDS,
  REWARD_KIND_LABELS,
  buildInput,
  encounterBlocks,
  challengeBlocks,
  reindexEditingAfterRemove,
  emptyMonster,
  emptyHazard,
  emptyAffliction,
  emptyTreasure,
  emptyPool,
  emptyAward,
  emptyReward,
  emptySkillCheck,
  emptyExit,
  incomingLinks,
  keyed,
  skillCheckLabel,
  SKILL_CHECK_DEGREES,
  SKILL_CHECK_DEGREE_LABELS,
} from '../model.js'
import { resolveParty } from '../party.js'
import { naturalSort } from '../sort.js'
import { BAND_LABELS, BASE_PARTY } from '../pf2eRules.js'
import { useEncounterBudget } from '../useEncounterBudget.js'
import MonsterLine from './MonsterLine.jsx'
import HazardLine from './HazardLine.jsx'
import AfflictionLine from './AfflictionLine.jsx'
import WikiMarkdown from './WikiMarkdown.jsx'
import MarkdownSections from './MarkdownSections.jsx'
import TreasurePoolSection from './TreasurePoolSection.jsx'
import PartyFields from './PartyFields.jsx'
import TreasureBudget from './TreasureBudget.jsx'
import EncounterPrintSheet from './EncounterPrintSheet.jsx'

const ENCOUNTER_TABS = [
  { id: 'config', label: 'Config' },
  { id: 'description', label: 'Description' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'rewards', label: 'Rewards' },
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
  const [descEditing, setDescEditing] = useState(() => new Set()) // Description blocks in edit (vs preview) mode
  const [chalEditing, setChalEditing] = useState(() => new Set()) // Challenges blocks in edit mode

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
  const monsters = enc.monsters || []
  const hazards = enc.hazards || []
  const afflictions = enc.afflictions || []
  const treasure = enc.treasure || []
  // A room with no monsters/hazards/afflictions has no combat difficulty to show —
  // suppress the "Trivial 1" band and fall back to the room-type label.
  const hasChallenges = monsters.length > 0 || hazards.length > 0 || afflictions.length > 0

  // Titled markdown blocks. Two independent lists — text_blocks (Description) and
  // challenge_blocks (Challenges) — each with its own edit-set; a factory keeps their
  // add/remove/edit/done identical. A legacy single description surfaces as one untitled
  // text_block via encounterBlocks; the save clears it. (markdown-blocks)
  const blockHandlers = (field, list, setEditing) => ({
    set: (i, fields) => patch({ [field]: list.map((b, j) => (j === i ? { ...b, ...fields } : b)) }),
    edit: (i) => setEditing((s) => new Set(s).add(i)),
    done: (i) => setEditing((s) => { const n = new Set(s); n.delete(i); return n }),
    // A new block opens in edit mode (it's empty), appended so its index is list.length.
    add: () => { setEditing((s) => new Set(s).add(list.length)); patch({ [field]: [...list, { title: '', body: '' }] }) },
    // Removing block i shifts higher blocks down one — reindex the editing set to match.
    remove: (i) => { patch({ [field]: list.filter((_, j) => j !== i) }); setEditing((s) => reindexEditingAfterRemove(s, i)) },
  })
  const descBlocks = encounterBlocks(enc)
  const chalBlocks = challengeBlocks(enc)
  const descH = blockHandlers('text_blocks', descBlocks, setDescEditing)
  const chalH = blockHandlers('challenge_blocks', chalBlocks, setChalEditing)

  const setMonster = (i, m) => patch({ monsters: monsters.map((x, j) => (j === i ? m : x)) })
  const setHazard = (i, h) => patch({ hazards: hazards.map((x, j) => (j === i ? h : x)) })
  const setAffliction = (i, a) => patch({ afflictions: afflictions.map((x, j) => (j === i ? a : x)) })
  const setTreasure = (i, t) => patch({ treasure: treasure.map((x, j) => (j === i ? t : x)) })

  // Treasure pools: loot grouped by where it's found. Every encounter with treasure
  // keeps at least a default pool (materialized on the first add); lines carry a
  // pool_id. keyed() adopts orphaned lines into the default on load.
  const pools = enc.treasure_pools || []
  const setPool = (id, fields) =>
    patch({ treasure_pools: pools.map((p) => (p.id === id ? { ...p, ...fields } : p)) })
  const addPool = () => patch({ treasure_pools: [...pools, emptyPool()] })
  const removePool = (id) => {
    const remaining = pools.filter((p) => p.id !== id)
    const fallback = remaining[0]?.id // orphaned lines fall to the first remaining pool
    patch({
      treasure_pools: remaining,
      treasure: treasure.map((t) => (t.pool_id === id ? { ...t, pool_id: fallback } : t)),
    })
  }
  // "+ treasure" adds a line to the default pool, materializing one if none exists
  // yet — both writes in a single patch so the line's pool_id is stable (no
  // intermediate render sees an orphan).
  const addTreasure = () => {
    const def = pools[0] || emptyPool()
    patch({
      treasure_pools: pools.length ? pools : [def],
      treasure: [...treasure, { ...emptyTreasure(), pool_id: def.id }],
    })
  }
  const addLineToPool = (poolId) =>
    patch({ treasure: [...treasure, { ...emptyTreasure(), pool_id: poolId }] })
  // 0o77: drop a monster's loadout items into the default treasure pool (one line
  // each), materializing the pool if needed — they price through budget.js like any
  // catalog/composed treasure line.
  const addLoadoutToTreasure = (items) => {
    const def = pools[0] || emptyPool()
    const lines = items.map((it) => ({ ...emptyTreasure(), ref: it.ref, qty: it.qty || 1, variant: it.variant || '', pool_id: def.id }))
    patch({
      treasure_pools: pools.length ? pools : [def],
      treasure: [...treasure, ...lines],
    })
  }

  // Non-combat XP awards. Blank/zero-amount lines are dropped on save (model.js);
  // the on-screen helper text explains the rest.
  const awards = enc.xp_awards || []
  const setAward = (i, fields) =>
    patch({ xp_awards: awards.map((a, j) => (j === i ? { ...a, ...fields } : a)) })
  const addAward = () => patch({ xp_awards: [...awards, emptyAward()] })
  const removeAward = (i) => patch({ xp_awards: awards.filter((_, j) => j !== i) })

  // Non-treasure reward slots (information/ritual/ally/item) — informational, no
  // gp/XP effect. Rows with an empty label are dropped on save (model.js).
  const rewards = enc.rewards || []
  const setReward = (i, fields) =>
    patch({ rewards: rewards.map((r, j) => (j === i ? { ...r, ...fields } : r)) })
  const addReward = () => patch({ rewards: [...rewards, emptyReward()] })
  const removeReward = (i) => patch({ rewards: rewards.filter((_, j) => j !== i) })

  // Structured skill checks / discovery entries (skill + DC + effect). Rows missing
  // a skill or DC are dropped on save (model.js).
  const skillChecks = enc.skill_checks || []
  const setCheck = (i, fields) =>
    patch({ skill_checks: skillChecks.map((s, j) => (j === i ? { ...s, ...fields } : s)) })
  const addCheck = () => patch({ skill_checks: [...skillChecks, emptySkillCheck()] })
  const removeCheck = (i) => patch({ skill_checks: skillChecks.filter((_, j) => j !== i) })
  // xhwl: alternative skills (OR) + per-degree outcomes on a check.
  const addAlt = (i) => setCheck(i, { alternatives: [...(skillChecks[i].alternatives || []), { skill: '', dc: 0 }] })
  const setAlt = (i, j, fields) =>
    setCheck(i, { alternatives: (skillChecks[i].alternatives || []).map((a, k) => (k === j ? { ...a, ...fields } : a)) })
  const removeAlt = (i, j) =>
    setCheck(i, { alternatives: (skillChecks[i].alternatives || []).filter((_, k) => k !== j) })
  const setOutcome = (i, degree, text) =>
    setCheck(i, { outcomes: { ...(skillChecks[i].outcomes || {}), [degree]: text } })

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
          </div>
        )}

        {tab === 'description' && (
          <div role="tabpanel" id="encpanel-description" aria-labelledby="enctab-description">
            <MarkdownSections
              name="description"
              blocks={descBlocks}
              editing={descEditing}
              released={released}
              siblings={siblingEncounters}
              onOpenEncounter={onOpenEncounter}
              h={descH}
            />
            <label className="field">
              <span>Notes</span>
              <textarea
                value={enc.notes || ''}
                disabled={released}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
          </div>
        )}

        {tab === 'challenges' && (
          <div role="tabpanel" id="encpanel-challenges" aria-labelledby="enctab-challenges">
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
                  onAddToTreasure={addLoadoutToTreasure}
                />
              ))}
              {!released && (
                <button type="button" onClick={() => patch({ monsters: [...monsters, emptyMonster()] })}>
                  + monster
                </button>
              )}
            </fieldset>

            <fieldset>
              <legend>Hazards</legend>
              {hazards.map((h, i) => (
                <HazardLine
                  key={h._key}
                  hazard={h}
                  entryOf={budget.entryOf}
                  disabled={released}
                  onChange={(h2) => setHazard(i, h2)}
                  onRemove={() => patch({ hazards: hazards.filter((_, j) => j !== i) })}
                />
              ))}
              {!released && (
                <button type="button" onClick={() => patch({ hazards: [...hazards, emptyHazard()] })}>
                  + hazard
                </button>
              )}
            </fieldset>

            <fieldset>
              <legend>Afflictions</legend>
              {afflictions.map((a, i) => (
                <AfflictionLine
                  key={a._key}
                  affliction={a}
                  entryOf={budget.entryOf}
                  disabled={released}
                  onChange={(a2) => setAffliction(i, a2)}
                  onRemove={() => patch({ afflictions: afflictions.filter((_, j) => j !== i) })}
                />
              ))}
              {!released && (
                <button type="button" onClick={() => patch({ afflictions: [...afflictions, emptyAffliction()] })}>
                  + affliction
                </button>
              )}
            </fieldset>

            <fieldset>
              <legend>Skill checks</legend>
              <p className="muted">
                Structured discovery checks — skill + DC + what it reveals. Surfaced at the
                table instead of buried in the description.
              </p>
              {skillChecks.map((s, i) => (
                <div className="skill-check" data-testid="skill-check" key={s._key}>
                  {released ? (
                    <div className="skill-check-head">
                      <span className="check-label" data-testid="check-label">{skillCheckLabel(s)}</span>
                    </div>
                  ) : (
                    <div className="skill-check-head">
                      <input
                        className="check-skill"
                        aria-label="check skill"
                        placeholder="Skill (e.g. Perception)"
                        value={s.skill || ''}
                        onChange={(e) => setCheck(i, { skill: e.target.value })}
                      />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="check-dc"
                        aria-label="check DC"
                        placeholder="DC"
                        value={s.dc || ''}
                        onChange={(e) => setCheck(i, { dc: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="check-successes"
                        aria-label="required successes"
                        title="Required successes to resolve (e.g. 4 successful checks)"
                        placeholder="×1"
                        value={s.successes || ''}
                        onChange={(e) => setCheck(i, { successes: Number(e.target.value) })}
                      />
                      <button type="button" className="link danger" onClick={() => removeCheck(i)}>
                        remove
                      </button>
                    </div>
                  )}
                  {!released ? (
                    <textarea
                      className="check-description"
                      aria-label="check effect"
                      placeholder="What it reveals / does (markdown)"
                      value={s.description || ''}
                      onChange={(e) => setCheck(i, { description: e.target.value })}
                    />
                  ) : s.description ? (
                    <WikiMarkdown text={s.description} encounters={siblingEncounters} onOpenEncounter={onOpenEncounter} />
                  ) : null}

                  {/* Alternative skills (OR) — a check the party can pass with another skill+DC. */}
                  {!released && (
                    <div className="check-alts">
                      {(s.alternatives || []).map((a, j) => (
                        <div className="check-alt" data-testid="check-alt" key={j}>
                          <span className="muted">or</span>
                          <input
                            className="check-skill"
                            aria-label="alternative skill"
                            placeholder="Skill"
                            value={a.skill || ''}
                            onChange={(e) => setAlt(i, j, { skill: e.target.value })}
                          />
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className="check-dc"
                            aria-label="alternative DC"
                            placeholder="DC"
                            value={a.dc || ''}
                            onChange={(e) => setAlt(i, j, { dc: Number(e.target.value) })}
                          />
                          <button type="button" className="link danger" onClick={() => removeAlt(i, j)}>remove</button>
                        </div>
                      ))}
                      <button type="button" className="link add-alt" onClick={() => addAlt(i)}>+ alternative skill</button>
                    </div>
                  )}

                  {/* Per-degree-of-success outcomes (native details — open when any is set). */}
                  {!released && (
                    // Uncontrolled <details> — a native toggle React never re-collapses; the
                    // summary shows how many degrees are set so it's discoverable when closed.
                    <details className="check-outcomes">
                      <summary>
                        Per-degree outcomes
                        {(() => {
                          const n = SKILL_CHECK_DEGREES.filter((d) => (s.outcomes?.[d] || '').trim()).length
                          return n ? ` (${n} set)` : ''
                        })()}
                      </summary>
                      {SKILL_CHECK_DEGREES.map((d) => (
                        <label className="outcome field" key={d}>
                          <span>{SKILL_CHECK_DEGREE_LABELS[d]}</span>
                          <textarea
                            aria-label={`${SKILL_CHECK_DEGREE_LABELS[d]} outcome`}
                            value={s.outcomes?.[d] || ''}
                            onChange={(e) => setOutcome(i, d, e.target.value)}
                          />
                        </label>
                      ))}
                    </details>
                  )}
                  {released && s.outcomes && SKILL_CHECK_DEGREES.some((d) => (s.outcomes[d] || '').trim()) && (
                    <ul className="check-outcomes-ro" data-testid="check-outcomes-ro">
                      {SKILL_CHECK_DEGREES.filter((d) => (s.outcomes[d] || '').trim()).map((d) => (
                        <li key={d}><strong>{SKILL_CHECK_DEGREE_LABELS[d]}</strong> {s.outcomes[d]}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {!released && (
                <button type="button" className="add-skill-check" onClick={addCheck}>
                  + skill check
                </button>
              )}
            </fieldset>

            <MarkdownSections
              name="challenge"
              blocks={chalBlocks}
              editing={chalEditing}
              released={released}
              siblings={siblingEncounters}
              onOpenEncounter={onOpenEncounter}
              h={chalH}
            />
          </div>
        )}

        {tab === 'rewards' && (
          <div role="tabpanel" id="encpanel-rewards" aria-labelledby="enctab-rewards">
            <fieldset>
              <legend>Treasure</legend>
              {pools.map((pool) => (
                <TreasurePoolSection
                  key={pool.id}
                  pool={pool}
                  lines={treasure.map((t, i) => ({ t, i })).filter(({ t }) => t.pool_id === pool.id)}
                  disabled={released}
                  canRemove={pools.length > 1}
                  onPoolChange={(fields) => setPool(pool.id, fields)}
                  onPoolRemove={() => removePool(pool.id)}
                  onLineChange={setTreasure}
                  onLineRemove={(i) => patch({ treasure: treasure.filter((_, j) => j !== i) })}
                  onAddLine={() => addLineToPool(pool.id)}
                />
              ))}
              {!released && (
                <div className="treasure-actions">
                  <button type="button" onClick={addTreasure}>+ treasure</button>
                  <button type="button" className="link add-pool" onClick={addPool}>+ pool</button>
                </div>
              )}
            </fieldset>

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
              <legend>XP awards</legend>
              <p className="muted">
                Flat XP for non-combat accomplishments — story milestones, exploration, a
                recruited ally. Counts toward the party’s XP, not the encounter’s combat difficulty.
              </p>
              {awards.map((a, i) => (
                <div className="xp-award" data-testid="xp-award" key={a._key}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="award-amount"
                    aria-label="XP amount"
                    placeholder="XP"
                    value={a.amount || ''}
                    disabled={released}
                    onChange={(e) => setAward(i, { amount: Number(e.target.value) })}
                  />
                  <input
                    className="award-reason"
                    aria-label="award reason"
                    placeholder="Reason (e.g. gained Augrael as an ally)"
                    value={a.reason || ''}
                    disabled={released}
                    onChange={(e) => setAward(i, { reason: e.target.value })}
                  />
                  {!released && (
                    <button type="button" className="link danger" onClick={() => removeAward(i)}>
                      remove
                    </button>
                  )}
                </div>
              ))}
              {!released && (
                <button type="button" className="add-award" onClick={addAward}>
                  + XP award
                </button>
              )}
            </fieldset>

            <fieldset>
              <legend>Rewards</legend>
              <p className="muted">
                Non-treasure rewards — information/lore unlocked, a ritual granted, an ally
                recruited, a unique item. Recorded for the GM; no gp or XP effect.
              </p>
              {rewards.map((r, i) => (
                <div className="reward" data-testid="reward" key={r._key}>
                  <div className="reward-head">
                    <select
                      aria-label="reward kind"
                      value={r.kind || 'information'}
                      disabled={released}
                      onChange={(e) => setReward(i, { kind: e.target.value })}
                    >
                      {REWARD_KINDS.map((k) => (
                        <option key={k} value={k}>{REWARD_KIND_LABELS[k]}</option>
                      ))}
                    </select>
                    <input
                      className="reward-label"
                      aria-label="reward label"
                      placeholder="Name (e.g. The Whispering Reeds)"
                      value={r.label || ''}
                      disabled={released}
                      onChange={(e) => setReward(i, { label: e.target.value })}
                    />
                    {!released && (
                      <button type="button" className="link danger" onClick={() => removeReward(i)}>
                        remove
                      </button>
                    )}
                  </div>
                  {!released ? (
                    <textarea
                      className="reward-description"
                      aria-label="reward description"
                      placeholder="Details — GM notes (markdown)"
                      value={r.description || ''}
                      onChange={(e) => setReward(i, { description: e.target.value })}
                    />
                  ) : r.description ? (
                    <WikiMarkdown text={r.description} encounters={siblingEncounters} onOpenEncounter={onOpenEncounter} />
                  ) : null}
                </div>
              ))}
              {!released && (
                <button type="button" className="add-reward" onClick={addReward}>
                  + reward
                </button>
              )}
            </fieldset>

            <TreasureBudget
              budget={budget}
              partyLevel={effectiveParty.level}
              partySize={effectiveParty.size}
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
                    <button type="button" className="link danger" onClick={() => removeExit(i)}>
                      remove
                    </button>
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
