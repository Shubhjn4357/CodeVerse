# Git Workflow & Commit Standards

## Commit Messages (Conventional Commits)

- **feat**: New feature.
- **fix**: Bug fix.
- **docs**: Documentation changes.
- **style**: Formatting/UI (no logic change).
- **refactor**: Code change that neither fixes a bug nor adds a feature.
- **perf**: Performance optimization.
- **test**: Adding or correcting tests.
- **chore**: Build process or auxiliary tool changes.

## Branching & Merging

1. **Branch Names**: `feature/`, `bugfix/`, `hotfix/`, `docs/`.
2. **Rebase First**: Rebase locally before merging into `main` to keep a clean history.
3. **PR Reviews**: Every PR requires at least one peer approval (if applicable).
