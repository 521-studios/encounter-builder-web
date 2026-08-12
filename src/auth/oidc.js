// OIDC Authorization Code + PKCE against lets-roll's Doorkeeper provider.
//
// lets-roll issues RS256 JWT *access tokens* (access_token_generator '::Oidc')
// with aud = the client_id, verifiable via the provider's JWKS — that is the
// token the cluster APIs (encounter-builder-api) verify. So the bearer we send
// to the API is `user.access_token`, not the id_token. Access tokens expire in
// 15 min and refresh tokens are issued, so automaticSilentRenew keeps a working
// session across a long encounter-building sitting.
import { UserManager, WebStorageStateStore } from 'oidc-client-ts'
import { config } from '../config.js'

if (!config.authority) {
  // Fail loud: a missing authority silently breaks login otherwise.
  throw new Error('VITE_OIDC_AUTHORITY is required (the lets-roll issuer URL)')
}

// Derived from the current origin so the same build works on localhost, staging,
// and prod — each origin's /auth/callback is a registered redirect on the provider.
const redirectUri = `${window.location.origin}/auth/callback`

const userManager = new UserManager({
  authority: config.authority, // discovery at ${authority}/.well-known/openid-configuration
  client_id: config.clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code', // PKCE is applied automatically for the code flow
  scope: 'openid',
  automaticSilentRenew: true, // uses the refresh token (15-min access token)
  userStore: new WebStorageStateStore({ store: window.localStorage }),
})

export function onUserChange(cb) {
  userManager.events.addUserLoaded((u) => cb(u))
  userManager.events.addUserUnloaded(() => cb(null))
  userManager.events.addAccessTokenExpired(() => cb(null))
  return () => {
    userManager.events.removeUserLoaded(cb)
    userManager.events.removeUserUnloaded(cb)
  }
}

export function login() {
  return userManager.signinRedirect()
}

// Called on /auth/callback: exchanges the code (+ PKCE verifier) for tokens.
export function completeLogin() {
  return userManager.signinRedirectCallback()
}

// Local logout: clear the SPA session and return home. (RP-initiated logout at
// the provider is a later slice — depends on Doorkeeper end_session support.)
export async function logout() {
  await userManager.removeUser()
  window.location.assign('/')
}

export async function getUser() {
  const user = await userManager.getUser()
  return user && !user.expired ? user : null
}

export async function getAccessToken() {
  const user = await getUser()
  return user ? user.access_token : null
}
