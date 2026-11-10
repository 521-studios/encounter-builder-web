import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, useNodesState, useInternalNode, useReactFlow, EdgeLabelRenderer } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildChapterGraph, boundaryPoint, sideText, seedPositions, reseedBends, insertWaypoint, withBends, layoutSnapshot } from '../chapterGraph.js'
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
// muz0.2: the chapter's battle-map image, drawn as a fixed node at the flow origin
// (natural pixel size) underneath the rooms, so it pans/zooms with the graph and the
// GM can drag rooms onto their real spots. Not draggable/selectable; never saved.
const MAP_IMAGE_ID = '__map-image'

// muz0.3: the GM's rotate/scale of the image, persisted on map_image. Rotation is a
// quarter-turn (0/90/180/270); scale is clamped to 10%..400%. Missing → 0 / 1.
export const SCALE_MIN = 0.1
export const SCALE_MAX = 4
export function imageTransform(img) {
  const r = Math.round(Number(img?.rotation) / 90) * 90
  const s = Number(img?.scale)
  return {
    rotation: Number.isFinite(r) ? ((r % 360) + 360) % 360 : 0,
    scale: Number.isFinite(s) && s > 0 ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)) : 1,
  }
}

// Scale resizes the node (so fitView and the minimap see the real footprint);
// rotation spins the picture about its centre.
function MapImageNode({ data }) {
  const { rotation, scale } = imageTransform(data)
  return (
    <img
      className="map-image"
      src={data.url}
      alt="Chapter map"
      width={Math.round(data.width * scale)}
      height={Math.round(data.height * scale)}
      style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
      draggable={false}
    />
  )
}
const nodeTypes = { room: RoomNode, exit: ExitNode, mapImage: MapImageNode }

// Rotate a quarter-turn and scale; each change sends the whole map_image back.
function MapImageControls({ mapImage, onChange }) {
  const { rotation, scale } = imageTransform(mapImage)
  return (
    <>
      <button type="button" className="link" onClick={() => onChange({ ...mapImage, rotation: (rotation + 90) % 360, scale })}>
        Rotate 90° ({rotation}°)
      </button>
      <label>
        Scale{' '}
        <input
          type="range"
          aria-label="map image scale"
          min={SCALE_MIN * 100}
          max={SCALE_MAX * 100}
          step={5}
          value={Math.round(scale * 100)}
          onChange={(e) => onChange({ ...mapImage, rotation, scale: Number(e.target.value) / 100 })}
        />{' '}
        {Math.round(scale * 100)}%
      </label>
    </>
  )
}

// The centre + half-extents of an internal React Flow node (measured, with fallbacks).
function boxOf(n) {
  const w = n.measured?.width || (n.type === 'exit' ? 36 : 132)
  const h = n.measured?.height || (n.type === 'exit' ? 36 : 46)
  const x = n.internals.positionAbsolute.x + w / 2
  const y = n.internals.positionAbsolute.y + h / 2
  return { x, y, hw: w / 2, hh: h / 2 }
}

// Unit vector a → b (zero-length → +x, so a label still has a direction).
function unit(a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  return len ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 }
}

// A passage between two rooms (or a room and an exit port). Line runs centre-to-centre
// through the GM's bend points (muz0.4); a one-way passage adds an arrowhead at the
// target's card edge; each side's label sits at its own card edge; a secret side is
// dashed with a lock. Double-click the line to add a bend; drag a bend to move it;
// double-click a bend to remove it.
function PassageEdge({ id, source, target, data }) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  const { screenToFlowPosition } = useReactFlow()
  if (!s || !t) return null
  const sc = boxOf(s)
  const tc = boxOf(t)
  const wps = data.waypoints || []
  const first = wps[0] || tc // the point the line leaves the source toward
  const last = wps[wps.length - 1] || sc // the point the line enters the target from
  const path = `M ${[sc, ...wps, tc].map((p) => `${p.x},${p.y}`).join(' L ')}`
  const tb = boundaryPoint(last, tc) // target card edge — arrow sits here
  const sb = boundaryPoint(first, sc) // source card edge
  const secret = data.sourceSecret || data.targetSecret
  const ang = (Math.atan2(tb.y - last.y, tb.x - last.x) * 180) / Math.PI
  // Push each label a bit off its own card, into the open gap along its end segment,
  // so the node doesn't cover it.
  const OFF = 40
  const su = unit(sc, first)
  const tu = unit(last, tc)
  const sLabel = { x: sb.x + su.x * OFF, y: sb.y + su.y * OFF } // just past the source card
  const tLabel = { x: tb.x - tu.x * OFF, y: tb.y - tu.y * OFF } // just past the target card
  const sText = sideText(data.sourceSecret, data.sourceLabel, data.sourceSkill, data.sourceDC)
  const tText = sideText(data.targetSecret, data.targetLabel, data.targetSkill, data.targetDC)
  const onChange = data.onWaypointsChange
  const at = (e) => screenToFlowPosition({ x: e.clientX, y: e.clientY })
  return (
    <>
      <path className="react-flow__edge-path" d={path} fill="none" stroke={EDGE_COLOR} strokeWidth={1.6} strokeDasharray={secret ? '6 4' : undefined} />
      {onChange && (
        // A wide invisible stroke so the thin line is easy to double-click.
        <path className="map-edge-hit nodrag nopan" d={path} fill="none" stroke="transparent" strokeWidth={14} onDoubleClick={(e) => onChange(id, insertWaypoint(sc, wps, tc, at(e)))}>
          <title>Double-click to add a bend</title>
        </path>
      )}
      {onChange &&
        wps.map((p, i) => (
          <circle
            key={i}
            className="map-bend nodrag nopan"
            cx={p.x}
            cy={p.y}
            r={5}
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onChange(id, wps.map((q, j) => (j === i ? at(e) : q)))}
            onDoubleClick={() => onChange(id, wps.filter((_, j) => j !== i))}
          >
            <title>Drag to move · double-click to remove</title>
          </circle>
        ))}
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

