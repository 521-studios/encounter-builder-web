variable "env" {
  description = "Deployment environment (staging | production)"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "The env variable must be one of: staging, production."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-2"
}

variable "active_sha" {
  description = "Git SHA of the currently deployed site build"
  type        = string
}
