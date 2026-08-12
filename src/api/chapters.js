// Chapter CRUD against encounter-builder-api (/api/app/campaigns/:id/chapters).
// Same shape as the encounters client — same-origin through the CloudFront edge,
// bearer in X-Access-Token via the shared request().
import { request } from './client.js'

function base(campaignId) {
  return `/api/app/campaigns/${encodeURIComponent(campaignId)}/chapters`
}

export const chapters = {
  list: (campaignId, opts = {}) => request('GET', base(campaignId), opts),
  create: (campaignId, input, opts = {}) => request('POST', base(campaignId), { body: input, ...opts }),
  update: (campaignId, id, input, opts = {}) =>
    request('PUT', `${base(campaignId)}/${encodeURIComponent(id)}`, { body: input, ...opts }),
  remove: (campaignId, id, opts = {}) => request('DELETE', `${base(campaignId)}/${encodeURIComponent(id)}`, opts),
}
