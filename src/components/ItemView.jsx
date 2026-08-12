import { useEffect, useState } from 'react'
import { ItemCard } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'

// Renders a pfsrd2 item's card from its game_id, via the shared display library.
// Honors the treasure line's masked/maskLabel so the preview shows exactly what
// the party would see for an unidentified item (ItemCard fails closed when masked).
export default function ItemView({ gameId, masked, maskLabel }) {
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

  if (error) return <p className="error">Could not load item: {error}</p>
  if (!data) return <p className="muted">Loading item…</p>
  return (
    <div className="itemcard">
      <ItemCard data={data} masked={masked} maskLabel={maskLabel} />
    </div>
  )
}
