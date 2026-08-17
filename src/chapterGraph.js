// Pure node-link graph for a chapter's connectivity map (8hda). Turns the chapter's
// encounters + their 3qq7 exits into nodes, intra-chapter directed edges, a
// dependency-free FORCE-DIRECTED layout (forceLayout; layerLayout kept for
// reference), and the Jaquays signals (dead-ends + loops). Kept pure/testable;
// ChapterMap renders the SVG from this.

// Only exits pointing at another encounter IN this chapter become drawn edges;
// external / cross-chapter exits are authored on the encounter but not plotted here
// (they'd point off the chapter map). Ids are coerced to strings for matching
// (encounter ids are numeric; exit.to_encounter_id is stored as a string).
export function buildChapterGraph(encounters) {
  const list = encounters || []
  const nodeIds = new Set(list.map((e) => String(e.id)))
  const nodes = list.map((e) => ({ id: String(e.id), name: e.name || 'Untitled', roomType: e.room_type || 'combat' }))

  const edges = []
  for (const e of list) {
    for (const ex of e.exits || []) {
      const to = String(ex.to_encounter_id || '')
      if (to && to !== String(e.id) && nodeIds.has(to)) {
        edges.push({ from: String(e.id), to, label: ex.label || '' })
      }
    }
  }

  // Collapse reciprocal / duplicate directed exits to a DISTINCT UNDIRECTED
  // adjacency before analysis. Exits are authored one-directionally and not
  // auto-mirrored, so a two-way door is two records (A→B + B→A) and a corridor is a
  // chain of them — but both Jaquays signals are about distinct *passages*, not
  // authored records. Counting the multiset makes a plain corridor look full of
  // loops and never flags its termini as dead-ends (the inverse of the truth).
  const neighbors = Object.fromEntries(nodes.map((n) => [n.id, new Set()]))
  const undirected = new Map() // canonical "a|b" -> [a, b]
  for (const e of edges) {
    neighbors[e.from].add(e.to)
    neighbors[e.to].add(e.from)
    undirected.set(pairKey(e.from, e.to), [e.from, e.to])
  }

  // A dead-end connects to at most one OTHER room (only way out is back) — the
  // opposite of the loops Jaquays prized. Isolated (0-neighbor) rooms count too.
  const deadEnds = new Set(nodes.filter((n) => neighbors[n.id].size <= 1).map((n) => n.id))

  // Loop-closing passages via union-find over the undirected simple graph: a passage
  // whose endpoints are already connected closes a cycle. Their count is the
  // cyclomatic number (E − V + components) — the real independent-loop count. Each
  // drawn edge is tagged isLoop when its passage closes a loop (so the map highlights it).
  const loopPairs = markLoopPairs(nodes, [...undirected.values()])
  for (const e of edges) e.isLoop = loopPairs.has(pairKey(e.from, e.to))

  const layout = forceLayout(nodes, edges)
  const stats = { rooms: nodes.length, connections: undirected.size, loops: loopPairs.size }
  return { nodes, edges, layout, deadEnds, stats }
}

// Canonical undirected key for a node pair (order-independent).
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// Union-find over undirected passages → the set of canonical keys that close a loop.
function markLoopPairs(nodes, pairs) {
  const parent = Object.fromEntries(nodes.map((n) => [n.id, n.id]))
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const loops = new Set()
  for (const [a, b] of pairs) {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) loops.add(pairKey(a, b))
    else parent[ra] = rb
  }
  return loops
}

// Dependency-free layered layout: BFS distance from each component's roots (lowest
// in-degree first) sets the column; position within a column sets the row. Good
// enough + legible for dungeon-sized graphs, and deterministic for tests.
const DX = 170
const DY = 92
export function layerLayout(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    adj.get(e.from).push(e.to)
    adj.get(e.to).push(e.from)
  }
  const inDeg = Object.fromEntries(nodes.map((n) => [n.id, 0]))
  for (const e of edges) inDeg[e.to]++

  const layer = new Map()
  const seen = new Set()
  // Roots first (in-degree 0), then remaining nodes, preserving input order — so a
  // fully-cyclic component still gets a deterministic start.
  const order = [...nodes].sort((a, b) => inDeg[a.id] - inDeg[b.id])
  for (const start of order) {
    if (seen.has(start.id)) continue
    layer.set(start.id, 0)
    seen.add(start.id)
    const q = [start.id]
    while (q.length) {
      const u = q.shift()
      for (const v of adj.get(u)) {
        if (!seen.has(v)) {
          seen.add(v)
          layer.set(v, layer.get(u) + 1)
          q.push(v)
        }
      }
    }
  }

  const byLayer = new Map()
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l).push(n.id)
  }
  const pos = {}
  for (const [l, ids] of byLayer) {
    ids.forEach((id, i) => {
      pos[id] = { x: l * DX + 24, y: i * DY + 24 }
    })
  }
  return pos
}

