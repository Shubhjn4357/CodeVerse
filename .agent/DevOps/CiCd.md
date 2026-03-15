# DevOps & CI/CD Pipelines

## Core Principles

1. **Automate Everything**: From testing to deployments.
2. **Shift Left**: Catch bugs as early as possible (Git hooks).
3. **Immutable Infrastructure**: Changes should be applied through code, not manual tweaks.

## GitHub Actions Standards

- **Pull Request**: Trigger lint, typecheck, and unit tests.
- **Merge to Main**: Trigger build and staging deployment.
- **Tag/Release**: Trigger production deployment.
- **Fail Fast**: Cancel previous runs if a new commit is pushed.

## Secret Management

- Never commit secrets to the repository.
- Use GitHub Secrets or AWS Secrets Manager.
- Use `.env.template` for developer onboarding.
