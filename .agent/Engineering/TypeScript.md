# TypeScript Standards

## Strict Typing Policy

1. **No `any`**: The use of `any` is strictly prohibited. Use `unknown` if the type is truly unknown.
2. **Explicit Interfaces**: Define interfaces for all component props and API responses.
3. **Proper Generics**: Use generic types for reusable components and hooks.
4. **Discriminated Unions**: Use for complex state or action types.

## Type Safety

- Enable `strict: true` in `tsconfig`.
- Use `Readonly` for immutable arrays/objects.
- Avoid non-null assertions (`!`). Use optional chaining or nullish coalescing.
