# Vite Environment Variables Example

This example demonstrates how a Vite frontend can discover local canister IDs
and root keys through the `ic_env` cookie.

The frontend uses `@ic-reactor/vite-plugin` to:

- generate React hooks for the `backend` canister from Candid;
- serve an `ic_env` cookie during local Vite development;
- let `ClientManager` auto-detect the local network host and root key.

## Project Layout

- [backend](./backend/) contains a Motoko Hello World canister.
- [frontend](./frontend/) contains the React/Vite app and generated canister
  bindings.

## Run Locally

Start the local ICP CLI network and deploy the backend:

```bash
icp network start
icp deploy backend
```

Install frontend dependencies and run Vite:

```bash
cd frontend
pnpm install
pnpm run dev
```

Open the Vite URL printed in the terminal. The dev server sets the same
canister environment cookie that the frontend asset canister would set after a
local deploy.

## Build

```bash
cd frontend
pnpm run build
```

The build also runs the Vite plugin, so generated hooks stay in sync with the
configured Candid interface.

## Notes

- This example intentionally uses `@ic-reactor/vite-plugin`; the plugin is the
  local environment source for the app.
- The app does not configure `withCanisterEnv` manually. `ClientManager`
  detects the `ic_env` cookie supplied by the plugin.
- The example does not use Internet Identity.
