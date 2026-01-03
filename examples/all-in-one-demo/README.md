# All-in-one Example

This example demonstrates how to implement optimistic updates using `@ic-reactor/react` and a Rust backend.

## Prerequisites

- [DFX SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install/index.mdx)
- Node.js and pnpm

## Setup

1.  **Start the local replica:**

    ```bash
    dfx start --clean --background
    ```

2.  **Deploy the backend canister:**

    ```bash
    dfx deploy backend
    ```

3.  **Create a post:**

    We need some initial data to interact with. Run this command to create a post with ID `0`:

    ```bash
    dfx canister call backend create_post '("Hello from Optimistic UI!")'
    ```

    _Note: The first post created will have ID `0`, which matches the hardcoded ID in `src/App.tsx`._

4.  **Update Canister ID:**

    After deployment, get the canister ID:

    ```bash
    dfx canister id backend
    ```

    Update `src/declarations/backend.ts` with this ID:

    ```typescript
    export const canisterId = "your-canister-id-here"
    ```

    _Alternatively, if you use `dfx generate`, it handles this, but this example uses manual declarations for simplicity._

## Running the Frontend

1.  **Install dependencies:**

    ```bash
    pnpm install
    ```

2.  **Start the dev server:**

    ```bash
    pnpm dev
    ```

3.  **Open the app:**

    Go to `http://localhost:5173` (or whatever port Vite uses).

## What to Look For

- Click "Like" or "Unlike".
- Notice the UI updates **instantly**.
- Check the Network tab to see the actual request finishing slightly later.
- If the request fails (e.g., stop the replica), the UI will roll back to the previous state.
