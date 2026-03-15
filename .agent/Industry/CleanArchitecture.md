# Clean Architecture & Layered Design

## 1. The Dependency Rule

- Dependencies point inward. Outer circles are mechanisms, inner circles are policies.

## 2. Entities (Inner Circle)

- Business objects that contain business logic.

## 3. Use Cases

- Application-specific business rules. Orchestrate the flow of data to and from entities.

## 4. Interface Adapters

- Convert data from the format most convenient for the use cases and entities to the format most convenient for some external agency such as the DB or the Web.

## 5. Frameworks & Drivers (Outer Circle)

- The database, the web framework, the UI. Everything that can easily change.
