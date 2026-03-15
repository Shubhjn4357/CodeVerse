# ORM Best Practices (Prisma/Drizzle)

## 1. Type Safety

- Leverage auto-generated types from your schema to ensure end-to-end type safety.

## 2. Efficient Joins

- Use `include` or `select` (Prisma) or explicit joins (Drizzle) to fetch exactly what you need. Avoid over-fetching.

## 3. Batching & Transaction

- Use `$transaction` to ensure atomic operations (either all succeed or all fail).

## 4. Middleware/Hooks

- Use ORM-level middleware for cross-cutting concerns like logging or soft deletes (marking as deleted instead of removing).

## 5. Connection Pooling

- Use tools like `accelerate` (Prisma) or standard pg-pool to manage database connections in serverless environments.
