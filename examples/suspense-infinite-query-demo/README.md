# Suspense Infinite Query Demo

This example demonstrates `createSuspenseInfiniteQueryFactory` with a local
Rust canister and a traditional `dfx` workflow.

## What It Shows

- `ClientManager` and `Reactor` setup for a local replica
- `createSuspenseInfiniteQueryFactory` for cursor-based pagination
- React Suspense for the first load
- typed `getNextPageParam` handling from real canister results

## Run It

```bash
cd examples/suspense-infinite-query-demo
pnpm install
dfx start --background --clean
dfx deploy
pnpm dev
```

`dfx deploy` generates the declarations consumed by `src/store.ts`.

## Key Files

- `src/store.ts` sets up the shared `ClientManager`, `Reactor`, auth hooks, and
  `createSuspenseInfiniteQueryFactory`
- `src/App.tsx` renders the paginated list inside a Suspense boundary
- `backend/src/lib.rs` implements the demo canister and pagination response

## Core Factory

```ts
export const getPostsQuery = createSuspenseInfiniteQueryFactory(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getNextPageParam: (lastPage) => {
    if (lastPage.next_cursor.length === 0) return undefined
    return lastPage.next_cursor[0]
  },
})
```

Use this example when you want a minimal reference for suspense-enabled
infinite queries against a locally deployed canister.