// Force-directed layout (Fruchterman–Reingold): nodes repel (spread apart), edges
// pull like springs, and a cooling schedule settles it. Dense subgraphs cluster and
// separate on their own — far more legible than the rigid layered grid at dungeon
// scale (a 25-room map with many cross-links). Dependency-free and DETERMINISTIC:
// a golden-angle spiral seeds initial positions (no RNG), so the same graph always
// lays out the same way (stable across renders + testable). Returns the same
// {id: {x, y}} top-left-corner shape as layerLayout, so the renderer is unchanged.
const NODE_W = 132
const NODE_H = 46
export function forceLayout(nodes, edges, { iterations = 400 } = {}) {
  const N = nodes.length
  if (N === 0) return {}
  if (N === 1) return { [nodes[0].id]: { x: 24, y: 24 } }

  const area = N * 60000 // ~ (node + gap)² per node, so k > node diagonal → little overlap
  const side = Math.sqrt(area)
  const k = Math.sqrt(area / N) // ideal edge length
  const GA = Math.PI * (3 - Math.sqrt(5)) // golden angle — deterministic, symmetry-breaking seed
  const pos = {}
  nodes.forEach((n, i) => {
    const r = k * Math.sqrt(i + 0.5)
    const a = i * GA
    pos[n.id] = { x: side / 2 + r * Math.cos(a), y: side / 2 + r * Math.sin(a) }
  })

  // Undirected, de-duplicated springs (a two-way door is one spring, not two).
  const springs = []
  const seenPair = new Set()
  for (const e of edges) {
    const key = pairKey(e.from, e.to)
    if (seenPair.has(key)) continue
    seenPair.add(key)
    springs.push([e.from, e.to])
  }
  const ids = nodes.map((n) => n.id)
  let temp = side / 8
  const cool = temp / (iterations + 1)

  for (let it = 0; it < iterations; it++) {
    const disp = {}
    for (const id of ids) disp[id] = { x: 0, y: 0 }
    // Repulsion between every pair (Coulomb: f = k²/d).
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = ids[i]
        const b = ids[j]
        let dx = pos[a].x - pos[b].x
        let dy = pos[a].y - pos[b].y
        const d = Math.hypot(dx, dy) || 0.01
        const f = (k * k) / d
        dx /= d
        dy /= d
        disp[a].x += dx * f
        disp[a].y += dy * f
        disp[b].x -= dx * f
        disp[b].y -= dy * f
      }
    }
    // Attraction along springs (Hooke-ish: f = d²/k).
    for (const [u, v] of springs) {
      let dx = pos[u].x - pos[v].x
      let dy = pos[u].y - pos[v].y
      const d = Math.hypot(dx, dy) || 0.01
      const f = (d * d) / k
      dx /= d
      dy /= d
      disp[u].x -= dx * f
      disp[u].y -= dy * f
      disp[v].x += dx * f
      disp[v].y += dy * f
    }
    // Move each node by its displacement, capped at the current temperature, then
    // CLAMP to the frame — without this the mutual repulsion drifts sparse parts
    // off to infinity (the layout would balloon to tens of thousands of px). A weak
    // centre gravity is a softer alternative but tunes poorly here (its equilibrium
    // spacing k/√g balloons the map), so the frame clamp is the pragmatic bound.
    for (const id of ids) {
      const dd = disp[id]
      const d = Math.hypot(dd.x, dd.y) || 0.01
      pos[id].x = Math.min(side, Math.max(0, pos[id].x + (dd.x / d) * Math.min(d, temp)))
      pos[id].y = Math.min(side, Math.max(0, pos[id].y + (dd.y / d) * Math.min(d, temp)))
    }
    temp = Math.max(temp - cool, k * 0.05)
  }

  // Translate to positive coords with a margin (same top-left convention as
  // layerLayout — a uniform half-node offset from the sim's centres is harmless
  // since every node + edge endpoint shifts together).
  const M = 24
  const minx = Math.min(...ids.map((id) => pos[id].x))
  const miny = Math.min(...ids.map((id) => pos[id].y))
  const out = {}
  for (const id of ids) {
    out[id] = { x: pos[id].x - minx + M, y: pos[id].y - miny + M }
  }
  return out
}
