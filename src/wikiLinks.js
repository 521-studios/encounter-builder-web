// w08f: module wiki-links. GM markdown carries [[Room Name]] / [[Quest Entity]]
// references (as in the published modules). This resolves each to an encounter by
// name and rewrites it into a normal markdown link with a sentinel fragment href,
// so the existing Markdown renderer draws it as an <a> the UI can intercept. A
// reference that matches no encounter is left as plain text (brackets stripped) —
// graceful, never a broken link. No data change: [[...]] is text the GM already types.

const WIKI = /\[\[([^\][]+)\]\]/g
const norm = (s) => (s || '').trim().toLowerCase()
const HREF_PREFIX = '#eb-encounter-'

// Rewrite [[Name]] → [Name](#eb-encounter-<id>) when Name matches an encounter
// (case-insensitive, trimmed); otherwise → plain Name. Returns markdown text.
export function preprocessWikiLinks(text, encounters) {
  if (!text) return text || ''
  const byName = new Map()
  for (const e of encounters || []) if (e && e.name) byName.set(norm(e.name), String(e.id))
  return text.replace(WIKI, (_, raw) => {
    const name = raw.trim()
    const id = byName.get(norm(name))
    return id ? `[${name}](${HREF_PREFIX}${id})` : name
  })
}

// The encounter id encoded in a wiki-link href, or null for any other link.
export function wikiTargetId(href) {
  if (!href || !href.startsWith(HREF_PREFIX)) return null
  const id = href.slice(HREF_PREFIX.length)
  return id || null
}
