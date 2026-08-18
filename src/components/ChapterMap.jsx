import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, useNodesState, useInternalNode, getStraightPath, EdgeLabelRenderer } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildChapterGraph, boundaryPoint, sideText, seedPositions } from '../chapterGraph.js'
import { ROOM_TYPE_LABELS } from '../model.js'

// 8hda: an INTERACTIVE node-link map of a chapter — pan (drag canvas), zoom (scroll),
// drag a room to rearrange. Rooms are cards; a PASSAGE is a straight centre-to-centre
// line (one-way = arrow toward the target at its card edge, two-way = plain line);
// each side's label sits at its own end so a two-way passage's two labels don't
// overlap; a secret passage is dashed with a lock at the secret end; and an exit that
// leaves the chapter hangs off its room as a small circle. Collapsible by its title.
const ROOM_FILL = {
  combat: '#f3d4d4',
  hazard: '#f6e3c2',
  haunt: '#e7d6f1',
  exploration: '#d5ecd8',
  social: '#d0e3f7',
  knowledge: '#cfe8ec',
  empty: '#e6e6e6',
}
const EDGE_COLOR = '#8a8f98'

// Handles sit at the node's exact centre (hidden) so passages run centre-to-centre
// and the opaque card hides the stub; edges attach at the card edge via geometry below.
const CENTRED_HANDLE = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 1, height: 1, minWidth: 1, minHeight: 1, border: 'none', opacity: 0, pointerEvents: 'none' }

function RoomNode({ data }) {
  return (
    <div
      className="map-room"
      data-dead-end={data.dead || undefined}
      style={{ background: ROOM_FILL[data.roomType] || ROOM_FILL.empty, borderColor: data.dead ? '#c0392b' : '#556' }}
      title={data.name}
    >
      <Handle type="target" position={Position.Top} style={CENTRED_HANDLE} />
      <Handle type="source" position={Position.Top} style={CENTRED_HANDLE} />
      <div className="map-room-name">{data.name}</div>
      <div className="map-room-type">
        {ROOM_TYPE_LABELS[data.roomType] || data.roomType}
        {data.dead ? ' · dead-end' : ''}
      </div>
    </div>
  )
}

// A boundary exit: a small circle hung off the room; the exit label rides on its edge.
function ExitNode() {
  return (
    <div className="map-exit" title="Exit leaving the chapter">
      <Handle type="target" position={Position.Top} style={CENTRED_HANDLE} />
      <Handle type="source" position={Position.Top} style={CENTRED_HANDLE} />
    </div>
  )
}
const nodeTypes = { room: RoomNode, exit: ExitNode }

// The centre + half-extents of an internal React Flow node (measured, with fallbacks).
function boxOf(n) {
  const w = n.measured?.width || (n.type === 'exit' ? 36 : 132)
  const h = n.measured?.height || (n.type === 'exit' ? 36 : 46)
  const x = n.internals.positionAbsolute.x + w / 2
  const y = n.internals.positionAbsolute.y + h / 2
  return { x, y, hw: w / 2, hh: h / 2 }
}

