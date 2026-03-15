# Database Optimization & Schema Design

## Schema Rules

1. **Normalization**: Aim for 3NF to reduce redundancy.
2. **Indexing**: Index frequently queried columns (IDs, Slugs, Timestamps). Avoid over-indexing.
3. **Foreign Keys**: Enforce data integrity with proper relational constraints.

## Query Performance

- **Selectivity**: Only SELECT the columns you need. Avoid `SELECT *`.
- **Joins**: Optimize JOIN operations; avoid N+1 query problems using eager loading.
- **Pagination**: Use cursor-based pagination for large datasets.

## Migration Standards

- Use a robust migration tool (e.g., Prisma, Knex).
- Never modify existing migrations; always create a new one.
- Migration scripts must be reversible (Up/Down).
