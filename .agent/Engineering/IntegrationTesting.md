# Integration Testing Guidelines

## 1. Scope

Integration tests verify that different modules or services work together correctly.

## 2. Interaction-focused

Focus on the interaction between components, such as a service calling a database or an API.

## 3. Real Dependencies

Use real (or near-real) dependencies where possible, such as a test database.

## 4. Environment Setup

Ensure the test environment is correctly configured before running integration tests.

## 5. Reliability

Address flaky integration tests immediately, as they can undermine trust in the test suite.
