import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import MapImageUpload from './MapImageUpload.jsx'

afterEach(() => cleanup())

const png = () => new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })
const pick = (file) => fireEvent.change(screen.getByLabelText(/room image/), { target: { files: [file] } })

test('MapImageUpload: a picked file is uploaded and the result handed to onChange', async () => {
  const got = []
  const img = { key: 'k', url: '/k', width: 1, height: 1 }
  render(<MapImageUpload noun="room image" upload={async () => img} mapImage={null} onChange={(v) => got.push(v)} />)
  assert.ok(screen.getByText(/Upload room image/))
  pick(png())
  await waitFor(() => assert.deepEqual(got, [img]))
})

test('MapImageUpload: an upload error is shown and nothing is saved', async () => {
  const got = []
  render(<MapImageUpload noun="room image" upload={async () => { throw new Error('Map image must be 15 MB or smaller.') }} mapImage={null} onChange={(v) => got.push(v)} />)
  pick(png())
  assert.match((await screen.findByRole('alert')).textContent, /15 MB/)
  assert.deepEqual(got, [])
})

test('MapImageUpload: with an image, it offers replace and remove (null)', () => {
  const got = []
  render(<MapImageUpload noun="room image" upload={async () => null} mapImage={{ key: 'k' }} onChange={(v) => got.push(v)} />)
  assert.ok(screen.getByText(/Replace room image/))
  fireEvent.click(screen.getByRole('button', { name: 'Remove room image' }))
  assert.deepEqual(got, [null])
})
