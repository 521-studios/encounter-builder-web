import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChapterGraph, layerLayout, connectedComponents, shelfPack, pairKey, boundaryPoint } from './chapterGraph.js'

// A1→A2→A3→A1→A4 (all one-directional). One exit is external (no target) and one is
// dangling (target not in the chapter) — both become boundary exit ports, not passages.
const chapter = [
  { id: 1, name: 'A1', room_type: 'combat', exits: [{ to_encounter_id: '2', label: 'door' }, { to_encounter_id: '4' }, { label: 'Exterior' }] },
  { id: 2, name: 'A2', room_type: 'hazard', exits: [{ to_encounter_id: '3' }] },
  { id: 3, name: 'A3', room_type: 'combat', exits: [{ to_encounter_id: '1' }, { to_encounter_id: '999' }] }, // 999 dangling
  { id: 4, name: 'A4', room_type: 'knowledge', exits: [] },
]
// Undirected passage between the current source/target of a passage `p`.
const passageBetween = (g, a, b) => g.passages.find((p) => pairKey(p.source, p.target) === pairKey(a, b))

test('buildChapterGraph: rooms + intra passages; external/dangling exits become boundary ports', () => {
  const g = buildChapterGraph(chapter)
  assert.equal(g.nodes.length, 4)
  assert.equal(g.passages.length, 4) // 1-2, 1-4, 2-3, 3-1
  const p12 = passageBetween(g, '1', '2')
  assert.equal(p12.source, '1') // authored direction
  assert.equal(p12.sourceLabel, 'door')
  // The "Exterior" (no target) + the dangling 999 → 2 boundary exit ports, not passages.
  assert.equal(g.exitPorts.length, 2)
  assert.equal(g.exitEdges.length, 2)
  assert.ok(!g.passages.some((p) => p.source === '999' || p.target === '999'))
  assert.equal(g.stats.exits, 2)
  assert.equal(g.nodes.find((n) => n.id === '2').roomType, 'hazard')
})

test('buildChapterGraph: dead-ends are rooms with ≤1 connected room', () => {
  const g = buildChapterGraph(chapter)
  assert.ok(g.deadEnds.has('4')) // spur off A1 (boundary exits don't count)
  assert.ok(!g.deadEnds.has('1')) // A1 connects to 3 rooms
  assert.ok(!g.deadEnds.has('2'))
})

test('buildChapterGraph: one-way vs two-way passages (driven by reciprocity)', () => {
  // A→B one-way (only A links it); B↔C two-way (both link it).
  const g = buildChapterGraph([
    { id: 1, name: 'A', exits: [{ to_encounter_id: '2', label: 'drop' }] },
    { id: 2, name: 'B', exits: [{ to_encounter_id: '3', label: 'arch' }] },
    { id: 3, name: 'C', exits: [{ to_encounter_id: '2', label: 'arch' }] },
  ])
  const ab = passageBetween(g, '1', '2')
  assert.equal(ab.twoWay, false)
  assert.equal(ab.source, '1') // arrow points the authored way, A→B
  assert.equal(ab.target, '2')
  assert.equal(ab.sourceLabel, 'drop')
  assert.equal(ab.targetLabel, '') // no reverse exit → no label at the B end

  const bc = passageBetween(g, '2', '3')
  assert.equal(bc.twoWay, true) // both 2→3 and 3→2 authored
  // each direction keeps its own label near its own end (so they don't overlap)
  assert.equal(bc.sourceLabel, 'arch')
  assert.equal(bc.targetLabel, 'arch')
})

test('buildChapterGraph: reciprocal doors collapse to one two-way passage; corridor has dead-ends', () => {
  const corridor = [
    { id: 1, name: 'A', exits: [{ to_encounter_id: '2' }] },
    { id: 2, name: 'B', exits: [{ to_encounter_id: '1' }, { to_encounter_id: '3' }] },
    { id: 3, name: 'C', exits: [{ to_encounter_id: '2' }] },
  ]
  const g = buildChapterGraph(corridor)
  assert.equal(g.passages.length, 2) // A-B, B-C — one passage per door, not 4 records
  assert.ok(g.passages.every((p) => p.twoWay))
  assert.equal(g.stats.connections, 2)
  assert.deepEqual([...g.deadEnds].sort(), ['1', '3']) // A and C
})

test('buildChapterGraph: a self-exit and an empty exit are dropped (no passage, no port)', () => {
  const g = buildChapterGraph([{ id: 1, name: 'A', exits: [{ to_encounter_id: '1' }, {}] }]) // self-ref + empty
  assert.equal(g.passages.length, 0)
  assert.equal(g.exitPorts.length, 0)
})

test('boundaryPoint: crosses the box edge nearest the incoming direction; centre on coincidence', () => {
  // Horizontal approach → crosses the vertical (hw) edge.
  assert.deepEqual(boundaryPoint({ x: 0, y: 50 }, { x: 100, y: 50, hw: 10, hh: 20 }), { x: 90, y: 50 })
  // Vertical approach → crosses the horizontal (hh) edge.
  assert.deepEqual(boundaryPoint({ x: 50, y: 0 }, { x: 50, y: 100, hw: 40, hh: 10 }), { x: 50, y: 90 })
  // 45° into a square → the corner (both scales equal).
  assert.deepEqual(boundaryPoint({ x: 0, y: 0 }, { x: 100, y: 100, hw: 10, hh: 10 }), { x: 90, y: 90 })
  // `from` at the centre → the centre (no direction).
  assert.deepEqual(boundaryPoint({ x: 50, y: 50 }, { x: 50, y: 50, hw: 10, hh: 10 }), { x: 50, y: 50 })
})

