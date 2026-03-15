# Authentication Strategies

## 1. JWT (JSON Web Tokens)

Stateless authentication using tokens. Good for scalability, but requires careful management of token expiration and revocation.

## 2. Session-Based

Traditional stateful authentication where the server stores session data and the client holds a session ID in a cookie.

## 3. OAuth2 / OpenID Connect

Standards for delegated authorization and authentication, often used for third-party logins (e.g., Google, GitHub).

## 4. Multi-Factor Authentication (MFA)

Enhance security by requiring more than one form of verification.

## 5. Password Hashing

Always use strong, salted hashing algorithms like Argon2 or BCrypt to store passwords.
