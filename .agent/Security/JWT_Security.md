# JWT Security & Best Practices

## 1. Minimal Payloads

- Keep JWT payloads small to reduce token size and processing time.
- Only include essential claims (e.g., `sub`, `roles`).

## 2. Secure Signing

- Use strong algorithms like `RS256` or `EdDSA` (Asymmetric) instead of `HS256` (Symmetric) when possible.
- Rotate keys regularly.

## 3. Short Expiration

- Set a short Time-to-Live (TTL) for access tokens.
- Use Refresh Tokens stored in HTTP-Only, Secure cookies to handle session renewal.

## 4. Blacklisting & Revocation

- Implement a mechanism to invalidate tokens (e.g., maintain a list of revoked token IDs in Redis).

## 5. Audience & Issuer Validation

- Always verify that the `aud` (Audience) and `iss` (Issuer) claims match your application and identity provider.
