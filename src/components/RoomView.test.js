import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import RoomView from './RoomView.jsx'
import { setAnon } from '../api/anon.js'

afterEach(() => {
  cleanup()
  setAnon(false)
})

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

test('RoomView: clear area sends null; released is read-only but still navigable', () => {
  const calls = []
  const { rerender } = render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} onChange={(p) => calls.push(p)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Clear area' }))
  assert.deepEqual(calls, [{ map_region: null }])
  rerender(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} released onChange={() => {}} />)
  assert.deepEqual(screen.getAllByRole('button').map((b) => b.textContent), ['Open chapter map'])
  assert.equal(screen.queryByLabelText(/room image/), null)
})

test("RoomView: the crop draws the image at the chapter's rotation and scale", () => {
  const turned = { ...chapter, map_image: { ...chapterImg, rotation: 90, scale: 0.5 } }
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={turned} onChange={() => {}} />)
  const image = screen.getByRole('img', { name: 'Room on the chapter map' }).querySelector('image')
  assert.deepEqual([image.getAttribute('width'), image.getAttribute('height')], ['500', '400'])
  assert.equal(image.getAttribute('transform'), 'rotate(90 250 200)')
})

test('RoomView: no room image upload in anonymous mode', () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={() => {}} />)
  assert.ok(screen.getByLabelText(/Upload room image/))
  cleanup()
  setAnon(true)
  render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={() => {}} />)
  assert.equal(screen.queryByLabelText(/Upload room image/), null)
  assert.ok(screen.getByRole('button', { name: 'Mark area on chapter map' })) // the area itself still works locally
})

// jsdom has no SVG screen matrix: map client coordinates 1:1 so the drag can be driven.
function identityScreen(svg) {
  svg.getScreenCTM = () => ({ inverse: () => ({}) })
  svg.setPointerCapture = () => {}
}

test('RoomView: dragging a box on the picker saves it as map_region; a bare click saves nothing', () => {
  const realPoint = globalThis.DOMPoint
  globalThis.DOMPoint = class {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
    matrixTransform() {
      return { x: this.x, y: this.y }
    }
  }
  try {
    const calls = []
    render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={(p) => calls.push(p)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark area on chapter map' }))
    let svg = screen.getByTestId('room-picker')
    identityScreen(svg)
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 301, clientY: 300, pointerId: 1 })
    assert.deepEqual(calls, []) // too small to be a box; the picker stays open
    svg = screen.getByTestId('room-picker')
    fireEvent.pointerDown(svg, { clientX: 600.4, clientY: 300, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 100, pointerId: 1 })
    assert.deepEqual(calls, [{ map_region: { x: 200, y: 100, w: 400, h: 200 } }])
    assert.equal(screen.queryByTestId('room-picker'), null) // a pick closes the picker
  } finally {
    globalThis.DOMPoint = realPoint
  }
})

test('RoomView: connected rooms open their encounter; Open chapter map opens the chapter (muz0.8)', () => {
  const opened = []
  const chapters = []
  const withNeighbour = { ...chapter, map_positions: { ...chapter.map_positions, n1: { x: 300, y: 150 } } }
  const neighbours = [
    { id: 'n1', name: 'A2', label: 'door' },
    { id: 'n2', name: 'A3', label: '' },
  ]
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={withNeighbour} neighbours={neighbours} onOpenEncounter={(id) => opened.push(id)} onOpenChapter={(ch) => chapters.push(ch.id)} onChange={() => {}} />)
  const nav = screen.getByRole('navigation', { name: 'Connected rooms' })
  fireEvent.click(within(nav).getByRole('button', { name: 'A2 (door)' }))
  fireEvent.click(within(nav).getByRole('button', { name: 'A3' }))
  fireEvent.click(within(nav).getByRole('button', { name: 'Open chapter map' }))
  assert.deepEqual(opened, ['n1', 'n2'])
  assert.deepEqual(chapters, ['ch'])
  // Only the neighbour with a map position gets a card on the crop, and it opens too.
  const cards = screen.getByRole('img', { name: 'Room on the chapter map' }).querySelectorAll('.room-neighbour')
  assert.equal(cards.length, 1)
  assert.deepEqual([cards[0].querySelector('rect').getAttribute('x'), cards[0].querySelector('rect').getAttribute('y')], ['300', '150'])
  fireEvent.click(cards[0])
  assert.deepEqual(opened, ['n1', 'n2', 'n1'])
})

