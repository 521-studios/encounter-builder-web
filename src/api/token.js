// Shared bearer-token provider for the API clients. Injected once at startup
// (App wires it to the OIDC session) so the client modules stay decoupled from
// the browser-only auth code and remain unit-testable under `node --test`.
let provider = async () => null

export function setTokenProvider(fn) {
  provider = fn
}

export function getToken() {
  return provider()
}
