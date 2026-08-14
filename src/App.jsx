import { useEffect, useRef, useState } from 'react'
import { getUser, getAccessToken, login, logout, completeLogin, onUserChange } from './auth/oidc.js'
import { setTokenProvider } from './api/token.js'
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
  // A failed BACKGROUND autosave (a flush after the editor/detail already closed)
  // has no on-screen indicator left, so it surfaces here at the app level. `what`
  // names the record; cleared on dismiss or the next successful save (recovery).
  const [saveError, setSaveError] = useState(null)
  const booted = useRef(false)
  const backToEmpty = () => setView({ kind: 'empty' })
  const onSaved = () => { setReloadKey((k) => k + 1); setSaveError(null) }
  const onSaveError = (what) => setSaveError(what)

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
      setStatus(user ? 'authed' : 'anon')
    })()
    return onUserChange((u) => setStatus(u ? 'authed' : 'anon'))
  }, [])

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
