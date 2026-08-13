import { useEffect, useState, useCallback, useRef } from 'react'
import { errorMessage } from '../api/errors.js'
import { encounters as encountersApi } from '../api/encounters.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { groupEncountersByChapter, nextChapterOrder, ensureUnsortedGroup, UNSORTED } from '../chapters.js'
import { toEncounterInput } from '../model.js'

// The sidebar chapter tree: chapters (in order) each expand to their encounters
// (natural-sorted). Direct manipulation — click a chapter's NAME to open its
// detail (rename/delete/party live there); the ▸ caret is the only expand toggle.
// "+ encounter" / "+ chapter" create an untitled record and open it immediately.
// Chapterless/dangling encounters render under a synthetic "Unsorted" group.
export default function ChapterTree({ campaignId, onEdit, onEditChapter, reloadKey, selectedId }) {
  const [chapters, setChapters] = useState(null) // null = loading
  const [encounters, setEncounters] = useState([])
  const [error, setError] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set()) // chapter ids that are collapsed
  const [busy, setBusy] = useState(false) // a create/move is in flight
  const [dragOverKey, setDragOverKey] = useState(null) // group being dragged over
  const dragEnc = useRef(null) // the encounter currently being dragged
  // Monotonic token: only the newest load may commit, so a slow fetch for a
  // previous campaign can't overwrite a newer one on a rapid campaign switch.
  const loadToken = useRef(0)

  const load = useCallback(async () => {
    const mine = ++loadToken.current
    setError(null)
    try {
      const [chs, encs] = await Promise.all([
        chaptersApi.list(campaignId),
        encountersApi.list(campaignId),
      ])
      if (mine !== loadToken.current) return // superseded by a newer load
      setChapters(chs)
      setEncounters(encs)
    } catch (e) {
      if (mine !== loadToken.current) return
      setError(errorMessage(e))
    }
  }, [campaignId])

  useEffect(() => {
    setChapters(null)
    load()
  }, [load, reloadKey])

  // Create-and-open: make an untitled record, then open its detail so it's named
  // there (the API requires a non-empty name, hence the placeholder).
  async function addEncounter(chapterId) {
    setBusy(true)
    try {
      const input = { name: 'Untitled encounter', currency: {} }
      if (chapterId) input.chapter_id = chapterId
      const enc = await encountersApi.create(campaignId, input)
      await load()
      onEdit(enc)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function addChapter() {
    setBusy(true)
    try {
      const ch = await chaptersApi.create(campaignId, {
        name: 'Untitled chapter',
        order: nextChapterOrder(chapters || []),
      })
      await load()
      onEditChapter(ch)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Move an encounter to another chapter (or Unsorted, chapterId=''). PUT replaces
  // the resource, so send the whole encounter with the new chapter_id. `busy`
  // disables interactions during the in-flight PUT so a fast double-pick can't race.
  async function moveEncounter(enc, chapterId) {
    setBusy(true)
    try {
      await encountersApi.update(campaignId, enc.id, { ...toEncounterInput(enc), chapter_id: chapterId })
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  if (error) return <p className="error" role="alert">Could not load chapters: {error}</p>
  if (chapters === null) return <p>Loading…</p>

  // Always render an Unsorted group so it's a drop target even when empty.
  const groups = ensureUnsortedGroup(groupEncountersByChapter(chapters, encounters))

  return (
    <section className="chapters" data-testid="chapter-tree">
      {groups.map((g) => {
        const key = g.chapter ? g.chapter.id : UNSORTED
        const isOpen = !collapsed.has(key)
        const chapterId = g.chapter ? g.chapter.id : '' // '' = Unsorted
        return (
          <div
            key={key}
            className={`chapter-group${dragOverKey === key ? ' drag-over' : ''}`}
            data-testid="chapter-group"
            data-chapter-id={chapterId}
            onDragOver={(ev) => {
              if (!dragEnc.current) return
              ev.preventDefault() // allow the drop
              if (dragOverKey !== key) setDragOverKey(key)
            }}
            onDrop={(ev) => {
              ev.preventDefault()
              const enc = dragEnc.current
              setDragOverKey(null)
              // Skip only a true no-op (dropped on its own group). Dropping an
              // encounter with a dangling chapter_id (deleted chapter → shown in
              // Unsorted) onto Unsorted does fire a move to '' — a beneficial
              // normalization that clears the dead id.
              if (enc && (enc.chapter_id || '') !== chapterId) moveEncounter(enc, chapterId)
            }}
          >
            <div className="chapter-head">
              <button
                className="chapter-caret-btn"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.chapter ? g.chapter.name : 'Unsorted'}`}
                onClick={() => toggle(key)}
              >
                <span className="chapter-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              </button>
              {g.chapter ? (
                <button
                  className="chapter-name"
                  aria-label={`Open chapter ${g.chapter.name}`}
                  onClick={() => onEditChapter(g.chapter)}
                >
                  {g.chapter.name}
                </button>
              ) : (
                <span className="chapter-name chapter-name--unsorted">Unsorted</span>
              )}
            </div>
            {isOpen && (
              <div className="chapter-body">
                {g.encounters.length === 0 && (
                  <p className="muted drop-hint">Drop an encounter here</p>
                )}
                <ul className="encounter-list">
                  {g.encounters.map((e) => (
                    <li
                      key={e.id}
                      className="encounter-row"
                      // Released encounters are read-only, so not draggable.
                      draggable={e.status !== 'released' && !busy}
                      onDragStart={() => {
                        dragEnc.current = e
                      }}
                      onDragEnd={() => {
                        dragEnc.current = null
                        setDragOverKey(null)
                      }}
                    >
                      <button
                        className={e.id === selectedId ? 'encounter selected' : 'encounter'}
                        aria-pressed={e.id === selectedId}
                        onClick={() => onEdit(e)}
                      >
                        {e.name} <span className="status">{e.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {g.chapter && (
                  <button
                    type="button"
                    className="link add-encounter"
                    disabled={busy}
                    onClick={() => addEncounter(g.chapter.id)}
                  >
                    + encounter
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {/* Always-present bottom controls: add an unsorted encounter, or a chapter.
          This is the only add-encounter path when there are no chapters yet. */}
      <div className="tree-actions">
        <button type="button" className="link add-encounter" data-testid="new-encounter" disabled={busy} onClick={() => addEncounter(null)}>
          + encounter
        </button>
        <button type="button" className="link add-chapter" data-testid="add-chapter" disabled={busy} onClick={addChapter}>
          + chapter
        </button>
      </div>
    </section>
  )
}
