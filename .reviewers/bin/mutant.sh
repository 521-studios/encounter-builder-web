#!/bin/sh
# usage: .reviewers/bin/mutant.sh <src-file> <sed-expr> <test-file.test.js>...
# Runs one mutant on a scratch copy (never the checkout), in a 2 GB scope with a
# 120 s timeout. Prints KILLED (tests failed, OOM or timeout), SURVIVED, NOOP, or
# BROKEN when the unmutated tests already fail; never retries.
set -eu
f=$1 expr=$2; shift 2
[ "$#" -gt 0 ] || { echo "usage: mutant.sh <src-file> <sed-expr> <test-file.test.js>..."; exit 2; }
for p in "$f" "$@"; do
  case $p in /*|*..*) echo "refusing $p: give paths relative to the repo root"; exit 2 ;; esac
done
for t in "$@"; do
  case $t in *.test.js) ;; *) echo "refusing $t: not a *.test.js file, so no test would run"; exit 2 ;; esac
done
repo=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/mutant.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cp -r "$repo/src" "$repo/test" "$repo/package.json" "$tmp/"
ln -s "$repo/node_modules" "$tmp/node_modules"
cd "$tmp"
root=$(pwd -P)
for p in "$f" "$@"; do
  [ -f "$p" ] || { echo "no such file: $p"; exit 2; }
  # node_modules is a symlink to the checkout: anything resolving outside the
  # copy (./node_modules/x included) would mutate the real file.
  case $(realpath "$p") in "$root"/*) ;; *) echo "refusing $p: resolves outside the scratch copy"; exit 2 ;; esac
done
run() {
  systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
    timeout 120 node --import ./test/support/setup-dom.mjs --test --test-concurrency=1 "$@" >/dev/null 2>&1
}
# A failing baseline (broken tests, or systemd-run itself failing) would read as KILLED.
run "$@" || { echo "BROKEN (exit $?): the unmutated tests fail, so no mutant can be judged"; exit 2; }
cp "$f" "$tmp/orig"
sed -i "$expr" "$f"
cmp -s "$f" "$tmp/orig" && { echo "NOOP: $expr matched nothing in $f"; exit 2; }
if run "$@"
then echo "SURVIVED: $expr"
else echo "KILLED (exit $?): $expr"
fi
