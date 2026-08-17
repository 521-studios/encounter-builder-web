// Chapter CRUD — a thin re-export of the shared store (store/store.js), which
// routes to the api or local backend by isAnon(). Kept as its own module so
// component imports are unchanged.
import { store } from '../store/store.js'

export const chapters = store.chapters
