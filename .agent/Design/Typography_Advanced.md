# Advanced Typography Standards

## 1. Typographic Scale

- Use a consistent ratio (e.g., 1.25 Modular Scale) to define sizes for `h1` through `h6`.
- Root size: `16px` (1rem).

## 2. Line Heights & Spacing

- Body text: `1.5` to `1.6` for optimal readability.
- Headings: `1.1` to `1.3` for a compact, authoritative look.
- Letter spacing: `-0.01em` to `-0.02em` for headings to increase "tightness."

## 3. Font Loading & Performance

- Use `font-display: swap` to prevent FOUT (Flash of Unstyled Text).
- Prefer variable fonts to reduce bundle size if multiple weights are needed.

## 4. Optical Sizing

- Enable `font-optical-sizing: auto` when available for better legibility at small sizes.

## 5. System Fonts Fallback

- Always include a reliable system font stack as a fallback (e.g., `-apple-system, BlinkMacSystemFont, "Segoe UI", ...`).