// A passage between two rooms (or a room and an exit port). Line runs centre-to-centre;
// a one-way passage adds an arrowhead at the target's card edge; each side's label sits
// at its own card edge; a secret side is dashed with a lock.
function PassageEdge({ source, target, data }) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null
  const sc = boxOf(s)
  const tc = boxOf(t)
  const [path] = getStraightPath({ sourceX: sc.x, sourceY: sc.y, targetX: tc.x, targetY: tc.y })
  const tb = boundaryPoint(sc, tc) // target card edge — arrow sits here
  const sb = boundaryPoint(tc, sc) // source card edge
  const secret = data.sourceSecret || data.targetSecret
  const ang = (Math.atan2(tb.y - sc.y, tb.x - sc.x) * 180) / Math.PI
  // Push each label a bit off its own card, into the open gap along the line, so the
  // node doesn't cover it. Unit vector source→target.
  const len = Math.hypot(tc.x - sc.x, tc.y - sc.y) || 1
  const ux = (tc.x - sc.x) / len
  const uy = (tc.y - sc.y) / len
  const OFF = 40
  const sLabel = { x: sb.x + ux * OFF, y: sb.y + uy * OFF } // just past the source card
  const tLabel = { x: tb.x - ux * OFF, y: tb.y - uy * OFF } // just past the target card
  const sText = sideText(data.sourceSecret, data.sourceLabel, data.sourceSkill, data.sourceDC)
  const tText = sideText(data.targetSecret, data.targetLabel, data.targetSkill, data.targetDC)
  return (
    <>
      <path className="react-flow__edge-path" d={path} fill="none" stroke={EDGE_COLOR} strokeWidth={1.6} strokeDasharray={secret ? '6 4' : undefined} />
      {!data.twoWay && (
        <g transform={`translate(${tb.x} ${tb.y}) rotate(${ang})`}>
          <polygon points="0,0 -10,-4.5 -10,4.5" fill={EDGE_COLOR} />
        </g>
      )}
      <EdgeLabelRenderer>
        {sText && (
          <div className="map-edge-label" style={{ transform: `translate(-50%, -50%) translate(${sLabel.x}px, ${sLabel.y}px)` }}>{sText}</div>
        )}
        {tText && (
          <div className="map-edge-label" style={{ transform: `translate(-50%, -50%) translate(${tLabel.x}px, ${tLabel.y}px)` }}>{tText}</div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}
const edgeTypes = { passage: PassageEdge }

export default function ChapterMap({ encounters, onOpenEncounter, positions, onPositionsChange }) {
  const [collapsed, setCollapsed] = useState(false)
  const { nodes: rooms, exitPorts, passages, exitEdges, layout, deadEnds, stats } = useMemo(() => buildChapterGraph(encounters), [encounters])

  // The GM's saved layout, read via a ref so a save doesn't re-seed (which would fight
  // the drag); the graph STRUCTURE changing (rooms added/removed) does re-seed.
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  useEffect(() => {
    // Seed rooms AND exit ports: a saved position wins, else the force layout (new
    // nodes auto-place). Port ids (exit:<room>:<idx>) are stable while the exit list is.
    const seeded = seedPositions([...rooms, ...exitPorts], positionsRef.current, layout)
    setNodes([
      ...rooms.map((n) => ({ id: n.id, type: 'room', position: seeded[n.id], data: { name: n.name, roomType: n.roomType, dead: deadEnds.has(n.id) } })),
      ...exitPorts.map((p) => ({ id: p.id, type: 'exit', position: seeded[p.id], data: {}, draggable: true })),
    ])
  }, [rooms, exitPorts, layout, deadEnds, setNodes])

  // Drags only mutate local node state; stash the latest full layout (rooms + ports,
  // pruning gone nodes, including auto-placed new ones) and flush ONE save on unmount —
  // leaving the Map tab or closing the chapter — instead of a PUT per drag.
  const pendingRef = useRef(null)
  const onNodeDragStop = useCallback(() => {
    const pos = {}
    for (const n of nodes) pos[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
    pendingRef.current = pos
  }, [nodes])
  const saveRef = useRef(onPositionsChange)
  saveRef.current = onPositionsChange
  useEffect(() => () => {
    if (pendingRef.current && saveRef.current) saveRef.current(pendingRef.current)
  }, [])

  // Passages (rooms) + boundary exits (room → port) both render via PassageEdge.
  const edges = useMemo(
    () => [
      ...passages.map((p) => ({ id: p.id, source: p.source, target: p.target, type: 'passage', data: { twoWay: p.twoWay, sourceLabel: p.sourceLabel, targetLabel: p.targetLabel, sourceSecret: p.sourceSecret, targetSecret: p.targetSecret, sourceSkill: p.sourceSkill, sourceDC: p.sourceDC, targetSkill: p.targetSkill, targetDC: p.targetDC } })),
      ...exitEdges.map((x) => ({ id: x.id, source: x.source, target: x.target, type: 'passage', data: { twoWay: false, sourceLabel: '', targetLabel: x.label, sourceSecret: false, targetSecret: x.secret, targetSkill: x.skill, targetDC: x.dc } })),
    ],
    [passages, exitEdges],
  )

  const onNodeClick = useCallback((_, node) => node.type === 'room' && onOpenEncounter(node.id), [onOpenEncounter])
  const hasContent = passages.length > 0 || exitPorts.length > 0

  return (
    <section className="chapter-map" data-testid="chapter-map">
      <button type="button" className="map-title summary-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
        <span className="chapter-caret" aria-hidden="true">{collapsed ? '▸' : '▾'}</span> Map —{' '}
        {stats.rooms} room{stats.rooms === 1 ? '' : 's'} · {stats.connections} passage{stats.connections === 1 ? '' : 's'} · {stats.exits} exit
        {stats.exits === 1 ? '' : 's'} · {stats.loops} loop{stats.loops === 1 ? '' : 's'}
      </button>

      {!collapsed &&
        (!hasContent ? (
          <p className="muted">{stats.rooms ? 'No exits on these rooms yet — add Exits on an encounter.' : 'No encounters in this chapter yet.'}</p>
        ) : (
          <>
            <div className="map-canvas" data-testid="map-canvas">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                fitView
                minZoom={0.1}
                nodesConnectable={false}
                proOptions={{ hideAttribution: false }}
              >
                <Background gap={20} color="#2a3033" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'exit' ? '#8a8f98' : ROOM_FILL[n.data?.roomType] || ROOM_FILL.empty)} />
              </ReactFlow>
            </div>
            <p className="map-legend muted">
              <strong>→</strong> one-way exit · <strong>—</strong> two-way · <span className="map-legend-dash">– –</span> secret door (🔒 = the side it's hidden from) ·{' '}
              ○ exit leaving the chapter · red outline = dead-end. Drag to pan, scroll to zoom, drag a room to rearrange, click a room to open it.
            </p>
          </>
        ))}
    </section>
  )
}
