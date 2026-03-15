# Content Security Policy (CSP) Standards

## 1. Restrictive Defaults

- Start with `default-src 'none';` and explicitly allow only what is necessary.

## 2. Script & Style Sources

- Use nonces or hashes instead of `'unsafe-inline'`.
- Restrict `script-src` and `style-src` to trusted domains.

## 3. Image & Connect Sources

- Limit `img-src` to your local assets and trusted CDNs.
- Limit `connect-src` to your API domain.

## 4. Frame Ancestors

- Use `frame-ancestors 'none';` to prevent clickjacking attacks via `iframe`.

## 5. Reporting

- Use `report-uri` or `report-to` to capture CSP violations in production without blocking users.