export default function ChapterMap({ encounters, onOpenEncounter, positions, onPositionsChange, mapImage, onMapImageChange }) {
  const [collapsed, setCollapsed] = useState(false)
  const [showImage, setShowImage] = useState(true)
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

  // The image node is derived, not part of the dragged/saved node state.
  const imageNode = useMemo(
    () =>
      mapImage?.url
        ? { id: MAP_IMAGE_ID, type: 'mapImage', position: { x: 0, y: 0 }, data: mapImage, zIndex: -1, draggable: false, selectable: false, focusable: false, hidden: !showImage }
        : null,
    [mapImage, showImage],
  )
  const allNodes = useMemo(() => (imageNode ? [imageNode, ...nodes] : nodes), [imageNode, nodes])

  // Drags (rooms, ports, bends) only mutate local state; mark the layout dirty and flush
  // ONE save of the full layout (live nodes + bends, gone ones pruned) on unmount —
  // leaving the Map tab or closing the chapter — instead of a PUT per drag.
  const dirtyRef = useRef(false)
  const latestRef = useRef({ nodes: [], waypoints: {} })

  // muz0.4: each edge's bend points, re-seeded when the graph structure changes.
  const [waypoints, setWaypoints] = useState({})
  useEffect(() => {
    setWaypoints(reseedBends(dirtyRef.current, latestRef.current.waypoints, positionsRef.current, [...passages, ...exitEdges].map((e) => e.id)))
  }, [passages, exitEdges])
  const onWaypointsChange = useCallback((id, pts) => {
    dirtyRef.current = true
    setWaypoints((w) => withBends(w, id, pts))
  }, [])

  latestRef.current = { nodes, waypoints }
  const onNodeDragStop = useCallback(() => {
    dirtyRef.current = true
  }, [])
  const saveRef = useRef(onPositionsChange)
  saveRef.current = onPositionsChange
  useEffect(() => () => {
    if (dirtyRef.current && saveRef.current) saveRef.current(layoutSnapshot(latestRef.current.nodes, latestRef.current.waypoints))
  }, [])

  // Passages (rooms) + boundary exits (room → port) both render via PassageEdge.
  const edges = useMemo(() => {
    const bend = (id) => ({ waypoints: waypoints[id], onWaypointsChange: onPositionsChange ? onWaypointsChange : undefined })
    return [
      ...passages.map((p) => ({ id: p.id, source: p.source, target: p.target, type: 'passage', data: { twoWay: p.twoWay, sourceLabel: p.sourceLabel, targetLabel: p.targetLabel, sourceSecret: p.sourceSecret, targetSecret: p.targetSecret, sourceSkill: p.sourceSkill, sourceDC: p.sourceDC, targetSkill: p.targetSkill, targetDC: p.targetDC, ...bend(p.id) } })),
      ...exitEdges.map((x) => ({ id: x.id, source: x.source, target: x.target, type: 'passage', data: { twoWay: false, sourceLabel: '', targetLabel: x.label, sourceSecret: false, targetSecret: x.secret, targetSkill: x.skill, targetDC: x.dc, ...bend(x.id) } })),
    ]
  }, [passages, exitEdges, waypoints, onWaypointsChange, onPositionsChange])

  const onNodeClick = useCallback((_, node) => node.type === 'room' && onOpenEncounter(node.id), [onOpenEncounter])
  const hasContent = passages.length > 0 || exitPorts.length > 0 || Boolean(imageNode)

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
                nodes={allNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={onNodeClick}
                fitView
                minZoom={0.1}
                zoomOnDoubleClick={false} // double-click adds/removes passage bends
                nodesConnectable={false}
                proOptions={{ hideAttribution: false }}
              >
                <Background gap={20} color="#2a3033" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'mapImage' ? 'transparent' : n.type === 'exit' ? '#8a8f98' : ROOM_FILL[n.data?.roomType] || ROOM_FILL.empty)} />
              </ReactFlow>
            </div>
            {imageNode && (
              <div className="map-image-controls">
                <button type="button" className="link" onClick={() => setShowImage((v) => !v)}>
                  {showImage ? 'Hide map image' : 'Show map image'}
                </button>
                {showImage && onMapImageChange && <MapImageControls mapImage={mapImage} onChange={onMapImageChange} />}
              </div>
            )}
            <p className="map-legend muted">
              <strong>→</strong> one-way exit · <strong>—</strong> two-way · <span className="map-legend-dash">– –</span> secret door (🔒 = the side it's hidden from) ·{' '}
              ○ exit leaving the chapter · red outline = dead-end. Drag to pan, scroll to zoom, drag a room to rearrange, click a room to open it. Double-click a passage to bend it;
              drag a bend to move it, double-click it to remove.
            </p>
          </>
        ))}
    </section>
  )
}
