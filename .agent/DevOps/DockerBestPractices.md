# Docker Best Practices for Production

## 1. Use Small Base Images

- Prefer `alpine` or `distroless` images to reduce attack surface and build time.

## 2. Multi-Stage Builds

- Separate your build environment from your runtime environment to keep final images small.

## 3. Don't Run as Root

- Use the `USER` instruction to run your application as a non-privileged user.

## 4. Use .dockerignore

- Exclude `node_modules`, logs, and local configuration files from the build context.

## 5. Layer Caching

- Order your Dockerfile instructions from least-to-most frequently changed to optimize build caching.
