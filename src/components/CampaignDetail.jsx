import { useEffect, useState } from 'react'
import { settings as settingsApi } from '../api/settings.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { encounters as encountersApi } from '../api/encounters.js'
import { errorMessage } from '../api/errors.js'
import { PARTY_DEFAULT, partyFields, resolveParty } from '../party.js'
import { treasureTotalForLevel } from '../pf2eRules.js'
import PartyFields from './PartyFields.jsx'
import TreasureRollup from './TreasureRollup.jsx'

// Campaign detail: the base of the expected-party inheritance chain. Set the
// campaign-wide default party level + PC count; chapters and encounters inherit
// these unless they override. Empty fields fall back to the app default.
export default function CampaignDetail({ campaign, onClose, onSaved }) {
  const [value, setValue] = useState(null) // { party_level, party_size } | null while loading
  const [allChapters, setAllChapters] = useState([]) // for per-encounter inheritance in the rollup
  const [allEncounters, setAllEncounters] = useState([]) // every encounter (campaign-wide rollup)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showRollup, setShowRollup] = useState(false) // rollup fetches on demand — keep page load light
  const [rollupError, setRollupError] = useState(false) // chapters/encounters list failed — rollup can't be trusted
  const [reloadKey, setReloadKey] = useState(0) // bump to re-fetch the rollup's lists on retry

  useEffect(() => {
    let alive = true
    setValue(null)
    setError(null)
    setRollupError(false)
    settingsApi
      .get(campaign.id)
      .then((s) => alive && setValue({ party_level: s.party_level ?? null, party_size: s.party_size ?? null }))
      .catch((e) => alive && setError(errorMessage(e)))
    // The rollup needs both lists: chapters drive per-encounter party inheritance,
    // encounters are the loot. If either fails, flag it so the rollup shows an
    // error instead of a plausible-but-wrong (or empty) total.
    chaptersApi.list(campaign.id).then((cs) => alive && setAllChapters(cs)).catch(() => alive && setRollupError(true))
    encountersApi.list(campaign.id).then((es) => alive && setAllEncounters(es)).catch(() => alive && setRollupError(true))
    return () => {
      alive = false
    }
  }, [campaign.id, reloadKey])

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
  // Reference: a full level's treasure at the campaign's base party level/size.
  const base = resolveParty({ campaign: value })
  const referenceCp = treasureTotalForLevel(base.level, base.size) * 100

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

      <div className="rollup-toggle">
        <button type="button" className="link" aria-expanded={showRollup} onClick={() => setShowRollup((v) => !v)}>
          {showRollup ? 'Hide' : 'Show'} campaign treasure
        </button>
      </div>
      {showRollup && (
        <TreasureRollup
          encounters={allEncounters}
          partyFor={(enc) =>
            resolveParty({
              encounter: enc,
              chapter: allChapters.find((c) => c.id === enc.chapter_id) || null,
              campaign: value,
            })
          }
          title="Campaign treasure"
          referenceCp={referenceCp}
          emptyLabel="No encounters in this campaign yet."
          loadError={rollupError}
          onReload={() => setReloadKey((k) => k + 1)}
        />
      )}
    </section>
  )
}
