import { useEffect, useState, useSyncExternalStore } from 'react'
import { settings as settingsApi } from '../api/settings.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { encounters as encountersApi } from '../api/encounters.js'
import { errorMessage } from '../api/errors.js'
import { flushState, subscribeFlush, chKey, SAVE_LABEL } from '../store/store.js'
import { resolveParty, partyFields } from '../party.js'
import { BAND_LABELS } from '../pf2eRules.js'
import { isCombatRoom, roomTypeLabel } from '../model.js'
import { naturalSort } from '../sort.js'
import { useRollup } from '../useRollup.js'
import PartyFields from './PartyFields.jsx'
import TreasureRollup from './TreasureRollup.jsx'
import ChapterMap from './ChapterMap.jsx'

// The map fields of a chapter PUT. Both are touch-only-when-supplied on the API, and
// every map save sends BOTH current values: the store keeps only the latest pending
// record, so a positions save must not drop a pending image edit. map_image goes out
// in its write shape only (the strict decoder rejects the GET-only `url`), and only
// when the chapter has one.
export function mapSaveFields(map_positions, map_image) {
  if (!map_image) return { map_positions }
  const { key, width, height, rotation, scale } = map_image
  return { map_positions, map_image: { key, width, height, rotation, scale } }
}

// The chapter detail's three tabs: Config (party override), Summary (treasure/XP
// rollup), Map (connectivity graph). The title bar + name/error stay above the tabs.
const CHAPTER_TABS = [
  { id: 'config', label: 'Config' },
  { id: 'summary', label: 'Summary' },
  { id: 'map', label: 'Map' },
]

// Chapter detail: the chapter's name + expected-party override, and rename/delete.
// Edits persist on change (no Save button); party fields inherit from campaign
// settings when left empty. Chapter update full-replaces name + order + party
// fields, so every save round-trips them via the shared clear-encoding. The body is
// tabbed (Config / Summary / Map); the rollup hook runs unconditionally so its tab
// shows fresh numbers regardless of which tab is active.
export default function ChapterDetail({ campaignId, chapter, onClose, onSaved, onDeleted, onSaveError, onOpenEncounter }) {
  const [tab, setTab] = useState('config')
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
  // The saved map layout, held locally so an in-session drag-save is reflected when the
  // map remounts (e.g. switching away from the Map tab and back) — the `chapter` prop
  // isn't refreshed after a save, so seeding off it would revert to the last page-load.
  const [mapPositions, setMapPositions] = useState(chapter.map_positions)
  const [mapImage, setMapImage] = useState(chapter.map_image)
  useEffect(() => { // re-init when a different chapter opens
    setMapPositions(chapter.map_positions)
    setMapImage(chapter.map_image)
  }, [chapter.id])

  // Autosave now runs through the store's flush layer (rtd8b-2): the indicator
  // reads flush state; commit() mirrors the built input into the store, which
  // debounces the PUT. Flush a pending edit when leaving.
  const saveState = useSyncExternalStore(subscribeFlush, () => flushState(chKey(campaignId, chapter.id)))
  useEffect(() => () => chaptersApi.flush(campaignId, chapter.id), [campaignId, chapter.id])

  // Always-visible chapter treasure rollup (per encounter). Called unconditionally
  // before the early return (rules of hooks); tolerates the still-loading state.
  // Resolve each encounter's party from the LIVE edited party fields, not the stale
  // `chapter` prop — otherwise changing this chapter's PC count/level doesn't
  // recompute the rollup until you leave and re-open (the prop reloads then).
  const liveChapter = { ...chapter, party_level: value.party_level, party_size: value.party_size }
  const rollup = useRollup(chapterEncounters, (enc) => resolveParty({ encounter: enc, chapter: liveChapter, campaign: campaignSettings }))

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
      // Natural-sort (A1, A2, A3, A7, A10, A15, A23 — not lexical, not list order)
      // so the rollup + map match the sidebar's ordering, not the API's.
      .then((all) => alive && setChapterEncounters(naturalSort(all.filter((e) => e.chapter_id === chapter.id), (e) => e.name || '')))
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
    if (next.name.trim()) {
      chaptersApi.edit(
        campaignId,
        chapter.id,
        { name: next.name.trim(), order: chapter.order, ...partyFields(next) },
        {
          onSaved: (updated) => onSaved && onSaved(updated),
          onError: () => onSaveError && onSaveError(`chapter “${next.name.trim() || 'Untitled chapter'}”`, chapter.id),
        },
      )
    }
  }

  // Persist the map: the GM's hand-arranged layout and/or the image's rotate/scale.
  // Round-trips name + party (party is full-replace, so omitting it would clear the
  // override).
  function saveMap(patch) {
    const name = value.name.trim() || chapter.name
    if (!name) return
    const map_positions = patch.map_positions ?? mapPositions
    const map_image = patch.map_image ?? mapImage
    setMapPositions(map_positions) // reflect locally so a map remount seeds off the fresh layout
    setMapImage(map_image)
    chaptersApi.edit(
      campaignId,
      chapter.id,
      { name, order: chapter.order, ...partyFields(value), ...mapSaveFields(map_positions, map_image) },
      {
        onSaved: (updated) => onSaved && onSaved(updated),
        onError: () => onSaveError && onSaveError(`chapter “${name}” map layout`, chapter.id),
      },
    )
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
      {/* Title + tabs pin together as one sticky header; only the active panel scrolls
          under them, and its width is isolated so a wide map can't push the header. */}
      <div className="detail-header">
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
        {error && <p className="error" role="alert">{error}</p>}

        <div className="tabs" role="tablist" aria-label="Chapter sections">
          {CHAPTER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`chtab-${t.id}`}
              aria-controls={`chpanel-${t.id}`}
              aria-selected={tab === t.id}
              className={`tab${tab === t.id ? ' tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-panel">
      {tab === 'config' && (
        <div role="tabpanel" id="chpanel-config" aria-labelledby="chtab-config">
          <p className="muted">
            Expected party for this chapter. Its encounters inherit these unless they set their
            own; leave a field empty to inherit from the campaign.
          </p>
          <PartyFields
            value={value}
            inherited={inherited}
            inheritedError={settingsError}
            onChange={(next) => commit({ ...value, ...next })}
          />
        </div>
      )}

      {tab === 'summary' && (
        <div role="tabpanel" id="chpanel-summary" aria-labelledby="chtab-summary">
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
        </div>
      )}

      {tab === 'map' && (
        <div role="tabpanel" id="chpanel-map" aria-labelledby="chtab-map">
          <ChapterMap
            encounters={chapterEncounters}
            onOpenEncounter={onOpenEncounter}
            positions={mapPositions}
            onPositionsChange={(map_positions) => saveMap({ map_positions })}
            mapImage={mapImage}
            onMapImageChange={(map_image) => saveMap({ map_image })}
          />
        </div>
      )}
      </div>
    </section>
  )
}
