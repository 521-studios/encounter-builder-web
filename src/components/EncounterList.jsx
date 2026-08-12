import { useEffect, useState } from 'react'
import { errorMessage } from '../api/errors.js'
import { encounters } from '../api/encounters.js'

// Encounters within a campaign: list, create, select-to-edit, delete.
export default function EncounterList({ campaignId, onEdit, reloadKey }) {
  const [list, setList] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setList(null)
    setError(null)
    encounters
      .list(campaignId)
      .then((l) => alive && setList(l))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [campaignId, reloadKey])

  async function create(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const enc = await encounters.create(campaignId, { name, currency: {} })
      setNewName('')
      onEdit(enc) // open the new encounter
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setError(null)
    try {
      await encounters.remove(campaignId, id)
      setList((l) => (l || []).filter((e) => e.id !== id))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <section className="encounters">
      <h3>Encounters</h3>
      <form onSubmit={create} className="new-encounter">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New encounter name"
          aria-label="new encounter name"
        />
        <button className="primary" disabled={busy || !newName.trim()}>Add</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {list === null ? (
        <p>Loading…</p>
      ) : list.length === 0 ? (
        <p className="muted">No encounters yet.</p>
      ) : (
        <ul className="encounter-list">
          {list.map((e) => (
            <li key={e.id}>
              <button className="encounter" onClick={() => onEdit(e)}>
                {e.name} <span className="status">{e.status}</span>
              </button>
              <button className="link danger" onClick={() => remove(e.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
