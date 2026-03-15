# Micro-Frontends Architecture

## 1. The Core Concept

- Breaking a frontend monolith into smaller, independent, and deployable applications that work together as a single unit.

## 2. Integration Strategies

- **Build-time Integration**: Components shared as NPM packages (rigid).
- **Run-time Integration via IFrames**: Strongest isolation but poor UX/Performance.
- **Run-time Integration via JavaScript (Module Federation)**: Preferred modern approach using Webpack or Vite.

## 3. Communication Patterns

- Use a Global Event Bus or Custom Events to send messages between micro-frontends.

## 4. Shared Design System

- Essential to maintain a consistent look and feel across different teams' micro-frontends.

## 5. Deployment & Versioning

- Each team should be able to deploy their micro-frontends independently without a full app rebuild.
