# CQRS (Command Query Responsibility Segregation)

## 1. The Core Concept

- Separate the models for reading data (Queries) from the models for updating data (Commands).

## 2. Why Use CQRS?

- **Scalability**: Read and Write workloads can be scaled independently.
- **Performance**: Optimize the read model for complex UI displays (e.g., pre-joined tables).
- **Security**: Granular control over who can perform which actions.

## 3. Implementation Patterns

- Can be implemented within a single application or as separate services.
- Often paired with **Event Sourcing**.

## 4. Complexity Trade-off

- Only use CQRS for complex domains where read/write models are significantly different; it adds substantial architectural overhead.
