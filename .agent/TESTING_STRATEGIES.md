# QA & Testing Strategies

## Verification Levels

1. **Static Analysis**: TypeScript (no `any`), ESLint, and Prettier.
2. **Unit Testing**: Test pure functions and utilities using Vitest/Jest.
3. **Integration Testing**: Test component interactions and state changes.
4. **E2E Testing**: Use Playwright/Cypress for critical user flows (login, billing, checkout).

## Test Standards

- **Mocking**: Mock external APIs and heavy dependencies.
- **Coverage**: Aim for 80%+ coverage for core business logic (`lib/` and `actions/`).
- **Description**: Use clear `describe`/`it` blocks explaining the _behavior_, not just the _function call_.
