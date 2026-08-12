#!/usr/bin/env bash
# Invalidate index.html at the edge so a new deploy is served immediately.
# The distribution is owned by infra-frontend; resolve it by alias (workspace
# rule: look up shared primitives by name, no remote-state reads).
#
# Soft-fail when no distribution exists yet: encounter-builder-cf lands in a
# separate infra-frontend apply, so early web deploys legitimately run before
# the edge exists. A missing distribution is not a deploy failure here.
set -euo pipefail

DOMAIN="${1:?usage: invalidate.sh <site-domain>}"

DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?@=='${DOMAIN}']].Id | [0]" \
  --output text)

if [ "$DIST_ID" = "None" ] || [ -z "$DIST_ID" ]; then
  echo "⚠ No CloudFront distribution for ${DOMAIN} yet (encounter-builder-cf not applied). Skipping invalidation."
  exit 0
fi

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/" "/index.html"
