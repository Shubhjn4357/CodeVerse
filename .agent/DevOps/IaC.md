# Infrastructure as Code (IaC)

## Standards

1. **Declarative**: Use Terraform or AWS CloudFormation to describe your infrastructure.
2. **Version Control**: Infrastructure code must reside in the same repo as the application.
3. **Modularity**: Create reusable modules for VPCs, S3 buckets, and RDS instances.

## Cloud Strategy

- **AWS/Google Cloud**: Scale based on traffic.
- **Edge Computing**: Use Cloudflare Workers for caching and security at the edge.
- **Serverless**: Prefer serverless functions for cost efficiency on low-traffic modules.
