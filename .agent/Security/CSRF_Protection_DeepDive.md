# Cross-Site Request Forgery (CSRF)

## 1. Description

CSRF is an attack that forces an authenticated user to execute unwanted actions on a web application in which they are currently authenticated.

## 2. Prevention with Tokens

Use unique, session-specific CSRF tokens for all state-changing requests (POST, PUT, DELETE). Ensure the server validates these tokens.

## 3. SameSite Cookies

Configure your session cookies with the `SameSite=Strict` or `SameSite=Lax` attribute to prevent them from being sent during cross-site requests.

## 4. Double Submit Cookie Pattern

A stateless CSRF protection where a random value is sent both in a cookie and as a request parameter, and the server verifies they match.

## 5. Verification of Origin

Check the `Origin` and `Referer` headers on incoming requests to ensure they come from a trusted source.
