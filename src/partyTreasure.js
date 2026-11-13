// Whether party-treasure is wired up (encounter-builder-api has PARTY_TREASURE_URL),
// read once from /api/app/me. Release and its receipt hide when it isn't (6m14).
// Anonymous mode has no API, so no party-treasure.
import { useEffect, useState } from 'react'
import { api } from './api/client.js'
import { isAnon } from './api/anon.js'

// The same /me also says whether the lets-roll combat push is wired up
// (combat_push, we5k.2.3); "Run in lets-roll" hides when it isn't.
let cached = null // Promise<me|null>, shared by every editor in the session

function me() {
  if (isAnon()) return Promise.resolve(null)
  cached ??= api.me().catch((e) => {
    console.warn('/api/app/me failed; hiding Release and Run in lets-roll until it succeeds', e)
    cached = null // a failed /me retries next time instead of hiding them for good
    return null
  })
  return cached
}

export function partyTreasureEnabled() {
  return me().then((m) => m?.party_treasure === true)
}

export function combatPushEnabled() {
  return me().then((m) => m?.combat_push === true)
}

export function resetPartyTreasure() {
  cached = null
}

function useFlag(read) {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let live = true
    read().then((v) => live && setEnabled(v))
    return () => {
      live = false
    }
  }, [read])
  return enabled
}

export const usePartyTreasure = () => useFlag(partyTreasureEnabled)
export const useCombatPush = () => useFlag(combatPushEnabled)

// The receipt for a released encounter's push. No push yet (released before the
// push existed, or never recorded) reads as not sent, so Retry can recover it.
export function receipt(push) {
  if (!push) return { sent: false, text: 'Not sent to the party pool.' }
  if (push.error) return { sent: false, text: `Not sent to the party pool: ${push.error}` }
  const n = push.item_count
  return { sent: true, text: `Sent to the party pool: ${n} ${n === 1 ? 'item' : 'items'} (ledger ${push.ledger_id}).` }
}
