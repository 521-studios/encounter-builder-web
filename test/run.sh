#!/bin/sh
# `npm test`, cheap by default (after the 2026-11-10 ares OOMs): one run at a time per
# checkout (worktrees share the lock through their symlinked node_modules), 2 workers,
# a 2 GB heap per worker. `npm test -- src/foo.test.js` runs just that file, same limits.
if command -v flock >/dev/null; then
  exec 9>node_modules/.test.lock
  flock -w 600 9 || { echo 'npm test: another run in this checkout held the lock for 10 min' >&2; exit 1; }
fi
# shellcheck disable=SC2046 # test paths have no spaces
[ "$#" -gt 0 ] || set -- $(find src -name '*.test.js')
NODE_OPTIONS="--max-old-space-size=2048 ${NODE_OPTIONS:-}" exec node --import ./test/support/setup-dom.mjs --test --test-concurrency=2 "$@"
