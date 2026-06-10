# Vite Plugin Demo

This example demonstrates `@ic-reactor/vite-plugin` in a React/Vite app.

The plugin generates typed React hooks from `frontend/declarations/backend.did`
and provides the local `ic_env` cookie used by `ClientManager` during Vite
development.

## What it demonstrates

- Generating canister declarations and hooks during dev/build
- Sharing a central `ClientManager` and `QueryClient`
- Calling generated query and mutation hooks from React components
- Using package-level local environment detection instead of manual
  `withCanisterEnv` configuration

## Run Locally

Start the local ICP CLI network and deploy the backend canister:

```bash
icp network start
icp deploy backend
```

Install dependencies and run Vite:

```bash
pnpm install
pnpm run dev
```

Open the Vite URL printed in the terminal. The plugin reads the local canister
environment and serves it to the browser as `ic_env`.

## Build

```bash
pnpm run build
```

## Project Structure

- `frontend/declarations/backend.did`: source Candid interface
- `frontend/lib/clients.ts`: shared `ClientManager` and `QueryClient`
- `frontend/lib/canisters/backend/`: generated declarations and hooks
- `vite.config.ts`: Vite plugin configuration
