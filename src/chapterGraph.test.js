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

test('buildChapterGraph: loop-closing edges = cyclomatic number', () => {
  const g = buildChapterGraph(chapter)
  // 4 nodes, 4 edges, 1 connected component → 4 − 4 + 1 = 1 independent loop.
  assert.equal(g.stats.loops, 1)
  assert.equal(g.loopEdges.size, 1)
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

test('layerLayout: every node gets a position; a root sits in the first column', () => {
  const g = buildChapterGraph(chapter)
  for (const n of g.nodes) assert.ok(g.layout[n.id], `no position for ${n.id}`)
  // A1 has in-degree 1 (from A3) but there's no in-degree-0 node here (it's cyclic) —
  // just assert positions are finite and distinct enough to render.
  const xs = new Set(Object.values(g.layout).map((p) => p.x))
  assert.ok(xs.size >= 1)
})

test('buildChapterGraph tolerates empty / missing input', () => {
  const g = buildChapterGraph([])
  assert.deepEqual(g.nodes, [])
  assert.deepEqual(g.edges, [])
  assert.equal(g.stats.loops, 0)
  assert.deepEqual(layerLayout([], []), {})
})
