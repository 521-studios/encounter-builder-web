// Campaign settings CRUD against encounter-builder-api
// (/api/app/campaigns/:id/settings). Same shape as the chapters/encounters
// clients — bearer in X-Access-Token via the shared request(). GET returns the
// campaign's expected-party defaults (an empty object when none saved yet); PUT
// is a full replace (a nil field clears that default).
import { request } from './client.js'

function base(campaignId) {
  return `/api/app/campaigns/${encodeURIComponent(campaignId)}/settings`
}

export const settings = {
  get: (campaignId, opts = {}) => request('GET', base(campaignId), opts),
  put: (campaignId, input, opts = {}) => request('PUT', base(campaignId), { body: input, ...opts }),
}
