#!/usr/bin/env bash
# Upload the static site to S3: an immutable per-sha prefix (history/rollback)
# and the stable /current prefix CloudFront serves. index.html is no-cache so a
# fresh bundle is picked up on invalidation; everything else is immutable.
set -euo pipefail

BUCKET="${1:?usage: upload-site.sh <bucket> <sha>}"
SHA="${2:?usage: upload-site.sh <bucket> <sha>}"
SRC="dist"

for prefix in "$SHA" current; do
  extra=()
  [ "$prefix" = current ] && extra=(--delete) # keep /current an exact mirror
  aws s3 sync "$SRC/" "s3://${BUCKET}/${prefix}/" \
    "${extra[@]}" \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html"
  aws s3 cp "$SRC/index.html" "s3://${BUCKET}/${prefix}/index.html" \
    --cache-control "no-cache"
done
