# Agents

## test-coverage-reviewer

Review code changes to **require unit tests for all new or modified functions**. The goal is to incrementally grow the test suite with every PR.

**Core rule: Every PR must include unit tests for the code it touches.**

This is NOT optional. PRs without tests for new/modified code should be blocked.

**Rules to enforce:**

1. **Unit tests REQUIRED for all touched code**: Any modified or new function MUST have corresponding unit tests. If tests don't exist, the PR author must add them. No exceptions for "refactoring" or "simple changes" - tests prove the code works.

2. **Test file naming**: Tests should be colocated or in a `__tests__/` directory, named `*.test.js`. Use Node's built-in test runner (`node --test`) — no Jest, no Vitest, no assertion libraries beyond `node:assert`.

3. **Bug fix documentation**: If the code change fixes a bug:
   - Require a comment explaining what was broken and why the fix works
   - Require a regression test that would have caught the bug

**Review approach:**
1. Identify ALL functions that were added or modified in the PR
2. For EACH function, verify corresponding test files exist
3. If tests are missing, post a comment listing the specific functions that need tests
4. Suggest specific test cases based on the function's logic and edge cases
5. Do NOT accept "integration tests cover it" or "verified manually" as substitutes for unit tests

**What to flag:**
- New exported functions without unit tests
- Modified functions without tests verifying the modification
- Complex logic paths without test coverage
- Edge cases visible in the code that aren't tested

**Do NOT allow:**
- Accepting "pure refactoring" as an excuse — refactoring PRs especially need tests to prove behavior is preserved
- Accepting "verified in the harness" instead of unit tests
- Marking test coverage as "out of scope" — test coverage is NEVER out of scope

**Acceptable:**
- Creating a beads ticket to track adding tests, as long as the ticket is created before merging

## complexity-reviewer

Review **production code only** for function complexity. **Skip all test files** (`*.test.js`, `__tests__/`) — test files often have verbose setup and assertions that don't need the same constraints.

Apply these heuristics:

1. **"And/Or" test**: Minimize the number of "and" or "or" needed to describe what a function does. If you need multiple conjunctions, the function is doing too much.

2. **One-screen rule**: Functions should fit on one screen (~50-60 lines). Longer functions are harder to reason about.
   - **Named helper functions don't count against the parent**: If a function calls well-named helpers, those lines live elsewhere.

3. **Extractable blocks**: If a block of code within a function has a clear purpose, consider extraction:
   - **First choice**: Separate module-level function if reusable
   - **Second choice**: Helper within the same file
   - **Last choice**: Inline closure if truly specific to the parent

4. **Nesting depth**: Flag functions with more than 3 levels of nesting (excluding the function body itself). Deep nesting makes control flow hard to follow.
   - Prefer early returns to reduce nesting (`if (!x) return null`)

**Do NOT flag:**
- Test files
- Functions that are long but linear (no branching, just sequential steps)
- React components with many conditional renders (inherently flat JSX)
- Components whose length comes primarily from render sections

## prop-coupling-reviewer

Review React components for **unnecessary prop threading** (prop drilling).

**Core principle:** Cross-cutting data — the authenticated session/OIDC token, the API client, the currently-selected campaign/GM context — should be provided via React Context (or composition), not threaded as props through intermediate components that don't use them.

**Patterns to FLAG:**

1. **Cross-cutting data passed as props through layers that don't consume it:**
   - the auth token / current user / session threaded through intermediate components (put it in an auth context + a hook)
   - the API client (or `fetch` wrapper) passed down instead of imported/consumed from context
   - the current campaign / encounter selection threaded through several layers

2. **Recreating a shared-context bag passed via spread:**
   ```jsx
   // BAD — a "shared" object drilled through the tree
   const shared = { token, user, apiClient }
   <ChildComponent {...shared} />
   ```

**Do NOT flag:**
- Data props specific to each component (the entity it renders, e.g. a monster/treasure line)
- `children` prop usage
- Props that genuinely vary per instance (not shared/cross-cutting state)

## terraform-reviewer

Review terraform changes in `terraform/` to ensure this app stays in its lane within the **three-layer state stack**:

```
infra (baseline) → apps (this repo) → infra-frontend
```

**This repo's layer: apps.** Its terraform owns app-specific resources only.

For full context, read `infra/CLAUDE.md` and `infra-frontend/CLAUDE.md` in the workspace before reviewing.

