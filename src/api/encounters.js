// Encounter CRUD against encounter-builder-api (/api/app/campaigns/:id/encounters).
// Same-origin through the CloudFront edge, so it uses the shared request() (bearer
// in X-Access-Token). campaignId is the lets-roll game id.
import { request } from './client.js'
import { isAnon } from './anon.js'
import { localStore } from '../store/localStore.js'

function base(campaignId) {
  return `/api/app/campaigns/${encodeURIComponent(campaignId)}/encounters`
}

// In anon mode the store IS the backend — return a resolved promise so callers'
// `await` works identically to the network path.
export const encounters = {
  list: (campaignId, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.encounters.list()) : request('GET', base(campaignId), opts),
  get: (campaignId, id, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.encounters.get(id)) : request('GET', `${base(campaignId)}/${encodeURIComponent(id)}`, opts),
  create: (campaignId, input, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.encounters.create(input)) : request('POST', base(campaignId), { body: input, ...opts }),
  update: (campaignId, id, input, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.encounters.update(id, input)) : request('PUT', `${base(campaignId)}/${encodeURIComponent(id)}`, { body: input, ...opts }),
  remove: (campaignId, id, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.encounters.remove(id)) : request('DELETE', `${base(campaignId)}/${encodeURIComponent(id)}`, opts),
  release: (campaignId, id, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.encounters.release(id)) : request('POST', `${base(campaignId)}/${encodeURIComponent(id)}/release`, opts),
}
