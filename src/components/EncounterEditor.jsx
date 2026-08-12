import { useEffect, useState } from 'react'
import { Markdown } from '@521studios/pfsrd2-display'
import { errorMessage } from '../api/errors.js'
import { encounters } from '../api/encounters.js'
import { CURRENCIES, emptyMonster, emptyTreasure, keyed, toEncounterInput } from '../model.js'
import MonsterLine from './MonsterLine.jsx'
import TreasureLine from './TreasureLine.jsx'

export default function EncounterEditor({ campaignId, encounterId, onClose, onSaved }) {
  const [enc, setEnc] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    setEnc(null)
    setError(null)
    encounters
      .get(campaignId, encounterId)
      .then((e) => alive && setEnc(keyed(e)))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [campaignId, encounterId])

  if (error && !enc) return <p className="error" role="alert">{error}</p>
  if (!enc) return <p>Loading encounter…</p>

  const released = enc.status === 'released'
  const patch = (fields) => setEnc({ ...enc, ...fields })
  const monsters = enc.monsters || []
  const treasure = enc.treasure || []

  const setMonster = (i, m) => patch({ monsters: monsters.map((x, j) => (j === i ? m : x)) })
  const setTreasure = (i, t) => patch({ treasure: treasure.map((x, j) => (j === i ? t : x)) })

  function buildInput() {
    const input = toEncounterInput(enc) // echoes chapter_id/description/monsters/…
    if (released) delete input.status // release is its own action; don't move status here
    return input
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const saved = await encounters.update(campaignId, encounterId, buildInput())
      setEnc(keyed(saved))
      onSaved && onSaved(saved)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Release hands the loot to the party: it saves current edits first (so the
  // released encounter matches what the GM sees), then flips it to released —
  // after which the editor renders read-only.
  async function release() {
    if (!window.confirm('Release this encounter to the party? It becomes read-only.')) return
    setSaving(true)
    setError(null)
    try {
      await encounters.update(campaignId, encounterId, buildInput())
      const result = await encounters.release(campaignId, encounterId)
      setEnc(keyed(result))
      onSaved && onSaved(result)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
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
        <span className="status">{enc.status}</span>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>

      {released && <p className="muted">Released — read-only.</p>}
      {error && <p className="error" role="alert">{error}</p>}

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

      {!released && (
        <div className="actions">
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={release} disabled={saving}>Release to party</button>
        </div>
      )}
    </section>
  )
}
