# Security & Compliance

## Security Checklist

1. **Auth**: Use HTTP-only cookies for JWT/Session storage.
2. **Data Sanitization**: Sanitize all user-generated content to prevent XSS.
3. **CORS**: Implement strict Cross-Origin Resource Sharing policies.
4. **Rate Limiting**: Protect API endpoints from brute force and DDoS.

## Compliance (GDPR/Data Privacy)

- Minimize data collection; only store what is necessary.
- Encrypt sensitive data (PII) at rest and in transit.
- Provide "Export My Data" and "Delete Account" features.
