import { useCallback, useEffect, useRef, useState } from 'react'
import { getUser, getAccessToken, login, logout, completeLogin, onUserChange } from './auth/oidc.js'
import { setTokenProvider } from './api/token.js'
import { fetchGames } from './api/letsroll.js'
import { chapters as chaptersApi } from './api/chapters.js'
import { parseLocation, urlFor } from './router.js'
import CampaignList from './components/CampaignList.jsx'
import CampaignSwitcher from './components/CampaignSwitcher.jsx'
import ChapterTree from './components/ChapterTree.jsx'
import EncounterEditor from './components/EncounterEditor.jsx'
import CampaignDetail from './components/CampaignDetail.jsx'
import ChapterDetail from './components/ChapterDetail.jsx'

// The API clients pull the bearer from the live OIDC session.
setTokenProvider(getAccessToken)

export default function App() {
  const [status, setStatus] = useState('loading') // loading | anon | authed
  const [error, setError] = useState(null)
  const [campaign, setCampaign] = useState(null)
  // What the main pane shows: an encounter editor, the campaign/chapter detail
  // pages, or nothing. { kind: 'empty' | 'encounter' | 'campaign' | 'chapter', … }
  const [view, setView] = useState({ kind: 'empty' })
  const [reloadKey, setReloadKey] = useState(0) // bump to refresh the sidebar tree
  // An autosave failure with no lasting on-screen indicator surfaces here at the
  // app level: a flush that failed AFTER its editor/detail closed (EncounterEditor's
  // flush-on-leave), and — since the detail pages route useAutosave's onError here —
  // a still-open campaign/chapter save failure too (alongside its inline indicator).
  // `what` names the record. Cleared only on Dismiss: auto-clearing on the next
  // successful save would wrongly wipe record X's warning when a DIFFERENT record
  // then saves (views are mutually exclusive), re-masking X's unsaved edit.
  const [saveError, setSaveError] = useState(null)
  const booted = useRef(false)
  const backToEmpty = () => setView({ kind: 'empty' })
  const onSaved = () => setReloadKey((k) => k + 1)
  const onSaveError = (what) => setSaveError(what)

  // Restore the campaign + main view from the query string (deep-link, reload, and
  // back/forward). The campaign object comes from the games list; a chapter view
  // needs its full record (ChapterDetail reads name/party/order), so we fetch the
  // campaign's chapters and match by id. An encounter view needs only the id. Any
  // failure (stale link, network) degrades to the campaign list rather than a broken
  // pane. Stable (only setters + module imports), so effects can depend on it.
  const restoreFromSearch = useCallback(async (search) => {
    const { campaignId, view: target } = parseLocation(search)
    if (!campaignId) {
      setCampaign(null)
      setView({ kind: 'empty' })
      return
    }
    try {
      const games = await fetchGames()
      // lets-roll game ids are numeric; the URL param is a string — compare as strings.
      const c = games.find((g) => String(g.id) === campaignId && g.am_gm)
      if (!c) {
        setCampaign(null)
        setView({ kind: 'empty' })
        return
      }
      setCampaign(c)
      if (target.kind === 'encounter') {
        setView({ kind: 'encounter', enc: { id: target.encounterId } })
      } else if (target.kind === 'chapter') {
        const all = await chaptersApi.list(c.id)
        const ch = all.find((x) => String(x.id) === target.chapterId)
        setView(ch ? { kind: 'chapter', chapter: ch } : { kind: 'empty' })
      } else if (target.kind === 'campaign') {
        setView({ kind: 'campaign' })
      } else {
        setView({ kind: 'empty' })
      }
    } catch {
      setCampaign(null)
      setView({ kind: 'empty' })
    }
  }, [])

  useEffect(() => {
    if (booted.current) return // once, even under StrictMode (the auth code is single-use)
    booted.current = true
    ;(async () => {
      if (window.location.pathname === '/auth/callback') {
        try {
          await completeLogin()
        } catch (e) {
          setError(`Sign-in failed: ${e.message || e}`)
        }
        window.history.replaceState({}, '', '/') // drop code/state from the URL
      }
      const user = await getUser()
      if (!user) {
        setStatus('anon')
        return
      }
      // Restore the deep-linked view before revealing the app, so a reload lands back
      // on the same encounter/chapter instead of flashing the campaign list.
      await restoreFromSearch(window.location.search)
      setStatus('authed')
    })()
    return onUserChange((u) => setStatus(u ? 'authed' : 'anon'))
  }, [restoreFromSearch])

  // Reflect the current nav state in the URL so reload/back/forward and shareable
  // deep-links work. Guarded on a real change so restore (which sets state to match
  // the URL) doesn't push a redundant entry — and so back/forward, which change the
  // URL first, don't get a spurious push when restore re-syncs the state.
  useEffect(() => {
    if (status !== 'authed') return
    const target = urlFor(campaign?.id, view)
    if (target !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', target)
    }
  }, [campaign, view, status])

  // Back/forward: re-derive the view from the (already-updated) URL.
  useEffect(() => {
    if (status !== 'authed') return
    const onPop = () => restoreFromSearch(window.location.search)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [status, restoreFromSearch])

  return (
    <main className="app">
      <header className="topbar">
        <h1>Encounter Builder</h1>
        {status === 'authed' && (
          <button className="link" onClick={() => logout()}>Sign out</button>
        )}
      </header>

      {saveError && (
        <div className="save-error-banner" role="alert" data-testid="save-error-banner">
          A background save failed — your last change to {saveError} may not have been saved. Re-open it and check.{' '}
          <button type="button" className="link" onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}

      {status === 'loading' && <p>Loading…</p>}
      {status === 'anon' && (
        <button className="primary" onClick={() => login()}>Sign in with lets-roll</button>
      )}
      {status === 'authed' && !campaign && (
        <CampaignList
          onSelect={(c) => {
            setCampaign(c)
            backToEmpty()
          }}
        />
      )}

      {status === 'authed' && campaign && (
        <div className="two-pane">
          <aside className="sidebar">
            <CampaignSwitcher
              campaign={campaign}
              onSwitch={() => {
                setCampaign(null)
                backToEmpty()
              }}
              onSettings={() => setView({ kind: 'campaign' })}
            />
            <ChapterTree
              campaignId={campaign.id}
              reloadKey={reloadKey}
              onEdit={(enc) => setView({ kind: 'encounter', enc })}
              onEditChapter={(chapter) => setView({ kind: 'chapter', chapter })}
              selectedId={view.kind === 'encounter' ? view.enc.id : null}
            />
          </aside>
          <section className="main">
            {view.kind === 'encounter' && (
              <EncounterEditor
                // Remount per encounter so autosave refs (dirty/saving/enc) are
                // isolated: switching mid-save must not reset the outgoing
                // encounter's dirty flag and drop its last edit.
                key={view.enc.id}
                campaignId={campaign.id}
                encounterId={view.enc.id}
                onClose={() => {
                  backToEmpty()
                  setReloadKey((k) => k + 1)
                }}
                onSaved={onSaved}
                onSaveError={onSaveError}
                onDeleted={() => {
                  backToEmpty()
                  setReloadKey((k) => k + 1)
                }}
              />
            )}
            {view.kind === 'campaign' && (
              <CampaignDetail
                campaign={campaign}
                onClose={backToEmpty}
                onSaved={onSaved}
                onSaveError={onSaveError}
              />
            )}
            {view.kind === 'chapter' && (
              <ChapterDetail
                key={view.chapter.id}
                campaignId={campaign.id}
                chapter={view.chapter}
                onClose={() => {
                  backToEmpty()
                  setReloadKey((k) => k + 1)
                }}
                onSaved={onSaved}
                onSaveError={onSaveError}
                onDeleted={() => {
                  backToEmpty()
                  setReloadKey((k) => k + 1)
                }}
              />
            )}
            {view.kind === 'empty' && (
              <div className="empty-main" data-testid="empty-main">
                Select an encounter, or create one in the sidebar.
              </div>
            )}
          </section>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
