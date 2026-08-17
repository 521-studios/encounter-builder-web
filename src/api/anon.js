// Anonymous ("no sign-in") mode flag — a module-level singleton, mirroring
// token.js. When set, the encounter/chapter/settings/letsroll API clients
// delegate to the in-browser localStore instead of calling the server (which
// would 401 without a bearer), and App.jsx skips OIDC login + the /api/v1
// campaign fetch. pfsrd2 reads are untouched — they already work tokenless.
//
// This is the seam for the quick, no-account encounter builder (a distinct
// product surface from the authed campaign app — see the project memory). The
// store it points at is the shared core we'll later fill from the API too.
let anon = false

export function setAnon(v) {
  anon = Boolean(v)
}

export function isAnon() {
  return anon
}
