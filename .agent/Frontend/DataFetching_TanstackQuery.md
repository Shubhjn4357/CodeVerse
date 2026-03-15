# Advanced Data Fetching (Tanstack Query)

## 1. Declarative Fetching

- Use `useQuery` for reading data and `useMutation` for writing data.

## 2. Caching & Stale-While-Revalidate (SWR)

- Configure `staleTime` and `gcTime` to optimize network requests and local cache persistence.

## 3. Optimistic Updates

- Update the UI immediately after a mutation, then roll back if the server request fails.

## 4. Infinite Queries

- Use `useInfiniteQuery` for "Load More" or Infinite Scroll patterns.

## 5. Prefetching

- Fetch data before the user actually navigates to a route to make the app feel instantaneous.
