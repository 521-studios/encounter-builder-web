import { Markdown } from '@521studios/pfsrd2-display'
import { preprocessWikiLinks, wikiTargetId } from '../wikiLinks.js'

// Renders GM markdown with [[wiki-links]] resolved to clickable encounter links
// (w08f). Wraps the shared Markdown renderer and intercepts clicks on the resolved
// links via delegation, so no custom markdown renderer is needed. Falls back to a
// plain Markdown render when there's nothing to link against.
export default function WikiMarkdown({ text, encounters, onOpenEncounter, block = true }) {
  const processed = preprocessWikiLinks(text, encounters)
  const onClick = (e) => {
    const a = e.target.closest && e.target.closest('a')
    if (!a) return
    const id = wikiTargetId(a.getAttribute('href'))
    if (id && onOpenEncounter) {
      e.preventDefault()
      onOpenEncounter(id)
    }
  }
  return (
    <div className="wiki-markdown" data-testid="wiki-markdown" onClick={onClick}>
      <Markdown block={block} text={processed} />
    </div>
  )
}
