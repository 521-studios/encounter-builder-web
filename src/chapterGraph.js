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
  const adj = adjacency(nodes, edges)
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
//
// Each connected component is laid out INDEPENDENTLY, then the components are
// shelf-packed side by side. A dungeon map is usually several disjoint pieces (main
// halls, an island building, a stray unlinked room); simulating them together makes
// all-pairs repulsion shove the pieces into a huge sparse cloud with no springs to
// pull them back (gravity to fix that just crushes each piece). Per-component +
// packing keeps every piece tight and readable with zero dead whitespace between them.
const NODE_W = 132
const NODE_H = 46
const K = 190 // target edge length — > node diagonal (~140) so connected nodes don't overlap
export function forceLayout(nodes, edges, { iterations = 400 } = {}) {
  if (nodes.length === 0) return {}
  // Lay each connected component out on its own, measure its box, then pack.
  const boxes = connectedComponents(nodes, edges).map((comp) => {
    const pos = simulateComponent(comp, edges, iterations)
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
    for (const id in pos) {
      minx = Math.min(minx, pos[id].x); maxx = Math.max(maxx, pos[id].x)
      miny = Math.min(miny, pos[id].y); maxy = Math.max(maxy, pos[id].y)
    }
    return { pos, minx, miny, w: maxx - minx + NODE_W, h: maxy - miny + NODE_H }
  })
  return shelfPack(boxes, { gap: 48, margin: 24 })
}

// Undirected adjacency map (id -> neighbour ids, both directions). Guards against
// dangling endpoints so it's safe for raw edge lists. Shared by the component
// split and layerLayout.
function adjacency(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (adj.has(e.from) && adj.has(e.to)) {
      adj.get(e.from).push(e.to)
      adj.get(e.to).push(e.from)
    }
  }
  return adj
}

// Connected components over the undirected adjacency, as arrays of node objects,
// in first-seen (node) order — deterministic.
export function connectedComponents(nodes, edges) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const adj = adjacency(nodes, edges)
  const seen = new Set()
  const components = []
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    const comp = []
    const q = [n.id]
    seen.add(n.id)
    while (q.length) {
      const u = q.shift()
      comp.push(nodeById.get(u))
      for (const v of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v) }
    }
    components.push(comp)
  }
  return components
}

// Shelf-pack component boxes ({pos, minx, miny, w, h}) into rows, biggest first, so
// the main hall anchors the top-left. Wraps at a target width (√total-area) to keep
// the whole map roughly as wide as it is tall — a balanced, scannable block rather
// than one long strip. Returns the {id: {x, y}} top-left-corner map. Array.sort is
// stable, so equal-area boxes keep their input (node) order → deterministic.
export function shelfPack(boxes, { gap = 48, margin = 24 } = {}) {
  const sorted = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h)
  const totalArea = sorted.reduce((s, c) => s + c.w * c.h, 0)
  const targetW = Math.max(Math.sqrt(totalArea) * 1.3, ...sorted.map((c) => c.w))
  const out = {}
  let shelfX = margin, shelfY = margin, rowH = 0
  for (const comp of sorted) {
    if (shelfX > margin && shelfX + comp.w > margin + targetW) {
      shelfX = margin // wrap to next shelf
      shelfY += rowH + gap
      rowH = 0
    }
    for (const id in comp.pos) {
      out[id] = { x: comp.pos[id].x - comp.minx + shelfX, y: comp.pos[id].y - comp.miny + shelfY }
    }
    shelfX += comp.w + gap
    rowH = Math.max(rowH, comp.h)
  }
  return out
}

// One connected component through Fruchterman–Reingold, seeded on a golden-angle
// spiral (deterministic). No gravity needed: a connected component is held together
// by its own springs, so it settles to a compact equilibrium instead of drifting.
function simulateComponent(comp, edges, iterations) {
  const N = comp.length
  const ids = comp.map((n) => n.id)
  if (N === 1) return { [ids[0]]: { x: 0, y: 0 } }

  const GA = Math.PI * (3 - Math.sqrt(5)) // golden angle — symmetry-breaking seed
  const pos = {}
  comp.forEach((n, i) => {
    const r = K * Math.sqrt(i + 0.5)
    const a = i * GA
    pos[n.id] = { x: r * Math.cos(a), y: r * Math.sin(a) }
  })

  const inComp = new Set(ids)
  const springs = []
  const seenPair = new Set()
  for (const e of edges) {
    if (!inComp.has(e.from) || !inComp.has(e.to)) continue
    const key = pairKey(e.from, e.to)
    if (seenPair.has(key)) continue
    seenPair.add(key)
    springs.push([e.from, e.to])
  }

  let temp = (K * Math.sqrt(N)) / 6
  const cool = temp / (iterations + 1)
  for (let it = 0; it < iterations; it++) {
    const disp = {}
    for (const id of ids) disp[id] = { x: 0, y: 0 }
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = ids[i], b = ids[j]
        let dx = pos[a].x - pos[b].x
        let dy = pos[a].y - pos[b].y
        const d = Math.hypot(dx, dy) || 0.01
        const f = (K * K) / d
        dx /= d; dy /= d
        disp[a].x += dx * f; disp[a].y += dy * f
        disp[b].x -= dx * f; disp[b].y -= dy * f
      }
    }
    for (const [u, v] of springs) {
      let dx = pos[u].x - pos[v].x
      let dy = pos[u].y - pos[v].y
      const d = Math.hypot(dx, dy) || 0.01
      const f = (d * d) / K
      dx /= d; dy /= d
      disp[u].x -= dx * f; disp[u].y -= dy * f
      disp[v].x += dx * f; disp[v].y += dy * f
    }
    for (const id of ids) {
      const dd = disp[id]
      const d = Math.hypot(dd.x, dd.y) || 0.01
      pos[id].x += (dd.x / d) * Math.min(d, temp)
      pos[id].y += (dd.y / d) * Math.min(d, temp)
    }
    temp = Math.max(temp - cool, K * 0.05)
  }
  return pos
}
