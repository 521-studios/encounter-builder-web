import { useEffect, useRef, useState } from 'react'
import { getUser, getAccessToken, login, logout, completeLogin, onUserChange } from './auth/oidc.js'
import { setTokenProvider } from './api/token.js'
import CampaignList from './components/CampaignList.jsx'
import EncounterList from './components/EncounterList.jsx'
import EncounterEditor from './components/EncounterEditor.jsx'

// The API clients pull the bearer from the live OIDC session.
setTokenProvider(getAccessToken)

export default function App() {
  const [status, setStatus] = useState('loading') // loading | anon | authed
  const [error, setError] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [editing, setEditing] = useState(null) // encounter being edited, or null
  const [reloadKey, setReloadKey] = useState(0) // bump to refresh the encounter list
  const booted = useRef(false)

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

      {status === 'loading' && <p>Loading…</p>}
      {status === 'anon' && (
        <button className="primary" onClick={() => login()}>Sign in with lets-roll</button>
      )}
      {status === 'authed' && (
        <>
          <CampaignList
            onSelect={(c) => {
              setCampaign(c)
              setEditing(null)
            }}
            selectedId={campaign?.id}
          />
          {campaign && (
            <section className="selected">
              <h2>{campaign.name}</h2>
              {editing ? (
                <EncounterEditor
                  campaignId={campaign.id}
                  encounterId={editing.id}
                  onClose={() => {
                    setEditing(null)
                    setReloadKey((k) => k + 1)
                  }}
                  onSaved={() => setReloadKey((k) => k + 1)}
                />
              ) : (
                <EncounterList campaignId={campaign.id} reloadKey={reloadKey} onEdit={setEditing} />
              )}
            </section>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
