import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChapterGraph, layerLayout } from './chapterGraph.js'

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

test('forceLayout (the map layout): finite positions + deterministic across runs', () => {
  const g1 = buildChapterGraph(chapter)
  for (const n of g1.nodes) {
    const p = g1.layout[n.id]
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0, `bad position for ${n.id}`)
  }
  // No RNG → identical layout for identical input, so the map doesn't jitter on re-render.
  assert.deepEqual(buildChapterGraph(chapter).layout, g1.layout)
})

test('layerLayout: disconnected components + an isolated node all get positions', () => {
  // Two disjoint pairs (1↔2, 3↔4) and a lone node (5) with no exits.
  const disjoint = [
    { id: 1, name: 'A', exits: [{ to_encounter_id: '2' }] },
    { id: 2, name: 'B', exits: [] },
    { id: 3, name: 'C', exits: [{ to_encounter_id: '4' }] },
    { id: 4, name: 'D', exits: [] },
    { id: 5, name: 'Lone', exits: [] },
  ]
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
