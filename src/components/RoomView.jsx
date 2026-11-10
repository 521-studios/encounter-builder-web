import { useRef, useState } from 'react'
import { imageTransform } from './ChapterMap.jsx'
import MapImageUpload from './MapImageUpload.jsx'
import { uploadEncounterImage } from '../api/mapUpload.js'
import { isAnon } from '../api/anon.js'
import { imageBox, paddedView, dragRect } from '../mapRegion.js'

// A room card's default size on the chapter map (ChapterMap's boxOf fallback).
const CARD = { w: 132, h: 46 }

// The chapter map image drawn in flow coordinates, so any viewBox is a crop of it.
function MapSvg({ img, view, svgRef, children, ...rest }) {
  const t = imageTransform(img)
  const { w, h } = imageBox(img, t)
  return (
    <svg ref={svgRef} className="room-map" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} {...rest}>
      <image href={img.url} width={w} height={h} preserveAspectRatio="none" transform={t.rotation ? `rotate(${t.rotation} ${w / 2} ${h / 2})` : undefined} />
      {children}
    </svg>
  )
}

const Box = ({ r, className }) => <rect className={className} x={r.x} y={r.y} width={r.w} height={r.h} vectorEffect="non-scaling-stroke" />

// Drag a box over the whole chapter map; this room's card is outlined to find it.
function AreaPicker({ img, region, card, onPick, onCancel }) {
  const svgRef = useRef(null)
  const [start, setStart] = useState(null)
  const [cur, setCur] = useState(null)
  const at = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse())
    return { x: p.x, y: p.y }
  }
  const drawn = start && cur ? dragRect(start, cur, 0) : null
  return (
    <div className="room-picker">
      <p>Drag a box around this room on the chapter map.</p>
      <MapSvg
        img={img}
        view={imageBox(img, imageTransform(img)).bbox}
        svgRef={svgRef}
        data-testid="room-picker"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setStart(at(e))
          setCur(at(e))
        }}
        onPointerMove={(e) => start && setCur(at(e))}
        onPointerUp={(e) => {
          const r = start && dragRect(start, at(e))
          setStart(null)
          setCur(null)
          if (r) onPick(r)
        }}
        onPointerCancel={() => {
          setStart(null)
          setCur(null)
        }}
      >
        {card && <Box r={card} className="room-card-outline" />}
        {region && !drawn && <Box r={region} className="room-region" />}
        {drawn && <Box r={drawn} className="room-region" />}
      </MapSvg>
      <button type="button" className="link" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

// muz0.8: a neighbour's card on the crop, clickable to open it. A mouse shortcut only
// (it sits inside the role="img" crop); the Connected rooms buttons are the real path.
function NeighbourCard({ n, at, onOpen }) {
  return (
    <g className="room-neighbour" aria-hidden="true" onClick={() => onOpen(n.id)}>
      <title>{`Open ${n.name}`}</title>
      <rect x={at.x} y={at.y} width={CARD.w} height={CARD.h} rx={6} vectorEffect="non-scaling-stroke" />
      <text x={at.x + CARD.w / 2} y={at.y + CARD.h / 2} textAnchor="middle" dominantBaseline="central">
        {n.name}
      </text>
    </g>
  )
}

// muz0.7: the encounter's room view. Its own uploaded image wins; otherwise it's the
// GM's box on the chapter map, padded to show the surroundings. muz0.8: it links to
// the rooms it connects to and out to the chapter map.
export default function RoomView({ campaignId, enc, chapter, released, onChange, neighbours = [], onOpenEncounter, onOpenChapter }) {
  const [picking, setPicking] = useState(false)
  const chapterImg = chapter?.map_image
  const region = enc.map_region
  const pos = chapter?.map_positions?.[enc.id]
  const card = pos ? { x: pos.x, y: pos.y, ...CARD } : null

  if (picking && chapterImg) {
    return (
      <AreaPicker
        img={chapterImg}
        region={region}
        card={card}
        onPick={(map_region) => {
          onChange({ map_region })
          setPicking(false)
        }}
        onCancel={() => setPicking(false)}
      />
    )
  }
  return (
    <div className="room-view">
      {enc.map_image ? (
        <img className="room-image" src={enc.map_image.url} alt="Room map" />
      ) : chapterImg && region ? (
        <MapSvg img={chapterImg} view={paddedView(region)} role="img" aria-label="Room on the chapter map">
          <Box r={region} className="room-region" />
          {neighbours.map((n) => {
            const at = chapter.map_positions?.[n.id]
            return at ? <NeighbourCard key={n.id} n={n} at={at} onOpen={onOpenEncounter} /> : null
          })}
        </MapSvg>
      ) : (
        <p className="muted">
          {!chapter
            ? 'Put this encounter in a chapter to show its room on the chapter map.'
            : !chapterImg
              ? "Upload a map image on the chapter's Map tab, or upload a room image here."
              : 'No area set yet. Mark this room on the chapter map, or upload a room image.'}
        </p>
      )}
      {(neighbours.length > 0 || chapter) && (
        <nav className="room-nav" aria-label="Connected rooms">
          {neighbours.map((n) => (
            <button type="button" className="link" key={n.id} onClick={() => onOpenEncounter(n.id)}>
              {n.label ? `${n.name} (${n.label})` : n.name}
            </button>
          ))}
          {chapter && (
            <button type="button" onClick={() => onOpenChapter(chapter)}>
              Open chapter map
            </button>
          )}
        </nav>
      )}
      {!released && (
        <div className="room-view-controls">
          {chapterImg && !enc.map_image && (
            <button type="button" onClick={() => setPicking(true)}>
              {region ? 'Change area on chapter map' : 'Mark area on chapter map'}
            </button>
          )}
          {region && !enc.map_image && (
            <button type="button" className="link" onClick={() => onChange({ map_region: null })}>
              Clear area
            </button>
          )}
          {!isAnon() && <MapImageUpload noun="room image" upload={(file) => uploadEncounterImage(campaignId, enc.id, file)} mapImage={enc.map_image} onChange={(map_image) => onChange({ map_image })} />}
        </div>
      )}
    </div>
  )
}
