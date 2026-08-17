// Encounter CRUD. This is now a thin re-export of the shared store (see
// store/store.js), which routes to the api backend (encounter-builder-api,
// bearer in X-Access-Token) or the local backend (localStore) depending on
// isAnon(). Kept as its own module so every component's import is unchanged.
import { store } from '../store/store.js'

export const encounters = store.encounters
