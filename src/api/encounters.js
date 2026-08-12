// Encounter CRUD against encounter-builder-api (/api/app/campaigns/:id/encounters).
// Same-origin through the CloudFront edge, so it uses the shared request() (bearer
// in X-Access-Token). campaignId is the lets-roll game id.
import { request } from './client.js'

function base(campaignId) {
  return `/api/app/campaigns/${encodeURIComponent(campaignId)}/encounters`
}

export const encounters = {
  list: (campaignId, opts = {}) => request('GET', base(campaignId), opts),
  get: (campaignId, id, opts = {}) => request('GET', `${base(campaignId)}/${encodeURIComponent(id)}`, opts),
  create: (campaignId, input, opts = {}) => request('POST', base(campaignId), { body: input, ...opts }),
  update: (campaignId, id, input, opts = {}) =>
    request('PUT', `${base(campaignId)}/${encodeURIComponent(id)}`, { body: input, ...opts }),
  remove: (campaignId, id, opts = {}) => request('DELETE', `${base(campaignId)}/${encodeURIComponent(id)}`, opts),
  release: (campaignId, id, opts = {}) =>
    request('POST', `${base(campaignId)}/${encodeURIComponent(id)}/release`, opts),
}
