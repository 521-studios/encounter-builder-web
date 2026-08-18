import { useEffect, useMemo, useState, useCallback } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildChapterGraph } from '../chapterGraph.js'
import { ROOM_TYPE_LABELS } from '../model.js'

// 8hda: an INTERACTIVE node-link map of a chapter's connectivity (encounters = nodes,
// 3qq7 exits = edges), built on React Flow — pan (drag the canvas), zoom (scroll), and
// drag a room to rearrange it. The force layout (chapterGraph.forceLayout) seeds the
// initial positions; the Jaquays structure (loops in gold, dead-ends outlined) and the
// exit labels read directly off the edges. Always-visible, collapsible by its title.
// (Node positions are session-only for now; persisting a GM's manual layout is the next
// step — a positions blob on the chapter.)
const ROOM_FILL = {
  combat: '#f3d4d4',
  hazard: '#f6e3c2',
  haunt: '#e7d6f1',
  exploration: '#d5ecd8',
  social: '#d0e3f7',
  knowledge: '#cfe8ec',
  empty: '#e6e6e6',
}

// A room card node. Both handles sit at the node's EXACT centre (hidden), so a
// straight edge runs centre-to-centre and the opaque card hides the stub under it —
// no curve pulling toward a top/side handle. Click opens the encounter.
function RoomNode({ data }) {
  const centred = {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 1,
    height: 1,
    minWidth: 1,
    minHeight: 1,
    border: 'none',
    opacity: 0,
    pointerEvents: 'none',
  }
  return (
    <div
      className="map-room"
      data-dead-end={data.dead || undefined}
      style={{ background: ROOM_FILL[data.roomType] || ROOM_FILL.empty, borderColor: data.dead ? '#c0392b' : '#556' }}
      title={data.name}
    >
      <Handle type="target" position={Position.Top} style={centred} />
      <Handle type="source" position={Position.Top} style={centred} />
      <div className="map-room-name">{data.name}</div>
      <div className="map-room-type">
        {ROOM_TYPE_LABELS[data.roomType] || data.roomType}
        {data.dead ? ' · dead-end' : ''}
      </div>
    </div>
  )
}
const nodeTypes = { room: RoomNode }

export default function ChapterMap({ encounters, onOpenEncounter }) {
  const [collapsed, setCollapsed] = useState(false)
  // buildChapterGraph is a memoized pure derivation: nodes/edges/force-layout/stats.
  const { nodes: gnodes, edges: gedges, layout, deadEnds, stats } = useMemo(() => buildChapterGraph(encounters), [encounters])

  // React Flow node state — draggable within the session. Re-seeded from the force
  // layout whenever the graph changes (add/remove/rename a room, edit an exit).
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  useEffect(() => {
    setNodes(
      gnodes.map((n) => ({
        id: n.id,
        type: 'room',
        position: layout[n.id] || { x: 0, y: 0 },
        data: { name: n.name, roomType: n.roomType, dead: deadEnds.has(n.id) },
      })),
    )
  }, [gnodes, layout, deadEnds, setNodes])

  // Exits → edges. Labeled with the exit label; gold + thicker when the passage closes
  // a loop (the Jaquays highlight); an arrowhead shows direction.
  const edges = useMemo(
    () =>
      gedges.map((e, i) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        type: 'straight', // straight centre-to-centre line, not a bezier curving to a handle
        label: e.label || undefined,
        style: { stroke: e.isLoop ? '#b8860b' : '#8a8f98', strokeWidth: e.isLoop ? 2.5 : 1.6 },
        labelStyle: { fill: '#cbd0d6', fontSize: 11 },
        labelBgStyle: { fill: '#1b1f22', fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
      })),
    [gedges],
  )

  const onNodeClick = useCallback((_, node) => onOpenEncounter(node.id), [onOpenEncounter])

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
        (gedges.length === 0 ? (
          <p className="muted">
            {gnodes.length ? 'No exits linked between these rooms yet — add Exits on an encounter.' : 'No encounters in this chapter yet.'}
          </p>
        ) : (
          <>
            <div className="map-canvas" data-testid="map-canvas">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onNodeClick={onNodeClick}
                fitView
                minZoom={0.1}
                nodesConnectable={false}
                proOptions={{ hideAttribution: false }}
              >
                <Background gap={20} color="#2a3033" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(n) => ROOM_FILL[n.data?.roomType] || ROOM_FILL.empty} />
              </ReactFlow>
            </div>
            <p className="map-legend muted">
              Lines are <strong>exits</strong> between rooms · <span style={{ color: '#b8860b' }}>gold</span> = a loop ·
              red outline = dead-end. Drag the canvas to pan, scroll to zoom, drag a room to rearrange, click a room to open it.
            </p>
          </>
        ))}
    </section>
  )
}
