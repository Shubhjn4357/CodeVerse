# SQL Injection Prevention

## 1. Parameterized Queries

- Always use prepared statements and parameterized queries. Never concatenate user input directly into SQL strings.

## 2. Use Trusted ORMs

- Rely on ORMs like Prisma, Drizzle, or Sequelize which handle parameterization by default.

## 3. Input Validation

- Validate all user input against a strict schema (e.g., Zod) before it reaches the data layer.

## 4. Principle of Least Privilege

- The database user used by the application should only have permissions to the tables and actions it absolutely needs.

## 5. Escape User Input

- If you MUST build manual queries, use the specific escaping functions provided by your database driver.
