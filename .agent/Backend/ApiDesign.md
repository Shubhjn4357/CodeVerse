# API Design Principles

## Core Standards

1. **Statelessness**: Every request must contain all information needed to fulfill it.
2. **Versioning**: Use URL versioning (e.g., `/api/v1/...`) to prevent breaking changes.
3. **Consistency**: Consistent naming (camelCase), status codes, and error formats.

## Resource-Oriented Design

- `GET /items`: List items.
- `POST /items`: Create item.
- `GET /items/:id`: Get specific item.
- `PUT /items/:id`: Replace item.
- `PATCH /items/:id`: Update item partially.
- `DELETE /items/:id`: Remove item.

## Documentation

- Self-document using Swagger/OpenAPI or TSON (Type-Safe Object Notation).
- Include examples for request bodies and response schemas.
