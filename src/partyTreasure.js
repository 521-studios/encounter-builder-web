// Whether party-treasure is wired up (encounter-builder-api has PARTY_TREASURE_URL),
// read once from /api/app/me. Release and its receipt hide when it isn't (6m14).
// Anonymous mode has no API, so no party-treasure.
import { useEffect, useState } from 'react'
import { api } from './api/client.js'
import { isAnon } from './api/anon.js'

let cached = null // Promise<boolean>, shared by every editor in the session

export function partyTreasureEnabled() {
  if (isAnon()) return Promise.resolve(false)
  cached ??= api.me().then((me) => me?.party_treasure === true, () => {
    cached = null // a failed /me retries next time instead of hiding Release for good
    return false
  })
  return cached
}

export function resetPartyTreasure() {
  cached = null
}

export function usePartyTreasure() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let live = true
    partyTreasureEnabled().then((v) => live && setEnabled(v))
    return () => {
      live = false
    }
  }, [])
  return enabled
}

// The receipt for a released encounter's push. No push yet (released before the
// push existed, or never recorded) reads as not sent, so Retry can recover it.
export function receipt(push) {
  if (!push) return { sent: false, text: 'Not sent to the party pool.' }
  if (push.error) return { sent: false, text: `Not sent to the party pool: ${push.error}` }
  const n = push.item_count
  return { sent: true, text: `Sent to the party pool: ${n} ${n === 1 ? 'item' : 'items'} (ledger ${push.ledger_id}).` }
}
