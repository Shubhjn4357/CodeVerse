# Backend & Server Actions

## Server Actions (`lib/actions`)

1. **Async Synchronization**: Use `Promise.all` for parallel tasks and proper `await` for sequential ones.
2. **Validation**: Validate all inputs using `Zod` before processing.
3. **Error Handling**: Use try-catch blocks and return structured error objects.
4. **Security**: Ensure user session/permission check at the start of every action.

## API Integration

- Keep server-side logic strictly in `lib/actions`.
- Avoid leaking database schemas to the client; use DTOs (Data Transfer Objects).
- Implement rate limiting and input sanitization.
