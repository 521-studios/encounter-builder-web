import { useEffect, useState } from 'react'
import { pfsrd2 } from './api/pfsrd2.js'

// The skill-check picker options: Perception (a proficiency, not a skill in the data —
// the odd one out — pinned on top and the default) followed by the standard character
// skills from the data API. Fetched once and cached module-wide; each option is
// { name, ability } so the picker can render an "Acrobatics (Dex)" label.
const PERCEPTION = { name: 'Perception', ability: 'wis' }
let cache = null // resolved character skills (no Perception)
let inflight = null

function load() {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = pfsrd2
      .listSkills()
      .then((s) => {
        cache = Array.isArray(s) ? s : []
        return cache
      })
      .catch(() => {
        inflight = null // let a later mount retry a failed fetch
        return []
      })
  }
  return inflight
}

const withPerception = (list) => [PERCEPTION, ...list.filter((s) => s.name !== 'Perception')]

export function useSkills() {
  const [skills, setSkills] = useState(() => withPerception(cache || []))
  useEffect(() => {
    let alive = true
    load().then((s) => alive && setSkills(withPerception(s)))
    return () => {
      alive = false
    }
  }, [])
  return skills
}

// "dex" → "Dex" for the picker label.
export const abilityLabel = (a) => (a ? a[0].toUpperCase() + a.slice(1) : '')
