terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    # bucket and key passed via -backend-config at init time (see deploy.yml)
    region = "us-east-2"
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name        = "encounter-builder-web"
  bucket_name = "521studios-${var.env}-encounter-builder-web"
  tags = {
    Project     = "encounter-builder-web"
    Environment = var.env
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# S3 — SPA assets, served at /current by the infra-frontend CloudFront module.
# The bucket is owned here (app layer); infra-frontend's encounter-builder-cf
# reads its name/arn/regional_domain from this repo's remote state.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "site" {
  bucket = local.bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
