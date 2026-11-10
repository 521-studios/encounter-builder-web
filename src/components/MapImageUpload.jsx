import { useState } from 'react'
import { MAP_IMAGE_TYPES } from '../api/mapUpload.js'

// Upload, replace or remove a map image (a chapter's map, muz0.5, or an encounter's
// own room image, muz0.7). `upload(file)` sends the file straight to S3 and resolves
// to the new map_image; onChange receives it, or null to remove.
export default function MapImageUpload({ upload, mapImage, onChange, noun = 'map image' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file after an error
    if (!file) return
    setBusy(true)
    setError('')
    try {
      onChange(await upload(file))
    } catch (err) {
      setError(err.message || 'Map image upload failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="map-image-upload">
      <label>
        {mapImage ? `Replace ${noun}` : `Upload ${noun}`}{' '}
        <input type="file" accept={MAP_IMAGE_TYPES.join(',')} disabled={busy} onChange={pick} />
      </label>
      {mapImage && (
        <button type="button" className="link" disabled={busy} onClick={() => onChange(null)}>
          Remove {noun}
        </button>
      )}
      {busy && <span role="status">Uploading…</span>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
