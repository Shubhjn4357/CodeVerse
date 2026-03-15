# Cloudflare Workers & Edge Computing

## 1. The Edge Runtime

- Understand the V8 isolates-based runtime which is different from Node.js (no `fsevents`, limited standard modules).

## 2. KV (Key-Value) Storage

- Use Cloudflare KV for globally distributed, low-latency data storage.

## 3. Durable Objects

- Use for stateful, coordinated applications (e.g., real-time collaboration) at the edge.

## 4. Edge Caching

- Implement custom caching logic using the `Cache API` to reduce origin server load.

## 5. Routing & Environment

- Use `wrangler` for local testing and deployment workflow management.
