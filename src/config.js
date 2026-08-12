// Build-time config. Node-safe (no window / no top-level throw) so the API
// client's module graph can be unit-tested under `node --test`, where Vite's
// import.meta.env isn't injected. Browser-only concerns (redirect URI derived
// from window.location, authority validation) live in src/auth/oidc.js.
const env = import.meta.env ?? {}

export const config = {
  // The lets-roll issuer, baked per-env via VITE_OIDC_AUTHORITY at build time.
  authority: env.VITE_OIDC_AUTHORITY,
  clientId: env.VITE_OIDC_CLIENT_ID || 'encounter-builder-web',
  // API is same-origin (CloudFront routes /api/*); '' keeps fetch paths relative.
  apiBase: env.VITE_API_BASE || '',
}
