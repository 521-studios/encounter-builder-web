// Thin client for the encounter-builder-api (/api/app/*). The bearer rides in
// X-Access-Token, not Authorization: behind CloudFront OAC the Authorization
// header is overwritten by the OAC SigV4 signature, so the API reads the token
// from X-Access-Token (forwarded untouched by the origin-request-policy). This
// works identically for local dev (Vite proxies /api to the staging edge).
import { config } from '../config.js'
import { getToken } from './token.js'

export class ApiError extends Error {
  constructor(status, body) {
    super(`API request failed: ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// Pure: build request headers. Exported for unit testing.
export function buildHeaders(token, { json = false } = {}) {
  const headers = {}
  if (json) headers['Content-Type'] = 'application/json'
  if (token) headers['X-Access-Token'] = token
  return headers
}

// Hex SHA-256 of the request body. CloudFront OAC signs the Lambda Function URL
// request with SigV4; a bodied request MUST carry the payload hash in
// x-amz-content-sha256 or the OAC signature (which omits the body) mismatches
// and the Function URL rejects it with 403 before it reaches the app.
export async function bodyHash(bodyStr) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyStr))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// tokenProvider is injectable for testing; defaults to the wired OIDC session.
export async function request(method, path, { body, tokenProvider = getToken, fetchImpl = fetch } = {}) {
  const token = await tokenProvider()
  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined
  const headers = buildHeaders(token, { json: bodyStr !== undefined })
  if (bodyStr !== undefined) {
    headers['x-amz-content-sha256'] = await bodyHash(bodyStr) // required for OAC SigV4 on bodied requests
  }
  const res = await fetchImpl(config.apiBase + path, { method, headers, body: bodyStr })
  if (!res.ok) throw new ApiError(res.status, await parseBody(res))
  return res.status === 204 ? null : parseBody(res)
}

export const api = {
  me: (opts) => request('GET', '/api/app/me', opts),
}
