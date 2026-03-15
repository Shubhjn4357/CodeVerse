# React Hooks Patterns & Best Practices

## 1. Custom Hooks for Logic Reuse

- Extract complex stateful logic into custom hooks (e.g., `useAuth`, `useForm`, `usePagination`).
- Keep components focused on presentation.

## 2. useMemo & useCallback

- Use `useMemo` for expensive calculations.
- Use `useCallback` to prevent unnecessary re-renders of memoized child components.
- **Caution**: Don't over-use; there's a memory/cpu overhead to memoization itself.

## 3. useTransition & useDeferredValue

- Use `useTransition` for non-urgent UI updates (e.g., filtering a list).
- Use `useDeferredValue` for values that can "lag" behind the input to keep the UI responsive.

## 4. The `use` Hook (React 18+)

- Use to read values from resources like Promises or Context in a more flexible way.

## 5. Rules of Hooks

- Only call hooks at the top level.
- Only call hooks from React functions.
- Use ESLint plugin `eslint-plugin-react-hooks` to enforce these.
