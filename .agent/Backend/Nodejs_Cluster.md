# Node.js Cluster Module & Multi-threading

## 1. Scaling to Multiple Cores

- Since Node.js is single-threaded, use the `cluster` module to spawn worker processes that share the same server port.

## 2. Master & Worker Processes

- The Master process manages workers and distributes incoming connections.

## 3. IPC (Inter-Process Communication)

- Use `process.send()` and `on('message')` to communicate between master and worker processes.

## 4. Zero-Downtime Reloads

- Restart workers one by one when releasing new code to ensure the server stays active.

## 5. PM2 Process Manager

- In most production environments, prefer an external manager like **PM2** which handles clustering and automatic restarts out of the box.
