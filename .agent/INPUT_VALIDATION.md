# Input Validation & Sanitization

## Zod Standards

1. **Strict Schemas**: Define Zod schemas for every API input and environment variable.
2. **Type Inference**: Use `z.infer<typeof schema>` to keep TS types in sync with validation.
3. **Custom Errors**: Provide user-friendly error messages in the schema definition.

## Sanitization

- **XSS Prevention**: Sanitize HTML inputs using `sanitize-html`.
- **SQL Injection**: Always use parameterized queries or trusted ORMs.
- **Path Traversal**: Validate and normalize file paths before use.

## Middleware

- Implement shared validation middleware for common patterns (e.g., pagination, auth headers).
