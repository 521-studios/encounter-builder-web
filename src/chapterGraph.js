// Pure node-link graph for a chapter's connectivity map (8hda). Turns the chapter's
// encounters + their 3qq7 exits into room nodes, undirected PASSAGES (a passage is
// one-way unless BOTH rooms link it, in which case it's two-way), boundary EXIT PORTS
// for exits that leave the chapter, a dependency-free force-directed layout, and the
// dead-end signal. Kept pure/testable; ChapterMap renders it via React Flow.
//
// Reciprocity drives direction: exits are authored one-directionally, so A→B alone is
// a one-way passage (arrow toward B); A→B + B→A is a two-way passage (plain line).
// Each direction keeps its own label near its source end so a two-way passage's two
// labels don't overlap at the midpoint. Exits pointing outside the chapter (no target,
// or a target not in it) become an exit-port circle hung off the room, so boundary
// exits are visible instead of silently dropped.
export function buildChapterGraph(encounters) {
  const list = encounters || []
  const nodeIds = new Set(list.map((e) => String(e.id)))
  const nodes = list.map((e) => ({ id: String(e.id), name: e.name || 'Untitled', roomType: e.room_type || 'combat', kind: 'room' }))

  // Directed intra-chapter exits keyed for reciprocity lookup; boundary exits → ports.
  const directed = new Map() // "from>to" -> { label, secret }
  const exitPorts = []
  const exitEdges = []
  for (const e of list) {
    const from = String(e.id)
    ;(e.exits || []).forEach((ex, idx) => {
      const to = String(ex.to_encounter_id || '')
      const meta = { label: ex.label || '', secret: !!ex.secret, skill: ex.skill || '', dc: ex.dc || 0 }
      if (to && to !== from && nodeIds.has(to)) {
        directed.set(`${from}>${to}`, meta)
      } else if (to !== from) {
        // Anything that isn't an in-chapter passage or a self-loop is a boundary exit
        // — external, cross-chapter (dangling), OR a blank "— External —" placeholder
        // (no target + no label). All get a port circle so they're visible on the map.
        const portId = `exit:${from}:${idx}`
        exitPorts.push({ id: portId, name: ex.label || 'Exit', kind: 'exit' })
        exitEdges.push({ id: `xe:${from}:${idx}`, source: from, target: portId, ...meta })
      }
    })
  }

  // Collapse the directed exits into undirected passages. One pass per canonical pair.
  const passages = []
  const seen = new Set()
  const neighbors = Object.fromEntries(nodes.map((n) => [n.id, new Set()]))
  for (const key of directed.keys()) {
    const [a, b] = key.split('>')
    const pk = pairKey(a, b)
    if (seen.has(pk)) continue
    seen.add(pk)
    neighbors[a].add(b)
    neighbors[b].add(a)
    // `ab` is the currently-iterated key, so it always exists; `ba` is the reverse.
    // Both present → two-way (each side keeps its own label/secret); only `ab` → one-way.
    const ab = directed.get(`${a}>${b}`)
    const ba = directed.get(`${b}>${a}`)
    if (ba) {
      passages.push({ id: `p:${pk}`, source: a, target: b, twoWay: true, sourceLabel: ab.label, targetLabel: ba.label, sourceSecret: ab.secret, targetSecret: ba.secret, sourceSkill: ab.skill, sourceDC: ab.dc, targetSkill: ba.skill, targetDC: ba.dc })
    } else {
      passages.push({ id: `p:${pk}`, source: a, target: b, twoWay: false, sourceLabel: ab.label, targetLabel: '', sourceSecret: ab.secret, targetSecret: false, sourceSkill: ab.skill, sourceDC: ab.dc, targetSkill: '', targetDC: 0 })
    }
  }

  // A dead-end connects to at most one OTHER room (boundary exits don't count).
  const deadEnds = new Set(nodes.filter((n) => neighbors[n.id].size <= 1).map((n) => n.id))

  // Lay rooms + exit ports out together so each port settles next to its room.
  const layoutEdges = [
    ...passages.map((p) => ({ from: p.source, to: p.target })),
    ...exitEdges.map((x) => ({ from: x.source, to: x.target })),
  ]
  const layout = forceLayout([...nodes, ...exitPorts], layoutEdges)
  const stats = { rooms: nodes.length, connections: passages.length, exits: exitPorts.length, loops: countLoops(nodes, passages) }
  return { nodes, exitPorts, passages, exitEdges, layout, deadEnds, stats }
}

// Independent loops in the room graph = the cyclomatic number (E − V + components):
// the count of passages that close a cycle (endpoints already connected). Union-find
// over the undirected passages. Just the count — the loops aren't highlighted on the
// map (only the number is useful), so no per-passage tagging.
function countLoops(nodes, passages) {
  const parent = Object.fromEntries(nodes.map((n) => [n.id, n.id]))
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  let loops = 0
  for (const p of passages) {
    const ra = find(p.source)
    const rb = find(p.target)
    if (ra === rb) loops++
    else parent[ra] = rb
  }
  return loops
}

// Canonical undirected key for a node pair (order-independent).
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// Where the segment from point `from` toward box centre `c` ({x, y, hw, hh}) crosses
// the box boundary — used by the map to place an arrowhead / label at a card's EDGE
// rather than its (hidden) centre. Scales the direction vector to the nearer of the
// box's vertical (hw) / horizontal (hh) half-extents; returns the centre when `from`
// coincides with it.
export function boundaryPoint(from, c) {
  const dx = c.x - from.x
  const dy = c.y - from.y
  if (dx === 0 && dy === 0) return { x: c.x, y: c.y }
  const s = Math.min(dx !== 0 ? c.hw / Math.abs(dx) : Infinity, dy !== 0 ? c.hh / Math.abs(dy) : Infinity)
  return { x: c.x - dx * s, y: c.y - dy * s }
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
