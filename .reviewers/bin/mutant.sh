#!/bin/sh
# usage: .reviewers/bin/mutant.sh <src-file> <sed-expr> <test-file>...
# Runs one mutant on a scratch copy (never the checkout), in a 2 GB scope with a
# 120 s timeout. Prints KILLED (tests failed, OOM or timeout) or SURVIVED; never retries.
set -eu
f=$1 expr=$2; shift 2
repo=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/mutant.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
cp -r "$repo/src" "$repo/test" "$repo/package.json" "$tmp/"
ln -s "$repo/node_modules" "$tmp/node_modules"
cd "$tmp"
cp "$f" "$tmp/orig"
sed -i "$expr" "$f"
cmp -s "$f" "$tmp/orig" && { echo "NOOP: $expr matched nothing in $f"; exit 2; }
if systemd-run --user --scope -q -p MemoryMax=2G -p MemorySwapMax=0 \
  timeout 120 node --import ./test/support/setup-dom.mjs --test --test-concurrency=1 "$@" >/dev/null 2>&1
then echo "SURVIVED: $expr"
else echo "KILLED (exit $?): $expr"
fi
