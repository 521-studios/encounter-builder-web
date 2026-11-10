import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import RoomView from './RoomView.jsx'

afterEach(() => cleanup())

const chapterImg = { key: 'maps/c/ch/a.png', url: '/maps/c/ch/a.png', width: 1000, height: 800, rotation: 0, scale: 1 }
const chapter = { id: 'ch', map_image: chapterImg, map_positions: { e1: { x: 100, y: 200 } } }
const region = { x: 100, y: 100, w: 400, h: 200 }

test('RoomView: crops the chapter map to the padded region', () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} onChange={() => {}} />)
  const svg = screen.getByRole('img', { name: 'Room on the chapter map' })
  assert.equal(svg.getAttribute('viewBox'), '0 0 600 400') // padded by 100 (a quarter of 400) each side
  assert.equal(svg.querySelector('image').getAttribute('href'), '/maps/c/ch/a.png')
  assert.ok(screen.getByRole('button', { name: 'Change area on chapter map' }))
})

test("RoomView: the encounter's own image wins over the crop, and hides the area controls", () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region, map_image: { key: 'k', url: '/k.png', width: 1, height: 1 } }} chapter={chapter} onChange={() => {}} />)
  assert.equal(screen.getByRole('img', { name: 'Room map' }).getAttribute('src'), '/k.png')
  assert.equal(screen.queryByRole('button', { name: /area on chapter map/ }), null)
  assert.ok(screen.getByRole('button', { name: 'Remove room image' }))
})

test('RoomView: hints when there is nothing to show', () => {
  const { rerender } = render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={null} onChange={() => {}} />)
  assert.ok(screen.getByText(/Put this encounter in a chapter/))
  rerender(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={{ id: 'ch' }} onChange={() => {}} />)
  assert.ok(screen.getByText(/Upload a map image on the chapter/))
  rerender(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={() => {}} />)
  assert.ok(screen.getByText(/No area set yet/))
})

test("RoomView: the picker shows the whole map with this room's card outlined; cancel returns", () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark area on chapter map' }))
  const picker = screen.getByTestId('room-picker')
  assert.equal(picker.getAttribute('viewBox'), '0 0 1000 800')
  const card = picker.querySelector('.room-card-outline')
  assert.deepEqual([card.getAttribute('x'), card.getAttribute('y')], ['100', '200'])
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  assert.equal(screen.queryByTestId('room-picker'), null)
})

test('RoomView: clear area sends null; released is read-only', () => {
  const calls = []
  const { rerender } = render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} onChange={(p) => calls.push(p)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Clear area' }))
  assert.deepEqual(calls, [{ map_region: null }])
  rerender(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} released onChange={() => {}} />)
  assert.equal(screen.queryByRole('button'), null)
})
