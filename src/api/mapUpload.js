// Map image upload (muz0.5): ask the API for a presigned S3 POST, send the file
// straight to S3, and return the chapter's map_image write shape. The POST goes to
// the bucket, not through CloudFront, so it needs no bearer or body hash. The
// policy pins the content type and the 15MB cap. Display is same-origin
// (/maps/<key>, served by CloudFront), so the url is derived from the key.
import { request } from './client.js'

export const MAP_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAP_IMAGE_MAX_BYTES = 15 * 1024 * 1024

// Natural pixel size, read before uploading so an undecodable file fails fast.
export async function imageSize(file) {
  const bmp = await createImageBitmap(file)
  const size = { width: bmp.width, height: bmp.height }
  bmp.close()
  return size
}

export async function uploadMapImage(campaignId, chapterId, file, { requestImpl = request, fetchImpl = fetch, measure = imageSize } = {}) {
  if (!MAP_IMAGE_TYPES.includes(file.type)) throw new Error('Map image must be a PNG, JPEG or WebP file.')
  if (file.size > MAP_IMAGE_MAX_BYTES) throw new Error('Map image must be 15 MB or smaller.')
  const { width, height } = await measure(file)
  const path = `/api/app/campaigns/${encodeURIComponent(campaignId)}/chapters/${encodeURIComponent(chapterId)}/map-image/upload-url`
  const { key, url, fields } = await requestImpl('POST', path, { body: { content_type: file.type } })
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  form.append('file', file) // S3 requires the file to be the last field
  const res = await fetchImpl(url, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Map image upload failed (${res.status}).`)
  return { key, url: `/${key}`, width, height, rotation: 0, scale: 1 }
}
