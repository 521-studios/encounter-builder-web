import { test, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ChapterMap, { imageTransform, longPress, LONG_PRESS_MS } from './ChapterMap.jsx'

afterEach(() => cleanup())

// A1→A2→A3→A1→A4, all one-directional (4 one-way passages); A4 is a dead-end spur.
const chapter = [
  { id: 1, name: 'A1', room_type: 'combat', exits: [{ to_encounter_id: '2', label: 'door' }, { to_encounter_id: '4' }] },
  { id: 2, name: 'A2', room_type: 'hazard', exits: [{ to_encounter_id: '3' }] },
  { id: 3, name: 'A3', room_type: 'knowledge', exits: [{ to_encounter_id: '1' }] },
  { id: 4, name: 'A4', room_type: 'empty', exits: [] },
]

// The map is now a React Flow canvas: node/edge layout needs real DOM dimensions
// (absent in jsdom), so the graph structure itself is covered by chapterGraph.test.js.
// Here we assert the component's own chrome: the connectivity stats, the collapse
// toggle, the canvas + legend presence, and the empty state.

test('ChapterMap: the title reports rooms / passages / exits / loops from the graph', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.match(screen.getByText(/Map —/).textContent, /4 rooms · 4 passages · 0 exits · 1 loop/)
})

test('ChapterMap: renders the canvas + one-way/two-way legend when rooms are linked', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.ok(screen.getByTestId('map-canvas'))
  // The legend spells out one-way vs two-way and secret doors.
  assert.match(screen.getByText(/one-way exit/).textContent, /two-way/)
})

test('ChapterMap: the title collapses and expands the canvas', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  const toggle = screen.getByRole('button', { name: /Map —/ })
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.ok(screen.getByTestId('map-canvas'))
  fireEvent.click(toggle)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(screen.queryByTestId('map-canvas'), null) // canvas hidden when collapsed
})

test('ChapterMap: no linked exits shows a hint, not an empty canvas', () => {
  render(<ChapterMap encounters={[{ id: 1, name: 'Lone', exits: [] }]} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByTestId('map-canvas'), null)
  assert.match(screen.getByText(/No exits on these rooms/).textContent, /add Exits/)
})

test('ChapterMap: an empty chapter (no rooms) shows the no-encounters hint', () => {
  render(<ChapterMap encounters={[]} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByTestId('map-canvas'), null)
  assert.match(screen.getByText(/No encounters in this chapter/).textContent, /No encounters/)
})

// muz0.2: the chapter's battle-map image renders behind the graph, with a toggle.
const mapImage = { url: 'https://example.test/maps/a.png', width: 800, height: 600 }

test('ChapterMap: no map image → no image toggle', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} />)
  assert.equal(screen.queryByRole('button', { name: /map image/ }), null)
})

test('ChapterMap: a map image renders behind the graph (even with no exits) and the toggle hides/shows it', () => {
  render(<ChapterMap encounters={[{ id: 1, name: 'Lone', exits: [] }]} onOpenEncounter={() => {}} mapImage={mapImage} />)
  assert.ok(screen.getByTestId('map-canvas'))
  const img = screen.getByAltText('Chapter map')
  assert.equal(img.getAttribute('src'), mapImage.url)
  assert.equal(img.getAttribute('width'), '800')
  assert.equal(img.getAttribute('height'), '600')
  fireEvent.click(screen.getByRole('button', { name: 'Hide map image' }))
  assert.equal(screen.queryByAltText('Chapter map'), null)
  fireEvent.click(screen.getByRole('button', { name: 'Show map image' }))
  assert.ok(screen.getByAltText('Chapter map'))
})

// muz0.3: rotate/scale.
test('imageTransform: defaults, quarter-turn snapping, and scale clamping', () => {
  assert.deepEqual(imageTransform({}), { rotation: 0, scale: 1 })
  assert.deepEqual(imageTransform(null), { rotation: 0, scale: 1 })
  assert.deepEqual(imageTransform({ rotation: 450, scale: 9 }), { rotation: 90, scale: 4 })
  assert.deepEqual(imageTransform({ rotation: -90, scale: 0.01 }), { rotation: 270, scale: 0.1 })
  assert.deepEqual(imageTransform({ rotation: 'x', scale: -1 }), { rotation: 0, scale: 1 })
})

test('ChapterMap: rotate steps a quarter-turn and the scale slider reports the new scale', () => {
  const changes = []
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} mapImage={{ ...mapImage, rotation: 270 }} onMapImageChange={(m) => changes.push(m)} />)
  fireEvent.click(screen.getByRole('button', { name: /Rotate 90° \(270°\)/ }))
  assert.equal(changes[0].rotation, 0) // 270 → 0 wraps
  fireEvent.change(screen.getByLabelText('map image scale'), { target: { value: '150' } })
  assert.equal(changes[1].scale, 1.5)
  assert.equal(changes[1].url, mapImage.url) // the rest of map_image rides along
})

test('ChapterMap: no onMapImageChange → toggle only, no rotate/scale controls', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} mapImage={mapImage} />)
  assert.ok(screen.getByRole('button', { name: 'Hide map image' }))
  assert.equal(screen.queryByRole('button', { name: /Rotate/ }), null)
})

test('ChapterMap: scale resizes the image and rotation spins it', () => {
  render(<ChapterMap encounters={chapter} onOpenEncounter={() => {}} mapImage={{ ...mapImage, rotation: 90, scale: 0.5 }} />)
  const img = screen.getByAltText('Chapter map')
  assert.equal(img.getAttribute('width'), '400')
  assert.equal(img.getAttribute('height'), '300')
  assert.equal(img.style.transform, 'rotate(90deg)')
})

test('longPress: a held touch fires once with its point; mouse, early lift, or a drag do not (xc9v)', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const ref = { current: null }
    const fired = []
    const lp = longPress(ref, (pt) => fired.push(pt))
    const touch = (x, y) => ({ pointerType: 'touch', clientX: x, clientY: y })

    lp.onPointerDown(touch(10, 20))
    lp.onPointerMove(touch(13, 22)) // finger jitter stays a press
    mock.timers.tick(LONG_PRESS_MS)
    assert.deepEqual(fired, [{ clientX: 10, clientY: 20 }])
    lp.onPointerUp()
    mock.timers.tick(LONG_PRESS_MS)
    assert.equal(fired.length, 1) // once per press

    lp.onPointerDown({ ...touch(0, 0), pointerType: 'mouse' }) // mouse keeps double-click
    mock.timers.tick(LONG_PRESS_MS)
    lp.onPointerDown(touch(0, 0))
    lp.onPointerUp() // a tap
    mock.timers.tick(LONG_PRESS_MS)
    lp.onPointerDown(touch(0, 0))
    lp.onPointerMove(touch(30, 0)) // a drag
    mock.timers.tick(LONG_PRESS_MS)
    assert.equal(fired.length, 1)

    // A re-render mid-press makes new handlers on the same ref; lifting still cancels.
    longPress(ref, (pt) => fired.push(pt)).onPointerDown(touch(0, 0))
    longPress(ref, (pt) => fired.push(pt)).onPointerUp()
    mock.timers.tick(LONG_PRESS_MS)
    assert.equal(fired.length, 1)
  } finally {
    mock.timers.reset()
  }
})
