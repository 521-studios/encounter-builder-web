// Chapter CRUD against encounter-builder-api (/api/app/campaigns/:id/chapters).
// Same shape as the encounters client — same-origin through the CloudFront edge,
// bearer in X-Access-Token via the shared request().
import { request } from './client.js'
import { isAnon } from './anon.js'
import { localStore } from '../store/localStore.js'

function base(campaignId) {
  return `/api/app/campaigns/${encodeURIComponent(campaignId)}/chapters`
}

export const chapters = {
  list: (campaignId, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.chapters.list()) : request('GET', base(campaignId), opts),
  create: (campaignId, input, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.chapters.create(input)) : request('POST', base(campaignId), { body: input, ...opts }),
  update: (campaignId, id, input, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.chapters.update(id, input)) : request('PUT', `${base(campaignId)}/${encodeURIComponent(id)}`, { body: input, ...opts }),
  remove: (campaignId, id, opts = {}) =>
    isAnon() ? Promise.resolve(localStore.chapters.remove(id)) : request('DELETE', `${base(campaignId)}/${encodeURIComponent(id)}`, opts),
}
