import { useEffect, useState } from 'react'
import { settings as settingsApi } from '../api/settings.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { encounters as encountersApi } from '../api/encounters.js'
import { errorMessage } from '../api/errors.js'
import { resolveParty, partyFields } from '../party.js'
import { BAND_LABELS } from '../pf2eRules.js'
import { isCombatRoom, roomTypeLabel } from '../model.js'
import { useAutosave, SAVE_LABEL } from '../useAutosave.js'
import { useRollup } from '../useRollup.js'
import PartyFields from './PartyFields.jsx'
import TreasureRollup from './TreasureRollup.jsx'

// Chapter detail: the chapter's name + expected-party override, and rename/delete.
// Edits persist on change (no Save button); party fields inherit from campaign
// settings when left empty. Chapter update full-replaces name + order + party
// fields, so every save round-trips them via the shared clear-encoding.
export default function ChapterDetail({ campaignId, chapter, onClose, onSaved, onDeleted, onSaveError }) {
  const [value, setValue] = useState({
    name: chapter.name || '',
    party_level: chapter.party_level ?? null,
    party_size: chapter.party_size ?? null,
  })
  const [campaignSettings, setCampaignSettings] = useState(null) // null while loading
  const [settingsError, setSettingsError] = useState(false) // campaign settings load failed
  const [chapterEncounters, setChapterEncounters] = useState([]) // this chapter's encounters (for the rollup)
  const [encountersError, setEncountersError] = useState(false) // encounters list failed to load (rollup is unreliable)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0) // bump to re-fetch the encounters list on retry

  const { state: saveState, schedule } = useAutosave(
    async (v) => {
      const updated = await chaptersApi.update(campaignId, chapter.id, {
        name: v.name.trim(),
        order: chapter.order,
        ...partyFields(v),
      })
      onSaved && onSaved(updated)
    },
    800,
    () => onSaveError && onSaveError(`chapter “${value.name.trim() || 'Untitled chapter'}”`),
  )

  // Always-visible chapter treasure rollup (per encounter). Called unconditionally
  // before the early return (rules of hooks); tolerates the still-loading state.
  const rollup = useRollup(chapterEncounters, (enc) => resolveParty({ encounter: enc, chapter, campaign: campaignSettings }))

  useEffect(() => {
    let alive = true
    setEncountersError(false)
    setSettingsError(false) // a retry (reloadKey) re-fetches settings too — clear the stale banner
    settingsApi
      .get(campaignId)
      .then((s) => alive && setCampaignSettings(s))
      .catch(() => {
        // The chapter's own override is still editable; flag that the inherited
        // campaign values couldn't load so the shown defaults aren't a silent lie.
        if (!alive) return
        setCampaignSettings({})
        setSettingsError(true)
      })
    encountersApi
      .list(campaignId)
      .then((all) => alive && setChapterEncounters(all.filter((e) => e.chapter_id === chapter.id)))
      .catch(() => {
        // Don't let a load failure masquerade as an empty chapter in the rollup —
        // flag it so TreasureRollup shows an error + retry instead of "no encounters".
        if (alive) setEncountersError(true)
      })
    return () => {
      alive = false
    }
  }, [campaignId, chapter.id, reloadKey])

  // Persist on change — but never PUT an empty name (the API requires one); the
  // field then shows a "name is required" hint until it's filled back in.
  function commit(next) {
    setValue(next)
    if (next.name.trim()) schedule(next)
  }

  async function del() {
    if (!window.confirm(`Delete chapter "${value.name.trim() || 'Untitled chapter'}"? Its encounters move to Unsorted.`)) return
    try {
      await chaptersApi.remove(campaignId, chapter.id)
      onDeleted && onDeleted()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (campaignSettings === null) return <p>Loading…</p>

  // An empty chapter field inherits from campaign settings (then app default).
  const inherited = resolveParty({ campaign: campaignSettings })
  const nameMissing = value.name.trim() === ''

  return (
    <section className="detail chapter-detail" data-testid="chapter-detail">
      <div className="detail-head">
        <input
          className="title-input"
          aria-label="chapter name"
          value={value.name}
          autoFocus
          onChange={(e) => commit({ ...value, name: e.target.value })}
        />
        <span className="save-state muted" data-testid="chapter-saved">{SAVE_LABEL[saveState]}</span>
        <button type="button" className="link danger" aria-label={`Delete chapter ${value.name.trim() || 'Untitled chapter'}`} onClick={del}>Delete chapter</button>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      {nameMissing && <p className="error" role="alert">Name is required.</p>}
      <p className="muted">
        Expected party for this chapter. Its encounters inherit these unless they set their
        own; leave a field empty to inherit from the campaign.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <PartyFields
        value={value}
        inherited={inherited}
        inheritedError={settingsError}
        onChange={(next) => commit({ ...value, ...next })}
      />

      <TreasureRollup
        rollup={rollup}
        title="Chapter treasure"
        rowLabel="Encounter"
        secondaryLabel="Type / difficulty"
        secondaryOf={(r) => (isCombatRoom(r.roomType) ? BAND_LABELS[r.threat] : roomTypeLabel(r.roomType))}
        emptyLabel="No encounters in this chapter yet."
        loadError={encountersError}
        onReload={() => setReloadKey((k) => k + 1)}
      />
    </section>
  )
}
