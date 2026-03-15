# Unit Testing Guidelines

## 1. Scope

Unit tests should focus on a single unit of code, typically a function or a class method, in isolation.

## 2. Fast & Isolated

Tests should run quickly and not depend on external resources like databases or APIs.

## 3. Mocking

Use mocks for dependencies to ensure you are only testing the specific unit's logic.

## 4. Clear Naming

Name tests clearly to describe what is being tested and the expected outcome (e.g., `calculateTotal_returns_correct_sum`).

## 5. Coverage

Aim for high coverage of critical business logic and complex algorithms.
