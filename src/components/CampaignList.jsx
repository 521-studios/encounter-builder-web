import { useEffect, useState } from 'react'
import { fetchGames } from '../api/letsroll.js'

// Lists the campaigns the signed-in user GMs (this is the GM tool, so non-GM
// games are filtered out — the API would 403 encounter ops on them anyway).
export default function CampaignList({ onSelect, selectedId }) {
  const [games, setGames] = useState(null) // null = loading
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchGames()
      .then((gs) => alive && setGames(gs))
      .catch((e) => alive && setError(e.message || String(e)))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <p className="error" role="alert">Could not load campaigns: {error}</p>
  if (games === null) return <p>Loading campaigns…</p>

  const gmGames = games.filter((g) => g.am_gm)
  if (gmGames.length === 0) {
    return (
      <p className="empty">
        You don’t GM any campaigns yet. Create one in lets-roll, then come back to build encounters.
      </p>
    )
  }

  return (
    <section className="campaigns">
      <h2>Your campaigns</h2>
      <ul className="campaign-list">
        {gmGames.map((g) => (
          <li key={g.id}>
            <button
              className={g.id === selectedId ? 'campaign selected' : 'campaign'}
              onClick={() => onSelect(g)}
              aria-pressed={g.id === selectedId}
            >
              {g.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
