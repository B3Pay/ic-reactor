# 🚀 IC-Reactor + ICP-CLI Demo

> **Demo for DFINITY DX Team**: Showcasing how ic-reactor integrates seamlessly with the new `icp-cli` workflow and the IC Reactor Vite plugin.

## Overview

This example demonstrates how to use **ic-reactor** with the new ICP SDK ecosystem:

- **`icp-cli`** - New CLI for building and deploying canisters
- **`@ic-reactor/vite-plugin`** - Generates the backend's typed reactor and
  React hooks from its `.did` file, and injects the local `ic_env` cookie
  during `vite dev`
- **`ic_env` cookie** - Canister IDs and the root key reach the app at run time
  while it is served from the local replica

## Project Structure

```
icp-reactor-demo/
├── icp.yaml                    # ICP-CLI project config
├── backend/
│   ├── canister.yaml           # Backend canister config (Motoko recipe)
│   ├── main.mo                 # Motoko canister code
│   └── backend.did             # Candid interface
└── frontend/
    ├── canister.yaml           # Frontend asset canister config
    ├── package.json
    ├── vite.config.ts          # Uses the IC Reactor Vite plugin
    └── src/
        ├── App.tsx             # Main app with ic-reactor
        ├── lib/
        │   └── client.ts       # Your QueryClient, ClientManager and auth hooks
        └── generated/backend/  # Written by the Vite plugin
            ├── declarations/   # Candid bindings
            ├── index.generated.ts  # Reactor + hooks, rewritten on every run
            └── index.ts        # Stable wrapper, yours to extend
```

## Key Features

### 1. Generated Reactor and Hooks

The Vite plugin reads `backend/backend.did` and writes the reactor and hooks
into `src/generated/backend/`, on every build and whenever the `.did` changes
under `vite dev`:

```ts
// frontend/vite.config.ts
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      canisters: [
        {
          name: "backend",
          didFile: "../backend/backend.did",
          mode: "DisplayReactor",
        },
      ],
      clientManagerPath: "../../lib/client",
      outDir: "./src/generated",
    }),
  ],
})
```

### 2. You Own the ClientManager

The generated reactor imports `clientManager` from `src/lib/client.ts`, so the
agent, the `QueryClient` and authentication stay in your code:

```tsx
// frontend/src/lib/client.ts
export const clientManager = new ClientManager({ queryClient })
export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)

// frontend/src/generated/backend/index.generated.ts (generated)
export const backendReactor = new DisplayReactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
})
export const { useActorQuery: useBackendQuery /* , ... */ } =
  createActorHooks(backendReactor)
```

### 3. Canister IDs From the `ic_env` Cookie

The generated reactor has no `canisterId`: `ClientManager` resolves
`PUBLIC_CANISTER_ID:backend` from the `ic_env` cookie, which the plugin sets
under `vite dev` and the asset canister sets when it serves the app. It trusts
that cookie only on a local replica, because cookies are not origin-isolated.
On mainnet or a custom domain the reactor throws `canisterId is required` as
soon as it is imported, so set the per-canister `canisterId` in the plugin
config for those builds (it is written into `index.generated.ts`), or pass
`allowEnvConfig: true` to `ClientManager` if you trust every subdomain of the
domain you serve from.

## Quick Start

### Prerequisites

- [icp-cli](https://github.com/dfinity/icp-cli) installed
- Node.js 22+
- pnpm

### 1. Start Local Network

```bash
icp network start -d
```

### 2. Deploy Canisters

```bash
icp deploy
```

The asset canister serves the production build and its `ic_env` cookie at
`http://<frontend_canister_id>.localhost:8000/`.

### 3. Run the Frontend Dev Server (optional)

For live development, deploy the backend first and let the Vite plugin inject
the same canister environment locally:

```bash
icp deploy backend
pnpm --dir frontend install
pnpm --dir frontend dev
```

### 4. Open in Browser

Visit the Vite URL printed in the terminal (normally `http://localhost:5173/`).

## Demo Flow for Raymond

1. **Show icp.yaml** - Single config file for the whole project
2. **Run `icp deploy`** - One command deploys everything
3. **Explain cookie flow** - Asset canister serves IDs via `ic_env` cookie
4. **Show lib/client.ts and generated/backend** - You own the ClientManager; the plugin owns the reactor and hooks
5. **Edit backend** - Change `.did`, bindings regenerate automatically under `vite dev`
6. **Deploy to mainnet** - Set the backend's `canisterId` in the plugin config first (see Key Features 3)

---

**Made with ❤️ by Behrad Deylami for the DFINITY DX Team**
