# encounter-builder-web

GM single-page app for the Encounter Builder, part of the 521 cluster. Authenticates
against lets-roll's OIDC provider (Authorization Code + PKCE) and calls
encounter-builder-api at `/api/app/*`. Architecture:
`../521-architect/docs/architecture/encounter-treasure-cluster.md`.

## Status

Skeleton: owns the SPA S3 bucket + a placeholder site + the deploy pipeline. The
React app (OIDC login, campaign list, encounter builder UI, pfsrd2-display
`CreatureStatBlock` integration) lands next, built into this same bucket/pipeline.

## Layout
```
encounter-builder-web/
├── terraform/       # S3 bucket that holds the SPA (app layer owns it)
├── site/            # static site synced to the bucket (placeholder for now)
├── scripts/         # upload-site.sh, invalidate.sh (used by deploy.yml)
└── .github/workflows/  # ci.yml (fmt/validate/shellcheck), deploy.yml (guarded CD)
```

## Edge

The bucket is fronted by infra-frontend's `encounter-builder-cf` module (owns the
CloudFront distribution + DNS + `/api/*` routing to Lambda Function URLs via OAC).
This repo SHALL NOT own CloudFront/DNS — see the layering in `../infra-frontend`.
`encounter-builder-cf` reads this repo's `s3_bucket_*` outputs from remote state.

## Deploy

Staging auto-deploys on merge to `main`; production is manual `workflow_dispatch`
(main only). Deploy = `terraform apply` (bucket) → sync `site/` to `s3://.../current`
→ CloudFront invalidation (soft-fails until the edge exists). Domains:
`encounters.staging.521studios.com`, `encounters.521studios.com`.