### What this app's terraform SHOULD own

- The S3 bucket(s) the SPA / library is published to.
- IAM roles/policies the app needs (CI/CD deploy roles, OIDC trust, etc.).
- Any CloudWatch log groups scoped to the app.
- Outputs that `infra-frontend` consumes (e.g. SPA bucket name, regional domain).

### What this app's terraform MUST NOT own

- **CloudFront distributions** — owned by `infra-frontend` (this app's distribution lives in `infra-frontend/terraform/modules/encounter-builder-cf/`).
- **CloudFront Origin Access Control (OAC)** — owned by `infra-frontend`.
- **ACM certificates** for public domains — owned by `infra-frontend` (must live in `us-east-1`).
- **Public DNS records** (apex, www, custom subdomains the public hits directly) — owned by `infra-frontend`.
- **CloudFront Functions** (e.g. SPA path rewrites) — owned by `infra-frontend`.
- **S3 bucket policies referencing CloudFront/OAC** — owned by `infra-frontend` to avoid circular dependencies between this app's bucket and the distribution that fronts it.
- **Foundational shared resources**: VPCs, subnets, security groups, Aurora, RDS, ECS clusters — owned by `infra`.

### What this app's terraform MUST NOT do

- **Read from `infra-frontend` remote state.** This app deploys *before* `infra-frontend`, so the dependency is one-way.
- **Embed AWS account IDs or regions as literals** outside backend configs — use `data "aws_caller_identity"`, `var.aws_region`, or other variables.
- **Reach across into another app's resources** (e.g. `pfsrd2-data-api`'s Lambda Function URL) — apps consume from `infra` and from AWS data sources, not from peer apps.

### What this app's terraform SHOULD do

- **Export outputs** that `infra-frontend` consumes — naming should match what `infra-frontend/terraform/modules/encounter-builder-cf` already reads from this repo's remote state.
- **Read from `infra` remote state** when consuming shared platform values.
- **Use AWS data sources** (e.g. `data "aws_route53_zone"`) instead of hardcoding values that already exist in the account.

### Cost discipline

CloudFront and ACM are free, but each distribution increases operational overhead (WAF, monitoring, invalidations). Prefer adding path behaviors to the existing `encounter-builder-cf` distribution over creating new ones.

### Review approach

1. For each `resource "aws_*"` and `module ".*"` in the diff, ask: does this belong in the app layer, or is it overreach into `infra`, `infra-frontend`, or a peer app?
2. Flag any `terraform_remote_state` block — or `data` source referencing resources owned by `infra-frontend` or peer apps — that creates a cross-layer dependency.
3. Flag any `aws_cloudfront_distribution`, `aws_acm_certificate`, `aws_cloudfront_function`, `aws_cloudfront_origin_access_control`, `aws_s3_bucket_policy` (or an inline `policy` attribute on `aws_s3_bucket`) if it references CloudFront/OAC, public-facing `aws_route53_record`, or VPC/subnet/security group/ECS cluster/RDS resources (`aws_db_instance`, `aws_rds_cluster`).
4. Flag hardcoded account IDs, region literals outside backend configs, or multiple provider blocks for the same region/alias.
5. For new outputs, confirm there's a clear consumer in `infra-frontend` — orphan outputs accumulate over time.
6. For changes to existing outputs, confirm `infra-frontend` is being updated alongside (or a follow-up is filed).

**Note:** It is acceptable to acknowledge a layering violation and defer the fix via a beads ticket — but mark it P1, not P3. Layer violations create deploy-order coupling.

## clarity-reviewer

Review markdown documentation for terseness. Every token costs money and attention — cut the fat.

**What to check:**

1. Look at the PR diff for changes to `.md` files
2. **Read the full file, not just the diff** — you need context to spot redundancy
3. Examine new or modified text for:
   - Redundant phrasing ("in order to" → "to")
   - Filler words ("actually", "basically", "simply", "really")
   - Stating the obvious or repeating context already established

**Flag issues if:**
- A sentence can be cut in half without losing meaning
- The same information is stated twice in different words
- New text restates something already covered elsewhere

**Do NOT flag:**
- Necessary detail that aids understanding
- Examples and code blocks
- Technical precision that requires specific wording

**When flagging, provide:**
- The verbose text
- A terse replacement
