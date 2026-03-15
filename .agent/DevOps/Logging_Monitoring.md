# Logging & Monitoring: Prometheus & Grafana

## 1. Structured Logging

- Log in JSON format to make it easy for log collectors (like Fluentd, ELK) to parse and index.

## 2. Redaction of PII

- Automatically strip sensitive info (email, phone, credit card) from logs.

## 3. Correlation IDs

- Append a unique Request-ID to every log message in a single request flow to trace it across services.

## 4. Key Metrics

- Track the "Four Golden Signals": Latency, Traffic, Errors, and Saturation.

## 5. Dashboards and Alerts

- Use Grafana to visualize metrics.
- Set up alerts for high error rates or unusual latency spikes.
