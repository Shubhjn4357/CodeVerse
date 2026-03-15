# Hexagonal Architecture (Ports & Adapters)

## 1. Core Logic (The Hexagon)

- Contains all business logic, entities, and use cases. It knows nothing about the outside world.

## 2. Ports (Interfaces)

- Defined by the core logic. They specify what the core needs (e.g., "I need a way to save a user").

## 3. Adapters (Implementation)

- External components that implement the ports (e.g., a SQL database adapter, a REST API adapter).

## 4. Testability

- Since the core is decoupled, you can test it in isolation by providing mock adapters for all its ports.

## 5. Flexibility

- You can swap a SQL database for a NoSQL one without changing a single line of business logic; you only need a new adapter.