test('buildChapterGraph: a duplicate exit does not invent a second passage', () => {
  const dup = [
    { id: 1, name: 'A', exits: [{ to_encounter_id: '2' }, { to_encounter_id: '2' }] }, // A→B twice
    { id: 2, name: 'B', exits: [] },
  ]
  const g = buildChapterGraph(dup)
  assert.equal(g.passages.length, 1)
  assert.equal(g.stats.connections, 1)
})

test('buildChapterGraph: a per-direction secret flag rides on the passage', () => {
  // Secret from the hallway (1) but obvious from the room (2).
  const g = buildChapterGraph([
    { id: 1, name: 'Hall', exits: [{ to_encounter_id: '2', secret: true }] },
    { id: 2, name: 'Room', exits: [{ to_encounter_id: '1' }] },
  ])
  const p = passageBetween(g, '1', '2')
  assert.equal(p.twoWay, true)
  const hallSide = p.source === '1' ? p.sourceSecret : p.targetSecret
  const roomSide = p.source === '1' ? p.targetSecret : p.sourceSecret
  assert.equal(hallSide, true) // secret from the hallway
  assert.equal(roomSide, false) // obvious from the room
})

test('layerLayout: every node gets a position, laid out in BFS columns', () => {
  const g = buildChapterGraph(chapter)
  const edges = g.passages.map((p) => ({ from: p.source, to: p.target }))
  const pos = layerLayout(g.nodes, edges)
  for (const n of g.nodes) assert.ok(pos[n.id], `no position for ${n.id}`)
  assert.ok(new Set(Object.values(pos).map((p) => p.x)).size >= 1)
})

test('forceLayout (the map layout): finite, BOUNDED positions + deterministic across runs', () => {
  const g1 = buildChapterGraph(chapter)
  // The layout now covers rooms + exit ports; bound loosely off the total placed count.
  const bound = Object.keys(g1.layout).length * (190 + 132) + 500
  for (const id of Object.keys(g1.layout)) {
    const p = g1.layout[id]
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `bad position for ${id}`)
    assert.ok(p.x >= 0 && p.y >= 0 && p.x <= bound && p.y <= bound, `unbounded position for ${id}: ${JSON.stringify(p)}`)
  }
  // No RNG → identical layout for identical input, so the map doesn't jitter on re-render.
  assert.deepEqual(buildChapterGraph(chapter).layout, g1.layout)
})

test('forceLayout: a single node lays out at the origin margin', () => {
  const g = buildChapterGraph([{ id: 1, name: 'Solo', exits: [] }])
  assert.deepEqual(g.layout['1'], { x: 24, y: 24 })
})

test('connectedComponents: splits a disjoint graph into first-seen-order components', () => {
  const g = buildChapterGraph(disjoint)
  const edges = g.passages.map((p) => ({ from: p.source, to: p.target }))
  const comps = connectedComponents(g.nodes, edges).map((c) => c.map((n) => n.id))
  assert.equal(comps.length, 3)
  assert.deepEqual(comps.map((c) => [...c].sort()), [['1', '2'], ['3', '4'], ['5']])
})

test('shelfPack: wraps to a new shelf and never overlaps components', () => {
  const box = (id, w, h) => ({ pos: { [id]: { x: 0, y: 0 } }, minx: 0, miny: 0, w, h })
  const boxes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => box(id, 200, 100))
  const out = shelfPack(boxes, { gap: 48, margin: 24 })
  assert.equal(Object.keys(out).length, 6)
  assert.ok(new Set(Object.values(out).map((p) => p.y)).size >= 2, 'expected a wrap to a second shelf')
  const rects = boxes.map((b) => {
    const id = Object.keys(b.pos)[0]
    return { x: out[id].x, y: out[id].y, w: b.w, h: b.h }
  })
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i]
      const B = rects[j]
      const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h
      assert.ok(!overlap, `boxes ${i} and ${j} overlap`)
    }
  }
})

test('forceLayout: a multi-component layout is deterministic across runs', () => {
  assert.deepEqual(buildChapterGraph(disjoint).layout, buildChapterGraph(disjoint).layout)
})

// Two disjoint pairs (1↔2, 3↔4) and a lone node (5) with no exits — three components.
const disjoint = [
  { id: 1, name: 'A', exits: [{ to_encounter_id: '2' }] },
  { id: 2, name: 'B', exits: [] },
  { id: 3, name: 'C', exits: [{ to_encounter_id: '4' }] },
  { id: 4, name: 'D', exits: [] },
  { id: 5, name: 'Lone', exits: [] },
]

test('buildChapterGraph: disconnected components + an isolated node all get positions', () => {
  const g = buildChapterGraph(disjoint)
  for (const n of g.nodes) {
    const p = g.layout[n.id]
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `bad position for ${n.id}`)
  }
  assert.ok(g.deadEnds.has('5')) // isolated node is a dead-end (0 neighbours)
})

test('buildChapterGraph tolerates empty / missing input', () => {
  const g = buildChapterGraph([])
  assert.deepEqual(g.nodes, [])
  assert.deepEqual(g.passages, [])
  assert.deepEqual(g.exitPorts, [])
  assert.equal(g.stats.connections, 0)
  assert.deepEqual(layerLayout([], []), {})
})
