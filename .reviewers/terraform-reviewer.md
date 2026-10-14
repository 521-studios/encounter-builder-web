# terraform-reviewer
model: sonnet
verification: evidence-query — quotes the offending `resource`/`data`/`module` block and greps `terraform/` for the cited type or `terraform_remote_state`; claims about `infra-frontend` consumers are labelled judgement because that repo is not in the checkout.
**Checks:** App-layer terraform overreach: CloudFront, OAC, ACM, public DNS, CloudFront functions, CloudFront bucket policies, shared VPC/RDS/ECS resources, remote-state reads of infra-frontend, hardcoded account IDs or regions, orphan outputs.
**Spawn when:** diff touches `terraform/**` (`.tf`, `.tfvars`) or the terraform steps of `.github/workflows/deploy.yml` or `ci.yml`; skip if no terraform or workflow file changed.
**Contents:** What this app's terraform SHOULD own · What this app's terraform MUST NOT own · What this app's terraform MUST NOT do · What this app's terraform SHOULD do · Cost discipline · Review approach · Do NOT flag · Severity

Review terraform changes in `terraform/` to ensure this app stays in its lane within the **three-layer state stack**:

```
infra (baseline) → apps (this repo) → infra-frontend
```

**This repo's layer: apps.** Its terraform owns app-specific resources only.

`infra` and `infra-frontend` are separate repos, not in this checkout or CI. The layer rules below are complete; anything that depends on those repos' contents is judgement and must say so.

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

- **Export outputs** that `infra-frontend` consumes by name: `s3_bucket_name`, `s3_bucket_arn`, `s3_bucket_regional_domain`, `active_sha` (`terraform/outputs.tf`).
- **Read from `infra` remote state** when consuming shared platform values.
- **Use AWS data sources** (e.g. `data "aws_route53_zone"`) instead of hardcoding values that already exist in the account.

### Cost discipline

CloudFront and ACM are free, but each distribution increases operational overhead (WAF, monitoring, invalidations). Prefer adding path behaviors to the existing `encounter-builder-cf` distribution over creating new ones.

### Review approach

1. For each `resource "aws_*"` and `module ".*"` in the diff, ask: does this belong in the app layer, or is it overreach into `infra`, `infra-frontend`, or a peer app?
2. Flag any `terraform_remote_state` block — or `data` source referencing resources owned by `infra-frontend` or peer apps — that creates a cross-layer dependency.
3. Flag any `aws_cloudfront_distribution`, `aws_acm_certificate`, `aws_cloudfront_function`, `aws_cloudfront_origin_access_control`, `aws_s3_bucket_policy` (or an inline `policy` attribute on `aws_s3_bucket`) if it references CloudFront/OAC, public-facing `aws_route53_record`, or VPC/subnet/security group/ECS cluster/RDS resources (`aws_db_instance`, `aws_rds_cluster`).
4. Flag hardcoded account IDs, region literals outside backend configs, or multiple provider blocks for the same region/alias.
5. A new output with no obvious consumer: P3 judgement (the consumer isn't visible from here).
6. Renaming or removing an existing output listed above: P2 — `infra-frontend` reads it by name; the PR must link the matching `infra-frontend` change or a follow-up.

**Note:** It is acceptable to acknowledge a layering violation and defer the fix via a beads ticket — but mark it P1, not P3. Layer violations create deploy-order coupling.

**Do NOT flag:** `aws_s3_bucket.site` and its `_versioning`, `_public_access_block`, `_server_side_encryption_configuration` resources; the backend `region` literal; `terraform` (not `tofu`) in workflows; tags and locals; `scripts/invalidate.sh` looking up the distribution by alias (a read-only lookup, not a remote-state read).

**Severity:** P1 a layer violation (items 2–3); P2 a hardcoded account ID or region outside the backend, or a broken output contract; P3 an orphan output.
