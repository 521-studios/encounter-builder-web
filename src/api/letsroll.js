// Client for lets-roll's /api/v1 (campaigns/membership). Unlike encounter-builder-api
// (fronted by CloudFront OAC, which forces the bearer into X-Access-Token), lets-roll
// is called CROSS-ORIGIN at its own host (config.authority), so the bearer rides in a
// normal `Authorization: Bearer` header. lets-roll CORS allows *.521studios.com.
import { config } from '../config.js'
import { getToken } from './token.js'
import { isAnon } from './anon.js'
import { localStore } from '../store/localStore.js'

export class LetsRollError extends Error {
  constructor(status, body) {
    super(`lets-roll request failed: ${status}`)
    this.name = 'LetsRollError'
    this.status = status
    this.body = body
  }
}

// Pure: the cross-origin auth header. Exported for unit testing.
export function letsRollHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
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

// GET ${authority}/api/v1/games -> [{ id, name, gm_user_id, am_gm }]
// In anon mode there's no lets-roll session — return the one synthetic campaign
// the localStore backs, so CampaignList has something to show.
export async function fetchGames({ tokenProvider = getToken, fetchImpl = fetch } = {}) {
  if (isAnon()) return localStore.games()
  const token = await tokenProvider()
  const res = await fetchImpl(`${config.authority}/api/v1/games`, {
    headers: { Accept: 'application/json', ...letsRollHeaders(token) },
  })
  if (!res.ok) throw new LetsRollError(res.status, await parseBody(res))
  return parseBody(res)
}
