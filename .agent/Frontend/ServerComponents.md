# React Server Components (RSC) vs Client Components

## 1. Server Components (Default)

- Render on the server.
- No client-side JS bundle for these components.
- Can fetch data directly from the database or filesystem.
- Use for static parts of the UI, data-heavy sections, and search engine visibility.

## 2. Client Components (`'use client'`)

- Traditional React components that run in the browser.
- Can use hooks (`useState`, `useEffect`), event listeners.
- Use for interactivity, forms, and browser APIs.

## 3. The "Network Boundary"

- Carefully decide where to place the `'use client'` directive to minimize the client-side bundle size.

## 4. Shared Components

- Components that can run on both server and client depending on where they are imported.
