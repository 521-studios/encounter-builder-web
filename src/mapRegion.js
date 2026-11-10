// muz0.7: geometry for an encounter's room view, a crop of its chapter's map image.
// Everything is in the chapter map's flow coordinates (the space map_positions and
// map_region use): the image node sits at the origin, sized width x height x scale,
// and rotates about its centre.

// The image's drawn size, and the box it covers once rotated (a quarter turn swaps
// the sides about the centre). `t` is imageTransform's {rotation, scale}.
export function imageBox(img, t) {
  const w = img.width * t.scale
  const h = img.height * t.scale
  const quarter = t.rotation === 90 || t.rotation === 270
  const bw = quarter ? h : w
  const bh = quarter ? w : h
  return { w, h, bbox: { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh } }
}

// The room view's viewBox: the region grown on every side so the GM sees the
// surroundings, by a quarter of its longer side (at least 40).
export function paddedView(r) {
  const pad = Math.max(40, Math.round(Math.max(r.w, r.h) / 4))
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad }
}

// The rectangle two drag corners span, rounded to whole units; null when it's
// smaller than `min` on either side (a click, not a box).
export function dragRect(a, b, min = 4) {
  const x = Math.round(Math.min(a.x, b.x))
  const y = Math.round(Math.min(a.y, b.y))
  const w = Math.round(Math.abs(a.x - b.x))
  const h = Math.round(Math.abs(a.y - b.y))
  return w >= min && h >= min ? { x, y, w, h } : null
}
