import { useMemo, useState } from 'react'
import { buildChapterGraph } from '../chapterGraph.js'
import { ROOM_TYPE_LABELS } from '../model.js'

// 8hda: a dependency-free node-link map of a chapter's connectivity (encounters =
// nodes, 3qq7 exits = directed edges). Renders the Jaquays structure — loops,
// dead-ends — as plain SVG. Always-visible, collapsible by its title (per the
// rollup UX law). Click a node to open that encounter.
const NODE_W = 132
const NODE_H = 46
// Light pastel fills keyed by room type, with dark text — nodes coloured by type.
const ROOM_FILL = {
  combat: '#f3d4d4',
  hazard: '#f6e3c2',
  haunt: '#e7d6f1',
  exploration: '#d5ecd8',
  social: '#d0e3f7',
  knowledge: '#cfe8ec',
  empty: '#e6e6e6',
}

export default function ChapterMap({ encounters, onOpenEncounter }) {
  const [collapsed, setCollapsed] = useState(false)
  // The force layout is an iterative simulation — memoize on the encounters so it
  // runs once per graph change, not every render (and stays visually stable).
  const { nodes, edges, layout, deadEnds, stats } = useMemo(() => buildChapterGraph(encounters), [encounters])

  const width = Math.max(1, ...nodes.map((n) => layout[n.id].x + NODE_W + 24))
  const height = Math.max(1, ...nodes.map((n) => layout[n.id].y + NODE_H + 24))
  const center = (id) => ({ x: layout[id].x + NODE_W / 2, y: layout[id].y + NODE_H / 2 })

  return (
    <section className="chapter-map" data-testid="chapter-map">
      <button
        type="button"
        className="map-title summary-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="chapter-caret" aria-hidden="true">{collapsed ? '▸' : '▾'}</span> Map —{' '}
        {stats.rooms} room{stats.rooms === 1 ? '' : 's'} · {stats.connections} connection
        {stats.connections === 1 ? '' : 's'} · {stats.loops} loop{stats.loops === 1 ? '' : 's'}
      </button>

      {!collapsed &&
        (edges.length === 0 ? (
          <p className="muted">
            {nodes.length ? 'No exits linked between these rooms yet — add Exits on an encounter.' : 'No encounters in this chapter yet.'}
          </p>
        ) : (
          <div className="map-scroll" style={{ overflowX: 'auto' }}>
            <svg width={width} height={height} data-testid="map-svg" role="group" aria-label="Chapter connectivity map">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#888" />
                </marker>
                <marker id="arrow-loop" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L7,3 L0,6 Z" fill="#b8860b" />
                </marker>
              </defs>

              {edges.map((e, i) => {
                const a = center(e.from)
                const b = center(e.to)
                const loop = e.isLoop
                return (
                  <g key={i} data-testid="map-edge" data-loop={loop || undefined}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={loop ? '#b8860b' : '#999'}
                      strokeWidth={loop ? 2 : 1.5}
                      markerEnd={loop ? 'url(#arrow-loop)' : 'url(#arrow)'}
                    />
                    {e.label && (
                      <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} fontSize="11" fill="#555" textAnchor="middle">
                        {e.label}
                      </text>
                    )}
                  </g>
                )
              })}

              {nodes.map((n) => {
                const p = layout[n.id]
                const dead = deadEnds.has(n.id)
                return (
                  <g
                    key={n.id}
                    data-testid="map-node"
                    data-dead-end={dead || undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${n.name}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onOpenEncounter(n.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault() // Space would otherwise scroll the page
                        onOpenEncounter(n.id)
                      }
                    }}
                  >
                    <rect
                      x={p.x}
                      y={p.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx="6"
                      fill={ROOM_FILL[n.roomType] || ROOM_FILL.empty}
                      stroke={dead ? '#c0392b' : '#556'}
                      strokeWidth={dead ? 2.5 : 1}
                    />
                    <text x={p.x + NODE_W / 2} y={p.y + 20} fontSize="13" fill="#222" textAnchor="middle" fontWeight="600">
                      {n.name.length > 16 ? n.name.slice(0, 15) + '…' : n.name}
                    </text>
                    <text x={p.x + NODE_W / 2} y={p.y + 37} fontSize="10" fill="#556" textAnchor="middle">
                      {ROOM_TYPE_LABELS[n.roomType] || n.roomType}
                      {dead ? ' · dead-end' : ''}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        ))}
    </section>
  )
}
