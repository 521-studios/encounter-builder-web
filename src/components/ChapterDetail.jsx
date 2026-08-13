import { useEffect, useState } from 'react'
import { settings as settingsApi } from '../api/settings.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { encounters as encountersApi } from '../api/encounters.js'
import { errorMessage } from '../api/errors.js'
import { resolveParty, partyFields } from '../party.js'
import PartyFields from './PartyFields.jsx'
import TreasureRollup from './TreasureRollup.jsx'

// Chapter detail: the chapter's expected-party override. Inherits from campaign
// settings when a field is left empty; encounters in the chapter inherit from
// here. Saving round-trips name + order (chapter update full-replaces the party
// fields, so an empty field clears the override back to inherit).
export default function ChapterDetail({ campaignId, chapter, onClose, onSaved }) {
  const [value, setValue] = useState({
    party_level: chapter.party_level ?? null,
    party_size: chapter.party_size ?? null,
  })
  const [campaignSettings, setCampaignSettings] = useState(null) // null while loading
  const [settingsError, setSettingsError] = useState(false) // campaign settings load failed
  const [chapterEncounters, setChapterEncounters] = useState([]) // this chapter's encounters (for the rollup)
  const [encountersError, setEncountersError] = useState(false) // encounters list failed to load (rollup is unreliable)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showRollup, setShowRollup] = useState(false) // rollup fetches on demand — keep page load light
  const [reloadKey, setReloadKey] = useState(0) // bump to re-fetch the encounters list on retry

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

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await chaptersApi.update(campaignId, chapter.id, {
        name: chapter.name,
        order: chapter.order,
        ...partyFields(value),
      })
      setValue({ party_level: updated.party_level ?? null, party_size: updated.party_size ?? null })
      setSaved(true)
      onSaved && onSaved(updated)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (campaignSettings === null) return <p>Loading…</p>

  // An empty chapter field inherits from campaign settings (then app default).
  const inherited = resolveParty({ campaign: campaignSettings })

  return (
    <section className="detail chapter-detail" data-testid="chapter-detail">
      <div className="detail-head">
        <h2>{chapter.name} — settings</h2>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      <p className="muted">
        Expected party for this chapter. Its encounters inherit these unless they set their
        own; leave a field empty to inherit from the campaign.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <PartyFields
        value={value}
        inherited={inherited}
        inheritedError={settingsError}
        disabled={saving}
        onChange={(next) => {
          setValue(next)
          setSaved(false)
        }}
      />
      <div className="actions">
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="save-state muted" data-testid="chapter-saved">Saved</span>}
      </div>

      <div className="rollup-toggle">
        <button type="button" className="link" aria-expanded={showRollup} onClick={() => setShowRollup((v) => !v)}>
          {showRollup ? 'Hide' : 'Show'} chapter treasure
        </button>
      </div>
      {showRollup && (
        <TreasureRollup
          encounters={chapterEncounters}
          partyFor={(enc) => resolveParty({ encounter: enc, chapter, campaign: campaignSettings })}
          title="Chapter treasure"
          emptyLabel="No encounters in this chapter yet."
          loadError={encountersError}
          onReload={() => setReloadKey((k) => k + 1)}
        />
      )}
    </section>
  )
}
