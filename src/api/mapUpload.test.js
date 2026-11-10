import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uploadMapImage, uploadEncounterImage, imageSize, MAP_IMAGE_MAX_BYTES } from './mapUpload.js'

const file = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'map.png', { type })

function fakes({ s3Status = 204 } = {}) {
  const calls = { requests: [], posts: [] }
  return {
    calls,
    opts: {
      measure: async () => ({ width: 800, height: 600 }),
      requestImpl: async (method, path, { body }) => {
        calls.requests.push({ method, path, body })
        return { key: 'maps/c1/ch1/abc.png', url: 'https://bucket.test', fields: { key: 'maps/c1/ch1/abc.png', policy: 'p' } }
      },
      fetchImpl: async (url, init) => {
        calls.posts.push({ url, form: [...init.body.entries()] })
        return { ok: s3Status < 400, status: s3Status }
      },
    },
  }
}

test('uploadMapImage: presigns, POSTs fields then file to S3, returns the write shape', async () => {
  const { calls, opts } = fakes()
  const img = await uploadMapImage('c1', 'ch1', file(), opts)
  assert.deepEqual(calls.requests, [{ method: 'POST', path: '/api/app/campaigns/c1/chapters/ch1/map-image/upload-url', body: { content_type: 'image/png' } }])
  assert.equal(calls.posts[0].url, 'https://bucket.test')
  assert.deepEqual(calls.posts[0].form.map(([k]) => k), ['key', 'policy', 'file']) // the file must be last
  assert.deepEqual(img, { key: 'maps/c1/ch1/abc.png', url: '/maps/c1/ch1/abc.png', width: 800, height: 600, rotation: 0, scale: 1 })
})

test('uploadEncounterImage: presigns against the encounter route', async () => {
  const { calls, opts } = fakes()
  await uploadEncounterImage('c1', 'e/1', file(), opts)
  assert.equal(calls.requests[0].path, '/api/app/campaigns/c1/encounters/e%2F1/map-image/upload-url')
})

test('uploadMapImage: rejects wrong types and oversize files before any request', async () => {
  const { calls, opts } = fakes()
  await assert.rejects(uploadMapImage('c1', 'ch1', file('image/gif'), opts), /PNG, JPEG or WebP/)
  await assert.rejects(uploadMapImage('c1', 'ch1', file('image/png', MAP_IMAGE_MAX_BYTES + 1), opts), /15 MB/)
  assert.equal(calls.requests.length, 0)
})

test('uploadMapImage: an S3 rejection is an error, not a map image', async () => {
  const { opts } = fakes({ s3Status: 403 })
  await assert.rejects(uploadMapImage('c1', 'ch1', file(), opts), /upload failed \(403\)/)
})

test('imageSize: reads the natural size and releases the bitmap', async () => {
  let closed = false
  globalThis.createImageBitmap = async () => ({ width: 640, height: 480, close: () => { closed = true } })
  try {
    assert.deepEqual(await imageSize(file()), { width: 640, height: 480 })
    assert.equal(closed, true)
  } finally {
    delete globalThis.createImageBitmap
  }
})

test('uploadMapImage: an undecodable file fails before any request', async () => {
  const { calls, opts } = fakes()
  opts.measure = async () => { throw new DOMException('bad image', 'InvalidStateError') }
  await assert.rejects(uploadMapImage('c1', 'ch1', file(), opts), /Could not read that image file/)
  assert.equal(calls.requests.length, 0)
})

test('uploadMapImage: a network failure on the S3 POST gets a readable error', async () => {
  const { opts } = fakes()
  opts.fetchImpl = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(uploadMapImage('c1', 'ch1', file(), opts), /network error/)
})
