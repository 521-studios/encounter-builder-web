import { useEffect, useState, useCallback, useRef } from 'react'
import { errorMessage } from '../api/errors.js'
import { encounters as encountersApi } from '../api/encounters.js'
import { chapters as chaptersApi } from '../api/chapters.js'
import { groupEncountersByChapter, nextChapterOrder, UNSORTED } from '../chapters.js'
import { toEncounterInput } from '../model.js'

// The sidebar chapter tree: chapters (in order) each expand to their encounters
// (natural-sorted), with a "+ encounter" per chapter and chapter add/rename/delete.
// Chapterless/dangling encounters render under a synthetic "Unsorted" group.
// (Reorder is deferred — new chapters append; tracked as a follow-up.)
export default function ChapterTree({ campaignId, onEdit, reloadKey, selectedId }) {
  const [chapters, setChapters] = useState(null) // null = loading
  const [encounters, setEncounters] = useState([])
  const [error, setError] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set()) // chapter ids that are collapsed
  const [moving, setMoving] = useState(false) // an encounter move is in flight
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

  async function addEncounter(chapterId, name) {
    const input = { name, currency: {} }
    if (chapterId) input.chapter_id = chapterId
    const enc = await encountersApi.create(campaignId, input)
    await load()
    onEdit(enc) // open the new encounter in the main pane
  }

  async function removeEncounter(id) {
    try {
      await encountersApi.remove(campaignId, id)
      await load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // Move an encounter to another chapter (or Unsorted, chapterId=''). PUT replaces
  // the resource, so send the whole encounter with the new chapter_id. `moving`
  // disables the selects during the in-flight PUT so a fast double-pick can't race.
  async function moveEncounter(enc, chapterId) {
    setMoving(true)
    try {
      await encountersApi.update(campaignId, enc.id, { ...toEncounterInput(enc), chapter_id: chapterId })
      await load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setMoving(false)
    }
  }

  async function addChapter(name) {
    await chaptersApi.create(campaignId, { name, order: nextChapterOrder(chapters || []) })
    await load()
  }

  async function renameChapter(ch) {
    const name = window.prompt('Rename chapter', ch.name)
    if (!name || name.trim() === '' || name === ch.name) return
    try {
      await chaptersApi.update(campaignId, ch.id, { name: name.trim(), order: ch.order })
      await load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function deleteChapter(ch) {
    if (!window.confirm(`Delete chapter "${ch.name}"? Its encounters move to Unsorted.`)) return
    try {
      await chaptersApi.remove(campaignId, ch.id)
      await load()
    } catch (e) {
      setError(errorMessage(e))
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

  const grouped = groupEncountersByChapter(chapters, encounters)
  // Always render an Unsorted group so it's a drop target even when empty —
  // otherwise you couldn't drag an encounter out of every chapter into Unsorted.
  const groups = grouped.some((g) => g.chapter === null)
    ? grouped
    : [...grouped, { chapter: null, encounters: [] }]

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
              // No-op if dropped back on its own group.
              if (enc && (enc.chapter_id || '') !== chapterId) moveEncounter(enc, chapterId)
            }}
          >
            <div className="chapter-head">
              <button
                className="chapter-toggle"
                aria-expanded={isOpen}
                onClick={() => toggle(key)}
              >
                <span className="chapter-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                <span className="chapter-name">{g.chapter ? g.chapter.name : 'Unsorted'}</span>
              </button>
              {g.chapter && (
                <span className="chapter-actions">
                  <button
                    className="link"
                    aria-label={`Rename chapter ${g.chapter.name}`}
                    onClick={() => renameChapter(g.chapter)}
                  >
                    Rename
                  </button>
                  <button
                    className="link danger"
                    aria-label={`Delete chapter ${g.chapter.name}`}
                    onClick={() => deleteChapter(g.chapter)}
                  >
                    Delete
                  </button>
                </span>
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
                      draggable={e.status !== 'released' && !moving}
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
                      <button
                        className="link danger"
                        aria-label={`Delete ${e.name}`}
                        onClick={() => removeEncounter(e.id)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
                {g.chapter && (
                  <NewEncounterForm
                    onCreate={(name) => addEncounter(g.chapter.id, name)}
                    onError={setError}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
      {/* Always-present bottom controls: add an unsorted encounter, or a chapter.
          This is the only add-encounter path when there are no chapters yet. */}
      <NewEncounterForm
        testid="new-encounter"
        onCreate={(name) => addEncounter(null, name)}
        onError={setError}
      />
      <AddChapterForm onAdd={addChapter} onError={setError} />
    </section>
  )
}

// A per-group "+ encounter" form: its own input state so each chapter adds
// independently. Errors bubble to the tree.
function NewEncounterForm({ onCreate, onError, testid }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      await onCreate(n)
      setName('')
    } catch (err) {
      onError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="new-encounter" data-testid={testid}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ encounter"
        aria-label="new encounter name"
      />
      <button className="primary" disabled={busy || !name.trim()}>Add</button>
    </form>
  )
}

function AddChapterForm({ onAdd, onError }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      await onAdd(n)
      setName('')
    } catch (err) {
      onError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="add-chapter" data-testid="add-chapter">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ chapter"
        aria-label="new chapter name"
      />
      <button className="primary" disabled={busy || !name.trim()}>Add chapter</button>
    </form>
  )
}
