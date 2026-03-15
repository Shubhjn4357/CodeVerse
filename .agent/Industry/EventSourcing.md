# Event Sourcing Architecture

## 1. The Source of Truth

- Instead of storing the current state, store a chronological sequence of state-changing events.

## 2. Replaying Events

- Current state is derived by "replaying" events from the beginning of time (or a snapshot).

## 3. Auditability

- Provides a perfect, immutable audit trail of every change that ever happened in the system.

## 4. Snapshots

- Periodically save the current state to speed up the reconstruction of state from the event log.

## 5. Event Store

- Use a specialized database designed for appending events (e.g., EventStoreDB) or a reliable message log like Kafka.
