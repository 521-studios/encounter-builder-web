# encounter-builder-web

GM single-page app for the Encounter Builder, part of the 521 cluster. Authenticates
against lets-roll's OIDC provider (Authorization Code + PKCE) and calls
encounter-builder-api at `/api/app/*`. Architecture:
`../521-architect/docs/architecture/encounter-treasure-cluster.md`.

## Status

Vite + React SPA, live on staging and prod. Built: OIDC login, campaign/chapter/
encounter authoring (Config/Encounter/Exits tabs, one ordered content list of every
item type), pfsrd2-display stat blocks, treasure budget + pools, skill checks, XP,
chapter map (React Flow), release to party-treasure, print sheet, and an anon
no-sign-in builder. All reads/writes go through one store (`src/store/store.js`)
with an optimistic autosave flush layer. Open work lives in beads (bd_521Studios).

E2E (`npm run e2e`) runs against deployed staging and needs `EB_EMAIL` /
`EB_PASSWORD` (the staging GM login) in env; CI reads them from repo secrets.

## Auth

Login uses `oidc-client-ts` (`src/auth/oidc.js`) against lets-roll's Doorkeeper
provider (authority = `VITE_OIDC_AUTHORITY`, baked per-env at build). lets-roll
issues **RS256 JWT access tokens** (aud = the client_id `encounter-builder-web`),
so the bearer sent to the API is `user.access_token`. It rides in **`X-Access-Token`**
(not `Authorization`, which CloudFront OAC overwrites) — the client attaches it via
`setTokenProvider`. Access tokens expire in 15 min; refresh tokens drive
`automaticSilentRenew`. The redirect URI is derived from `window.location.origin`,
so one build works on localhost/staging/prod.

## Layout
```
encounter-builder-web/
├── src/             # React SPA (config, auth/oidc, api/client, App)
├── terraform/       # S3 bucket that holds the SPA (app layer owns it)
├── scripts/         # upload-site.sh (syncs dist/), invalidate.sh
└── .github/workflows/  # ci.yml (SPA build+test, terraform fmt/validate/shellcheck), deploy.yml
```

## Dev
```bash
npm install
npm run dev     # http://localhost:5173 — auths against staging lets-roll,
                # proxies /api to the staging edge (vite.config.js)
npm test        # node --test — pure logic AND React component/hook tests (no Jest/Vitest;
                # jsdom + @testing-library/react via test/support/setup-dom.mjs).
                # test/run.sh: one run per checkout (flock), 2 workers, 2 GB heap each
npm test -- src/foo.test.js   # one file, same limits (prefer this to bare node --test)
.reviewers/bin/mutant.sh <src> <sed-expr> <test>...  # one mutant: scratch copy, 2G scope, 120 s; OOM/timeout = killed
npm run build   # dist/ (needs VITE_OIDC_AUTHORITY)
```

## Edge

The bucket is fronted by infra-frontend's `encounter-builder-cf` module (owns the
CloudFront distribution + DNS + `/api/*` routing to Lambda Function URLs via OAC).
This repo SHALL NOT own CloudFront/DNS — see the layering in `../infra-frontend`.
`encounter-builder-cf` reads this repo's `s3_bucket_*` outputs from remote state.

## Deploy

Staging auto-deploys on merge to `main`; production is manual `workflow_dispatch`
(main only). Deploy = `terraform apply` (bucket) → sync `dist/` (Vite build) to `s3://.../current`
→ CloudFront invalidation (soft-fails until the edge exists). Domains:
`encounters.staging.521studios.com`, `encounters.521studios.com`.
