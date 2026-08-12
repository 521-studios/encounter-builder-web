import { useEffect, useRef, useState } from 'react'
import { getUser, getAccessToken, login, logout, completeLogin, onUserChange } from './auth/oidc.js'
import { setTokenProvider } from './api/token.js'
import CampaignList from './components/CampaignList.jsx'

// The API clients pull the bearer from the live OIDC session.
setTokenProvider(getAccessToken)

export default function App() {
  const [status, setStatus] = useState('loading') // loading | anon | authed
  const [error, setError] = useState(null)
  const [campaign, setCampaign] = useState(null)
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
          <CampaignList onSelect={setCampaign} selectedId={campaign?.id} />
          {campaign && (
            <section className="selected">
              <h2>{campaign.name}</h2>
              <p className="muted">Encounter building for this campaign is coming next.</p>
            </section>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
