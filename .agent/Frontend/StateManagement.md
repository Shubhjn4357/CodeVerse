# State Management Standards

## State Locality

1. **Prefer Local State**: Keep state as close to the component as possible.
2. **Lifting State**: Lift state to the nearest common ancestor only when shared by multiple components.
3. **Global State**: Use Context API or specialized libraries (Zustand, Redux) for app-wide state (auth, theme, settings).

## Reactive Hooks

- Use `useEffect` sparingly; prefer computed values or memoized callbacks.
- Optimize with `useMemo` and `useCallback` for performance-critical components.
- Standardize on `useSyncExternalStore` for external data sources.
