// Test bootstrap for `node --test`: registers the JSX load hook and installs a
// jsdom DOM so React components/hooks can be rendered with @testing-library/react
// (which needs a real document + effects, unlike renderToStaticMarkup). Wired via
// `node --import ./test/support/setup-dom.mjs`. Pure-logic tests ignore all this.
import { register } from 'node:module'
import { JSDOM } from 'jsdom'

register('./jsx-loader.mjs', import.meta.url)

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom

globalThis.window = window
globalThis.document = window.document
// Node 24 ships a read-only global `navigator` getter, so assignment throws —
// redefine it to jsdom's so @testing-library/react's env checks pass.
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true })
// The DOM globals react-dom / @testing-library reach for by bare name.
for (const key of [
  'HTMLElement', 'HTMLIFrameElement', 'Node', 'Element', 'Text', 'DocumentFragment',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
  'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'DOMParser',
]) {
  if (window[key] !== undefined && globalThis[key] === undefined) globalThis[key] = window[key]
}
// localStorage is a bare global in the browser; expose jsdom's so code that
// persists to it (e.g. the anon localStore) exercises the real path in tests.
if (globalThis.localStorage === undefined) globalThis.localStorage = window.localStorage

// React Flow (the chapter map) reaches for browser APIs jsdom lacks. Minimal stubs so
// it mounts without crashing — it can't lay out nodes without real dimensions, but its
// container + our surrounding chrome (title, legend) render, which is what we assert.
if (globalThis.ResizeObserver === undefined) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
}
window.ResizeObserver = globalThis.ResizeObserver
if (globalThis.DOMMatrixReadOnly === undefined) {
  globalThis.DOMMatrixReadOnly = class { constructor() { this.m22 = 1 } }
}
window.DOMMatrixReadOnly = globalThis.DOMMatrixReadOnly
if (typeof window.matchMedia !== 'function') {
  const mql = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
  window.matchMedia = mql
  globalThis.matchMedia = mql
}

// React 18 wants this flag set to route state updates through act() cleanly.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
