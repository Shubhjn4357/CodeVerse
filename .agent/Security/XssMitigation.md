# XSS (Cross-Site Scripting) Mitigation

## 1. Context-Aware Output Encoding

- Encode data based on where it will be placed in the HTML (e.g., attribute, text content, script block).

## 2. Content Security Policy (CSP)

- Implement a strict CSP to prevent the execution of untrusted scripts.

## 3. Use Modern Frameworks

- React, Vue, and Angular automatically encode data rendered in templates, preventing most XSS attacks by default.

## 4. Sanitize User-Generated HTML

- Use libraries like `DOMPurify` or `sanitize-html` if you must render raw HTML from users.

## 5. Secure Cookies

- Use `HttpOnly` and `SameSite` flags for cookies to prevent them from being accessed by malicious scripts.
