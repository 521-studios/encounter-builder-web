import { useEffect, useState } from 'react'
import { settings as settingsApi } from '../api/settings.js'
import { errorMessage } from '../api/errors.js'
import { PARTY_DEFAULT, partyFields } from '../party.js'
import PartyFields from './PartyFields.jsx'

// Campaign detail: the base of the expected-party inheritance chain. Set the
// campaign-wide default party level + PC count; chapters and encounters inherit
// these unless they override. Empty fields fall back to the app default.
export default function CampaignDetail({ campaign, onClose, onSaved }) {
  const [value, setValue] = useState(null) // { party_level, party_size } | null while loading
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    setValue(null)
    setError(null)
    settingsApi
      .get(campaign.id)
      .then((s) => alive && setValue({ party_level: s.party_level ?? null, party_size: s.party_size ?? null }))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [campaign.id])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const s = await settingsApi.put(campaign.id, partyFields(value))
      setValue({ party_level: s.party_level ?? null, party_size: s.party_size ?? null })
      setSaved(true)
      onSaved && onSaved()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (error && !value) return <p className="error" role="alert">{error}</p>
  if (!value) return <p>Loading…</p>

  // Campaign is the base layer; an empty field falls back to the app default.
  const inherited = { level: PARTY_DEFAULT.level, size: PARTY_DEFAULT.size, levelSource: 'default', sizeSource: 'default' }

  return (
    <section className="detail campaign-detail" data-testid="campaign-detail">
      <div className="detail-head">
        <h2>{campaign.name} — settings</h2>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      <p className="muted">
        Campaign defaults for the expected party level and number of PCs. Chapters and
        encounters inherit these unless they set their own.
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
        {saved && <span className="save-state muted" data-testid="settings-saved">Saved</span>}
      </div>
    </section>
  )
}
