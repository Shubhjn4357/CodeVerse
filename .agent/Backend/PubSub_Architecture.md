# Pub-Sub Architecture & Message Queues

## 1. Decoupling Services

- Use Publisher-Subscriber patterns to allow services to communicate without knowing about each other.

## 2. Message Brokers

- Use Redis (BullMQ), RabbitMQ, or Amazon SQS for reliable message delivery.

## 3. Idempotency

- Ensure that message consumers can handle the same message multiple times without unintended side effects.

## 4. Retries & Dead Letter Queues (DLQ)

- Automatically retry failed tasks. Move persistently failing tasks to a DLQ for manual inspection.

## 5. Event-Driven Workflows

- Trigger long-running tasks (e.g., report generation, bulk email) asynchronously via the queue.
