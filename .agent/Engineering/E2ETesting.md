# End-to-End (E2E) Testing Guidelines

## 1. Scope

E2E tests simulate real user scenarios from start to finish, exercising the entire application stack.

## 2. Tooling

Use Playwright or Cypress for reliable, cross-browser E2E testing.

## 3. Key Workflows

Focus on critical paths such as login, user registration, and checkout processes.

## 4. Environment

Run E2E tests against a production-like environment (Staging) before deploying to production.

## 5. Maintenance

E2E tests can be fragile. Design them to be as robust as possible, but be prepared to update them as the UI evolves.
