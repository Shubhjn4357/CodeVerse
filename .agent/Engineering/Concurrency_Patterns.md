# Concurrency Patterns & Async Flow

## 1. Single Threaded Event Loop

- Understand how the Node.js/Browser event loop handles asynchronous operations using the task and microtask queues.

## 2. Promises & Async/Await

- Use for multi-step asynchronous processes.
- Handle multiple promises with `Promise.all` (parallel), `Promise.allSettled` (robust), and `Promise.race` (timeout).

## 3. Web Workers

- Use to run CPU-intensive tasks in a background thread to prevent blocking the UI/main thread.

## 4. Generators & Iterators

- Use for custom iteration behavior and lazy data streams.

## 5. Streams (Node.js)

- Use for processing large datasets chunk by chunk rather than loading everything into memory.
- `Readable`, `Writable`, and `Transform` streams.

## 6. Sagas & Side Effect Management

- In large applications, use structured side effect management (e.g., Redux-Saga or custom event-based handlers).
