# Deno Runtime vs Node.js

## 1. Security by Default

- No file, network, or environment access unless explicitly enabled via flags (e.g., `--allow-net`).

## 2. TypeScript Support

- Deno has built-in TypeScript support; no separate compiler or config needed.

## 3. Standard Library

- Comprehensive, audited standard library following Go's model.

## 4. ES Modules Only

- No `require()`; all modules must be imported via URLs or file paths.

## 5. Built-in Utilities

- Includes a test runner, linter, and formatter out of the box.
