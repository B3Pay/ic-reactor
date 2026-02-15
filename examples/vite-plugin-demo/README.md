# Vite Plugin Demo

This example demonstrates how to use the `@ic-reactor/vite-plugin` to automatically generate React hooks for your Internet Computer canisters.

## Features

- **Auto-generated Hooks**: Typed hooks are generated from `backend.did`.
- **Zero-config Proxy**: communication with local replica is handled automatically.
- **Environment Aware**: Automatic detection of canister IDs and root keys via `icp-cli`.

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Generate hooks (happens automatically on dev/build):

   ```bash
   pnpm dev
   ```

3. Check the generated files in `src/canisters/backend/`.

## Project Structure

- `src/declarations/backend.did`: Your Candid interface.
- `src/lib/reactor.ts`: Central `ClientManager` configuration.
- `src/canisters/backend/`: Generated hooks and declarations.
- `vite.config.ts`: Plugin configuration.
