import { useEffect, useState } from 'react'
import { AfflictionStatBlock } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'

// Renders an affliction's stat block from its game_id via the shared display library.
// Afflictions are flat-doc entities (not creature-shaped), so this uses AfflictionStatBlock,
// not CreatureStatBlock. Data-as-props: fetch the full entry, hand it over.
export default function AfflictionView({ gameId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    pfsrd2
      .entryFull(gameId)
      .then((d) => alive && setData(d.entry ? d.entry : d))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [gameId])

  if (error) return <p className="error">Could not load affliction: {error}</p>
  if (!data) return <p className="muted">Loading affliction…</p>
  return (
    <div className="afflictioncard">
      <AfflictionStatBlock data={data} />
    </div>
  )
}
