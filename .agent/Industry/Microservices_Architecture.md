# Microservices Architecture Deep Dive

## 1. Service Independence

- Each service must have its own database and CI/CD pipeline.

## 2. Inter-Service Communication

- Prefer asynchronous messaging (Event-driven) over synchronous RPC/HTTP.

## 3. API Gateways

- Centralized entry point for authentication, logging, and routing.

## 4. Distributed Tracing

- Use OpenTelemetry or Jaeger to trace requests across multiple services.

## 5. Observability

- Aggregated logging and specific service-level metrics.
