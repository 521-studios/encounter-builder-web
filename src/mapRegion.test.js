import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageBox, paddedView, dragRect } from './mapRegion.js'

test('imageBox: scales, and a quarter turn swaps the covered box about the centre', () => {
  const img = { width: 400, height: 200 }
  assert.deepEqual(imageBox(img, { rotation: 0, scale: 0.5 }), { w: 200, h: 100, bbox: { x: 0, y: 0, w: 200, h: 100 } })
  assert.deepEqual(imageBox(img, { rotation: 180, scale: 1 }).bbox, { x: 0, y: 0, w: 400, h: 200 })
  assert.deepEqual(imageBox(img, { rotation: 90, scale: 1 }).bbox, { x: 100, y: -100, w: 200, h: 400 })
  assert.deepEqual(imageBox(img, { rotation: 270, scale: 1 }).bbox, { x: 100, y: -100, w: 200, h: 400 })
})

test('paddedView: a quarter of the longer side on every side, at least 40', () => {
  assert.deepEqual(paddedView({ x: 100, y: 50, w: 400, h: 200 }), { x: 0, y: -50, w: 600, h: 400 })
  assert.deepEqual(paddedView({ x: 0, y: 0, w: 20, h: 10 }), { x: -40, y: -40, w: 100, h: 90 })
})

test('dragRect: any corner order, rounded; too small is null', () => {
  assert.deepEqual(dragRect({ x: 10.4, y: 80 }, { x: 60.6, y: 20 }), { x: 10, y: 20, w: 50, h: 60 })
  assert.equal(dragRect({ x: 0, y: 0 }, { x: 3, y: 50 }), null)
  assert.deepEqual(dragRect({ x: 0, y: 0 }, { x: 3, y: 3 }, 0), { x: 0, y: 0, w: 3, h: 3 })
})
