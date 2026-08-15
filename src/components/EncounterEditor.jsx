import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@521studios/pfsrd2-display'
import { errorMessage } from '../api/errors.js'
import { encounters } from '../api/encounters.js'
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
  emptyMonster,
  emptyTreasure,
  emptyPool,
  emptyAward,
  emptyReward,
  emptySkillCheck,
  emptyExit,
  keyed,
} from '../model.js'
import { resolveParty } from '../party.js'
import { BAND_LABELS, BASE_PARTY } from '../pf2eRules.js'
import { useEncounterBudget } from '../useEncounterBudget.js'
import MonsterLine from './MonsterLine.jsx'
import TreasurePoolSection from './TreasurePoolSection.jsx'
import PartyFields from './PartyFields.jsx'
import TreasureBudget from './TreasureBudget.jsx'

const AUTOSAVE_MS = 800

export default function EncounterEditor({ campaignId, encounterId, onClose, onSaved, onDeleted, onSaveError }) {
  const [enc, setEnc] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('saved') // saved | unsaved | saving | error
  const [releasing, setReleasing] = useState(false)
  const [chapters, setChapters] = useState([]) // for the Chapter picker (keyboard-accessible move)
  const [siblingEncounters, setSiblingEncounters] = useState([]) // campaign encounters, for the exit target picker
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
    encounters
      .list(campaignId)
      .then((es) => alive && setSiblingEncounters(es))
      .catch(() => {}) // exit target picker just falls back to external-only
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

  // Exits: the room's connectivity edges. Each targets another encounter (a soft
  // reference) or an external destination named by label. Empty rows drop on save.
  const exits = enc.exits || []
  const exitTargets = siblingEncounters.filter((e) => String(e.id) !== String(encounterId)) // not self
  const setExit = (i, fields) =>
    patch({ exits: exits.map((e, j) => (j === i ? { ...e, ...fields } : e)) })
  const addExit = () => patch({ exits: [...exits, emptyExit()] })
  const removeExit = (i) => patch({ exits: exits.filter((_, j) => j !== i) })

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
        {isCombatRoom(budget.roomType) ? (
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
              <Markdown block text={r.description} />
            ) : null}
          </div>
        ))}
        {!released && (
          <button type="button" className="add-reward" onClick={addReward}>
            + reward
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
            <div className="skill-check-head">
              <input
                className="check-skill"
                aria-label="check skill"
                placeholder="Skill (e.g. Perception)"
                value={s.skill || ''}
                disabled={released}
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
                disabled={released}
                onChange={(e) => setCheck(i, { dc: Number(e.target.value) })}
              />
              {!released && (
                <button type="button" className="link danger" onClick={() => removeCheck(i)}>
                  remove
                </button>
              )}
            </div>
            {!released ? (
              <textarea
                className="check-description"
                aria-label="check effect"
                placeholder="What it reveals / does (markdown)"
                value={s.description || ''}
                onChange={(e) => setCheck(i, { description: e.target.value })}
              />
            ) : s.description ? (
              <Markdown block text={s.description} />
            ) : null}
          </div>
        ))}
        {!released && (
          <button type="button" className="add-skill-check" onClick={addCheck}>
            + skill check
          </button>
        )}
      </fieldset>

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
              {/* A soft reference to a since-deleted encounter shows honestly as broken
                  (not silently as "— External —") so the GM can re-point or remove it. */}
              {ex.to_encounter_id && !exitTargets.some((t) => String(t.id) === String(ex.to_encounter_id)) && (
                <option value={ex.to_encounter_id}>(deleted encounter)</option>
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
