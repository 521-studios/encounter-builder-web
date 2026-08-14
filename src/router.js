// Query-string routing for the SPA. We encode navigation in the query string
// (`/?campaign=…&encounter=…`) rather than the path so the CloudFront edge always
// serves index.html at `/` — no SPA path-rewrite/fallback needed at the edge (this
// app must not own edge config; see CLAUDE.md). Two pure helpers the App wires to
// the History API: parse the current location into {campaignId, view}, and build
// the query string for a given nav state. Kept pure so they're unit-testable.

// parseLocation(search) → { campaignId, view } where view is one of:
//   { kind: 'empty' } | { kind: 'campaign' }
//   | { kind: 'encounter', encounterId } | { kind: 'chapter', chapterId }
// `search` is a location.search string (with or without the leading '?').
export function parseLocation(search) {
  const p = new URLSearchParams(search || '')
  const campaignId = p.get('campaign') || null
  if (!campaignId) return { campaignId: null, view: { kind: 'empty' } }

  const encounterId = p.get('encounter')
  if (encounterId) return { campaignId, view: { kind: 'encounter', encounterId } }

  const chapterId = p.get('chapter')
  if (chapterId) return { campaignId, view: { kind: 'chapter', chapterId } }

  if (p.get('view') === 'settings') return { campaignId, view: { kind: 'campaign' } }

  return { campaignId, view: { kind: 'empty' } }
}

// locationFor(campaignId, view) → the query string (no leading '?') for that nav
// state, or '' for the root (campaign list). `view` is the App's view object:
//   { kind: 'empty' | 'campaign' | 'encounter'(enc.id) | 'chapter'(chapter.id) }
export function locationFor(campaignId, view = { kind: 'empty' }) {
  if (!campaignId) return ''
  const p = new URLSearchParams({ campaign: campaignId })
  if (view.kind === 'encounter' && view.enc?.id) p.set('encounter', view.enc.id)
  else if (view.kind === 'chapter' && view.chapter?.id) p.set('chapter', view.chapter.id)
  else if (view.kind === 'campaign') p.set('view', 'settings')
  return p.toString()
}

// urlFor(campaignId, view) → the full path+query to push ('/' or '/?…').
export function urlFor(campaignId, view) {
  const q = locationFor(campaignId, view)
  return q ? `/?${q}` : '/'
}
