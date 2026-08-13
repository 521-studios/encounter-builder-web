import { useEffect, useState } from 'react'
import { ItemCard } from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'
import { variantIndex } from '../variants.js'

// Renders a pfsrd2 item's card from its game_id, via the shared display library.
// This is the GM authoring view, so it always shows the REAL item — masking is a
// player-facing concern (the party-treasure app renders the mask); the GM needs
// to see what they picked. TreasureLine shows the mask label separately.
//
// The treasure line persists the chosen variant by NAME (stable). ItemCard is
// index-based, so this maps name<->index against the loaded item's variants.
export default function ItemView({ gameId, variant, onVariantChange }) {
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

  const variants = (data.stat_block && data.stat_block.variants) || []
  const index = variantIndex(variants, variant) // name -> index; -1 when no pick yet
  // A versioned item must have a version locked in; prompt until it does (authoring only).
  const needsPick = variants.length > 1 && index < 0 && !!onVariantChange
  return (
    <div className="itemcard">
      {needsPick ? (
        <p className="variant-hint">Choose a version below to lock this item in.</p>
      ) : null}
      <ItemCard
        data={data}
        variant={index}
        onVariantChange={onVariantChange ? (i) => onVariantChange(variants[i] ? variants[i].name : '') : undefined}
      />
    </div>
  )
}