test('RoomView: no navigation when there are no neighbours and no chapter', () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={null} neighbours={[]} onOpenEncounter={() => {}} onOpenChapter={() => {}} onChange={() => {}} />)
  assert.equal(screen.queryByRole('navigation', { name: 'Connected rooms' }), null)
})

test('RoomView: the area can be typed (keyboard path), seeded from the current region (qcm5)', () => {
  const calls = []
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} onChange={(p) => calls.push(p)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Change area on chapter map' }))
  assert.equal(screen.getByLabelText('Width').value, '400')
  fireEvent.change(screen.getByLabelText('X'), { target: { value: '120.6' } })
  fireEvent.change(screen.getByLabelText('Height'), { target: { value: '2' } })
  assert.equal(screen.getByRole('button', { name: 'Save area' }).disabled, true) // under 4px
  fireEvent.change(screen.getByLabelText('Height'), { target: { value: '' } })
  assert.equal(screen.getByRole('button', { name: 'Save area' }).disabled, true) // blank
  fireEvent.change(screen.getByLabelText('Height'), { target: { value: '250' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save area' }))
  assert.deepEqual(calls, [{ map_region: { x: 121, y: 100, w: 400, h: 250 } }])
  assert.equal(screen.queryByTestId('room-picker'), null)
})

test('RoomView: a new area is seeded from the room card on the chapter map (qcm5)', () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark area on chapter map' }))
  assert.deepEqual(['X', 'Y', 'Width', 'Height'].map((l) => screen.getByLabelText(l).value), ['100', '200', '132', '46'])
})

test('RoomView: a pointer cancel mid-drag saves nothing, even if an up lands far away (qcm5)', () => {
  const realPoint = globalThis.DOMPoint
  globalThis.DOMPoint = class {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
    matrixTransform() {
      return { x: this.x, y: this.y }
    }
  }
  try {
    const calls = []
    render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={chapter} onChange={(p) => calls.push(p)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark area on chapter map' }))
    const svg = screen.getByTestId('room-picker')
    identityScreen(svg)
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerCancel(svg, { pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 600, clientY: 500, pointerId: 1 })
    assert.deepEqual(calls, [])
  } finally {
    globalThis.DOMPoint = realPoint
  }
})

test('RoomView: a broken room image or chapter map image says so (qcm5)', () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_image: { url: '/maps/gone.png' } }} chapter={chapter} onChange={() => {}} />)
  assert.equal(screen.queryByRole('alert'), null)
  fireEvent.error(screen.getByRole('img', { name: 'Room map' }))
  assert.match(screen.getByRole('alert').textContent, /Couldn't load the map image/)
  fireEvent.load(screen.getByRole('img', { name: 'Room map' })) // recovered (e.g. a retry)
  assert.equal(screen.queryByRole('alert'), null)
  cleanup()
  render(<RoomView campaignId="c" enc={{ id: 'e1', map_region: region }} chapter={chapter} onChange={() => {}} />)
  fireEvent.error(screen.getByRole('img', { name: 'Room on the chapter map' }).querySelector('image'))
  assert.match(screen.getByRole('alert').textContent, /Couldn't load the map image/)
})

test('RoomView: an unsorted encounter with exits shows its connected rooms but no chapter link', () => {
  render(<RoomView campaignId="c" enc={{ id: 'e1' }} chapter={null} neighbours={[{ id: 'n1', name: 'A2', label: '' }]} onOpenEncounter={() => {}} onOpenChapter={() => {}} onChange={() => {}} />)
  const nav = screen.getByRole('navigation', { name: 'Connected rooms' })
  assert.ok(within(nav).getByRole('button', { name: 'A2' }))
  assert.equal(within(nav).queryByRole('button', { name: 'Open chapter map' }), null)
})
