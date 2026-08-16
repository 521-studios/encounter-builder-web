import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSaveErrorOnSave } from './model.js'
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
  // An autosave failure surfaces here at the app level so it isn't lost when its
  // editor's inline indicator is gone: a flush that failed AFTER its editor/detail
  // closed (EncounterEditor's flush-on-leave), an encounter autosave that failed
  // mid-flight then Closed (EncounterEditor's mounted catch), and a still-open
  // campaign/chapter save failure (routed from useAutosave's onError, alongside its
  // inline indicator). Shape is { what, id }: `what` names the record, `id` keys it.
  // Cleared on Dismiss OR when the SAME record (matching id) next saves — id-keying is
  // what lets same-record recovery auto-clear without a DIFFERENT record's save wiping
  // record X's still-unsaved warning (views are mutually exclusive).
  const [saveError, setSaveError] = useState(null)
  const booted = useRef(false)
  const backToEmpty = () => setView({ kind: 'empty' })
  const onSaved = (saved) => {
    setReloadKey((k) => k + 1)
    // Same-record recovery: clear the banner only when THIS record's save succeeds
    // (id-keyed), so a different record saving can't re-mask X's unsaved warning.
    setSaveError((prev) => clearSaveErrorOnSave(prev, saved))
  }
  const onSaveError = (what, id) => setSaveError({ what, id })
  // Any successful save of a record clears its stale error banner (id-keyed) — including
  // edits that don't change sidebar-visible state, so EncounterEditor's signature-gated
  // onSaved never fires (a description fix recovering from a failed autosave). Chapter/
  // campaign saves clear through onSaved directly (they fire it on every save).
  const onSaveOk = (id) => setSaveError((prev) => clearSaveErrorOnSave(prev, { id }))

  // Restore the campaign + main view from the query string (deep-link, reload, and
  // back/forward). The campaign object comes from the games list; a chapter view
  // needs its full record (ChapterDetail reads name/party/order), so we fetch the
  // campaign's chapters and match by id. An encounter view needs only the id. A
  // failure that can't resolve the campaign at all (stale/unknown campaign, or a
  // failed games fetch) degrades to the campaign list; a failure to resolve a chapter
  // within a loaded campaign keeps the campaign and shows its empty pane. Stable
  // (only setters + module imports), so effects can depend on it.
  const restoreFromSearch = useCallback(async (search) => {
    const toCampaignList = () => {
      setCampaign(null)
      setView({ kind: 'empty' })
    }
    const { campaignId, view: target } = parseLocation(search)
    if (!campaignId) return toCampaignList()
    try {
      const games = await fetchGames()
      // lets-roll game ids are numeric; the URL param is a string — compare as strings.
      const c = games.find((g) => String(g.id) === campaignId && g.am_gm)
      if (!c) return toCampaignList()

      // Resolve the view (including any awaited fetch) BEFORE committing state, so
      // campaign + view land in a single render. If setCampaign committed before an
      // awaited chapter fetch, the URL-sync effect could fire on the intermediate
      // campaign-only state and clobber the more-specific chapter URL on back/forward.
      let nextView
      if (target.kind === 'encounter') {
        nextView = { kind: 'encounter', enc: { id: target.encounterId } }
      } else if (target.kind === 'chapter') {
        try {
          const all = await chaptersApi.list(c.id)
          const ch = all.find((x) => String(x.id) === target.chapterId)
          nextView = ch ? { kind: 'chapter', chapter: ch } : { kind: 'empty' }
        } catch (e) {
          // A chapter-fetch failure degrades to the loaded campaign's empty pane —
          // not all the way back to the campaign list, which would drop the campaign.
          console.error('Encounter Builder: could not load the deep-linked chapter:', e)
          nextView = { kind: 'empty' }
        }
      } else if (target.kind === 'campaign') {
        nextView = { kind: 'campaign' }
      } else {
        nextView = { kind: 'empty' }
      }
      setCampaign(c)
      setView(nextView)
    } catch (e) {
      // Stale link / games fetch failed: degrade to the campaign list (which surfaces
      // its own load error), logging so the failure isn't silent.
      console.error('Encounter Builder: could not restore navigation from the URL:', e)
      toCampaignList()
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
          A background save failed — your last change to {saveError.what} may not have been saved. Re-open it and check.{' '}
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
                onSaveOk={onSaveOk}
                onDeleted={() => {
                  backToEmpty()
                  setReloadKey((k) => k + 1)
                }}
                onOpenEncounter={(id) => setView({ kind: 'encounter', enc: { id } })}
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
                onOpenEncounter={(id) => setView({ kind: 'encounter', enc: { id } })}
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
