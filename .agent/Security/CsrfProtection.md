# CSRF (Cross-Site Request Forgery) Protection

## 1. The Core Concept

- Forcing a user's browser to perform an unwanted action on a different website where the user is currently authenticated.

## 2. Anti-CSRF Tokens

- Include a unique, secret token in every state-changing request (POST, PUT, DELETE). The server validates this token before processing.

## 3. SameSite Cookie Attribute

- Use `SameSite=Strict` or `SameSite=Lax` to prevent browsers from sending cookies with cross-site requests.

## 4. Custom Request Headers

- APIs that only accept requests with custom headers (e.g., `X-Requested-With`) are generally immune as these cannot be sent via a standard HTML form.

## 5. Re-authentication for Critical Actions

- Require the user to re-enter their password or provide a 2FA code before sensitive operations (e.g., changing email or password).
