import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChapterGraph, layerLayout, connectedComponents, shelfPack } from './chapterGraph.js'

// A1↔A2↔A3↔A1 form a loop; A4 hangs off A1 as a spur (dead-end). One exit is
// external (no target) and one is dangling (target not in the chapter) — neither
// should become an edge.
const chapter = [
  { id: 1, name: 'A1', room_type: 'combat', exits: [{ to_encounter_id: '2', label: 'door' }, { to_encounter_id: '4' }, { label: 'Exterior' }] },
  { id: 2, name: 'A2', room_type: 'hazard', exits: [{ to_encounter_id: '3' }] },
  { id: 3, name: 'A3', room_type: 'combat', exits: [{ to_encounter_id: '1' }, { to_encounter_id: '999' }] }, // 999 dangling
  { id: 4, name: 'A4', room_type: 'knowledge', exits: [] },
]

test('buildChapterGraph: nodes + intra-chapter edges only (external/dangling/self dropped)', () => {
  const g = buildChapterGraph(chapter)
  assert.equal(g.nodes.length, 4)
  // 4 real intra-chapter edges: 1→2, 1→4, 2→3, 3→1. External + dangling(999) excluded.
  assert.equal(g.edges.length, 4)
  assert.ok(g.edges.some((e) => e.from === '1' && e.to === '2' && e.label === 'door'))
  assert.ok(!g.edges.some((e) => e.to === '999')) // dangling target not drawn
  assert.equal(g.nodes.find((n) => n.id === '2').roomType, 'hazard')
})

test('buildChapterGraph: dead-ends are rooms with ≤1 connection', () => {
  const g = buildChapterGraph(chapter)
  assert.ok(g.deadEnds.has('4')) // spur off A1
  assert.ok(!g.deadEnds.has('1')) // A1 has 3 connections
  assert.ok(!g.deadEnds.has('2')) // A2 in the loop
})

test('buildChapterGraph: loop count = cyclomatic number; loop edges tagged', () => {
  const g = buildChapterGraph(chapter)
  // 4 rooms, 4 distinct passages, 1 component → 4 − 4 + 1 = 1 independent loop.
  assert.equal(g.stats.loops, 1)
  assert.equal(g.edges.filter((e) => e.isLoop).length, 1)
})

test('buildChapterGraph: two-way doors are NOT loops, and a corridor has dead-ends', () => {
  // A↔B↔C, every door authored both directions (the natural GM pattern). This is a
  // linear corridor with ZERO real loops; A and C are the termini (dead-ends).
  const corridor = [
    { id: 1, name: 'A', exits: [{ to_encounter_id: '2' }] },
    { id: 2, name: 'B', exits: [{ to_encounter_id: '1' }, { to_encounter_id: '3' }] },
    { id: 3, name: 'C', exits: [{ to_encounter_id: '2' }] },
  ]
  const g = buildChapterGraph(corridor)
  assert.equal(g.stats.loops, 0) // reciprocal edges collapse — no false loop
  assert.equal(g.stats.connections, 2) // 2 distinct passages (A-B, B-C), not 4 records
  assert.deepEqual([...g.deadEnds].sort(), ['1', '3']) // A and C, by distinct-neighbour count
})

test('buildChapterGraph: a duplicate exit does not invent a loop', () => {
  const dup = [
    { id: 1, name: 'A', exits: [{ to_encounter_id: '2' }, { to_encounter_id: '2' }] }, // A→B twice
    { id: 2, name: 'B', exits: [] },
  ]
  const g = buildChapterGraph(dup)
  assert.equal(g.stats.loops, 0)
  assert.equal(g.stats.connections, 1)
})

test('buildChapterGraph: a pure tree (no cycles) reports zero loops', () => {
  const tree = [
    { id: 1, name: 'R', exits: [{ to_encounter_id: '2' }, { to_encounter_id: '3' }] },
    { id: 2, name: 'L1', exits: [] },
    { id: 3, name: 'L2', exits: [] },
  ]
  const g = buildChapterGraph(tree)
  assert.equal(g.stats.loops, 0)
  assert.ok(g.deadEnds.has('2') && g.deadEnds.has('3'))
})

test('layerLayout: every node gets a position, laid out in BFS columns', () => {
  const g = buildChapterGraph(chapter)
  const pos = layerLayout(g.nodes, g.edges)
  for (const n of g.nodes) assert.ok(pos[n.id], `no position for ${n.id}`)
  const xs = new Set(Object.values(pos).map((p) => p.x))
  assert.ok(xs.size >= 1) // one or more columns
})

test('forceLayout (the map layout): finite, BOUNDED positions + deterministic across runs', () => {
  const g1 = buildChapterGraph(chapter)
  // Per-component layout + shelf packing keeps the whole map within a modest
  // multiple of N·(edge length + node size) — no disconnected piece can balloon to
  // infinity (each is held by its own springs, packed by box). Bound loosely but
  // finitely so a regression that lets a component drift still fails here.
  const bound = g1.nodes.length * (190 + 132) + 500
  for (const n of g1.nodes) {
    const p = g1.layout[n.id]
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `bad position for ${n.id}`)
    assert.ok(p.x >= 0 && p.y >= 0 && p.x <= bound && p.y <= bound, `unbounded position for ${n.id}: ${JSON.stringify(p)}`)
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
  const comps = connectedComponents(g.nodes, g.edges).map((c) => c.map((n) => n.id))
  // 1↔2, 3↔4, and lone 5 — three components, membership by connectivity.
  assert.equal(comps.length, 3)
  assert.deepEqual(comps.map((c) => [...c].sort()), [['1', '2'], ['3', '4'], ['5']])
})

test('shelfPack: wraps to a new shelf and never overlaps components', () => {
  // Six equal boxes wide enough that the √area target width forces a wrap — a real
  // 2-D pack, not a single row. Each box is one node so its position IS its corner.
  const box = (id, w, h) => ({ pos: { [id]: { x: 0, y: 0 } }, minx: 0, miny: 0, w, h })
  const boxes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => box(id, 200, 100))
  const out = shelfPack(boxes, { gap: 48, margin: 24 })

  assert.equal(Object.keys(out).length, 6) // all placed
  const ys = new Set(Object.values(out).map((p) => p.y))
  assert.ok(ys.size >= 2, 'expected the pack to wrap to at least a second shelf')

  // No two placed boxes overlap (rects are w×h at their placed top-left corner).
  const rects = boxes.map((b) => {
    const id = Object.keys(b.pos)[0]
    return { x: out[id].x, y: out[id].y, w: b.w, h: b.h }
  })
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i]
      const B = rects[j]
      const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h
      assert.ok(!overlap, `boxes ${i} and ${j} overlap: ${JSON.stringify(A)} vs ${JSON.stringify(B)}`)
    }
  }
})

test('forceLayout: a multi-component layout is deterministic across runs', () => {
  // The packing pass must be stable (no RNG anywhere) so the map doesn't jitter.
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

test('layerLayout: disconnected components + an isolated node all get positions', () => {
  const g = buildChapterGraph(disjoint)
  for (const n of g.nodes) {
    const p = g.layout[n.id]
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `bad position for ${n.id}`)
  }
  assert.equal(g.stats.loops, 0)
  assert.ok(g.deadEnds.has('5')) // isolated node is a dead-end (0 neighbours)
})

test('buildChapterGraph tolerates empty / missing input', () => {
  const g = buildChapterGraph([])
  assert.deepEqual(g.nodes, [])
  assert.deepEqual(g.edges, [])
  assert.equal(g.stats.loops, 0)
  assert.deepEqual(layerLayout([], []), {})
})
