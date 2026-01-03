# Suspense Infinite Query Demo

This example demonstrates how to use the `createSuspenseInfiniteQuery` function from `@ic-reactor/react` to create a production-ready, Suspense-enabled infinite scrolling list.

## Features Demonstrated

1.  **Mock Actor Manager**: How to simulate a canister call using `ActorManager` interface without a local replica.
2.  **Suspense Integration**: Using React Suspense to handle the initial loading state natively.
3.  **Infinite Loading**: Handling pagination (cursors) and "Load More" functionality seamlessly.
4.  **Type Safety**: Full TypeScript integration for actor methods and query results.

## How to Run

1.  **Install Dependencies**:

    ```bash
    pnpm install
    ```

2.  **Start Local Replica**:
    Make sure you have `dfx` installed.

    ```bash
    cd examples/suspense-infinite-query-demo
    dfx start --background --clean
    ```

3.  **Deploy Canister**:

    ```bash
    dfx deploy
    ```

    This will generate the definitions in `src/declarations`.

4.  **Run Development Server**:
    ```bash
    pnpm dev
    ```

## Code Structure

- `backend/`: Rust canister source code.
- `src/store.ts`: Defines the `ActorManager` (now pointing to local canister) and creates the query.
- `src/App.tsx`: Consumes the query using Suspense.
