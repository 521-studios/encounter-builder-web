import { useEffect, useRef, useState } from 'react'
import { getUser, getAccessToken, login, logout, completeLogin, onUserChange } from './auth/oidc.js'
import { api, setTokenProvider } from './api/client.js'

// The API client pulls the bearer from the live OIDC session.
setTokenProvider(getAccessToken)

export default function App() {
  const [status, setStatus] = useState('loading') // loading | anon | authed
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
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

  useEffect(() => {
    if (status !== 'authed') return
    api.me().then(setMe).catch((e) => setError(`Could not load your identity: ${e.message || e}`))
  }, [status])

  return (
    <main className="app">
      <h1>Encounter Builder</h1>
      {status === 'loading' && <p>Loading…</p>}
      {status === 'anon' && (
        <button className="primary" onClick={() => login()}>Sign in with lets-roll</button>
      )}
      {status === 'authed' && (
        <>
          <p>Signed in{me ? ` — ${me.sub}` : ''}.</p>
          {me && <pre className="me">{JSON.stringify(me, null, 2)}</pre>}
          <button onClick={() => logout()}>Sign out</button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  )
}
