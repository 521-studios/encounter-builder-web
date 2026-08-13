import { useEffect, useState } from 'react'
import { settings as settingsApi } from '../api/settings.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { errorMessage } from '../api/errors.js'
import { resolveParty } from '../party.js'
import PartyFields from './PartyFields.jsx'

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
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    settingsApi
      .get(campaignId)
      .then((s) => alive && setCampaignSettings(s))
      .catch(() => alive && setCampaignSettings({})) // fall back to app default on failure
    return () => {
      alive = false
    }
  }, [campaignId])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await chaptersApi.update(campaignId, chapter.id, {
        name: chapter.name,
        order: chapter.order,
        party_level: value.party_level,
        party_size: value.party_size,
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
    </section>
  )
}
