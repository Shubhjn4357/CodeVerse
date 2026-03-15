# Communication Hooks & Data Sharing

## Multi-Sharing Patterns

1. **Event Bus**: Use for cross-component, disconnected communication (e.g., notification system).
2. **Shared Hooks**: Centralize logic in `hooks/useSharedData.ts` to sync data across navigation layers.
3. **Global Context**: Use for large-scale data like _User Permissions_, _Application Config_, and _Organization Settings_.

## Real-time Sync

- **Server to Client**: Use WebSockets or Server-Sent Events (SSE) for live updates.
- **Client to Client**: Use `BroadcastChannel API` for cross-tab communication.
- **Data Hooks**: Implementation must include `sync()` and `refresh()` methods for manual triggers.
