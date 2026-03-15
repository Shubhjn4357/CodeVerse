# Microservices & Distributed Architecture

## Design Patterns

1. **API Gateway**: Single entry point for all client requests.
2. **Service Discovery**: Automatically detect and route to available service instances.
3. **Circuit Breaker**: Prevent cascading failures by failing fast when a dependent service is down.

## Communication

- **Synchronous**: REST/gRPC for immediate responses.
- **Asynchronous**: Message queues (RabbitMQ, Kafka) for background tasks and decoupling.
- **Eventual Consistency**: Design for data to become consistent over time rather than requiring immediate ACID compliance across services.
