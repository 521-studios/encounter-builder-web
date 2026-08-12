import { useEffect, useState } from 'react'
import { CreatureStatBlock } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'

// Renders a pfsrd2 creature's full stat block from its game_id, via the shared
// display library. Dice rolls / monster links are no-ops here — the encounter
// builder shows the block for reference, it doesn't roll.
export default function CreatureView({ gameId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    pfsrd2
      .entryFull(gameId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [gameId])

  if (error) return <p className="error">Could not load stat block: {error}</p>
  if (!data) return <p className="muted">Loading stat block…</p>
  return (
    <div className="statblock">
      <CreatureStatBlock
        data={data}
        onRoll={() => {}}
        onLoadMonster={() => {}}
        imageBaseUrl="/api/pfsrd2/images"
      />
    </div>
  )
}
