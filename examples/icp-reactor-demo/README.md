# 🚀 IC-Reactor + ICP-CLI Demo

> **Demo for DFINITY DX Team**: Showcasing how ic-reactor integrates seamlessly with the new `icp-cli` and `@icp-sdk/bindgen` workflow.

## Overview

This example demonstrates how to use **ic-reactor** with the new ICP SDK ecosystem:

- **`icp-cli`** - New CLI for building and deploying canisters
- **`@icp-sdk/bindgen`** - Vite plugin to generate TypeScript bindings from `.did` files
- **`@icp-sdk/core/agent/canister-env`** - Runtime canister ID resolution via cookies

## Project Structure

```
icp-reactor-demo/
├── icp.yaml                    # ICP-CLI project config
├── backend/
│   ├── canister.yaml           # Backend canister config
│   ├── src/
│   │   └── lib.rs              # Rust canister code
│   └── dist/
│       ├── backend.wasm        # Built canister
│       └── backend.did         # Candid interface
└── frontend/
    ├── canister.yaml           # Frontend asset canister config
    ├── package.json
    ├── vite.config.ts          # Uses the IC Reactor and bindgen plugins
    └── src/
        ├── App.tsx             # Main app with ic-reactor
        ├── lib/
        │   └── reactor.ts      # IC-Reactor configuration
        └── generated/          # Generated declarations and reactors
```

## Key Features

### 1. Zero-Config Canister ID Resolution

With `@icp-sdk/core/agent/canister-env`, canister IDs are served via cookies from the asset canister:

```tsx
import { getCanisterEnv } from "@icp-sdk/core/agent/canister-env"

const canisterEnv = getCanisterEnv<{
  "PUBLIC_CANISTER_ID:backend": string
}>()

const backendId = canisterEnv["PUBLIC_CANISTER_ID:backend"]
```

### 2. Automatic Bindgen Integration

The `@icp-sdk/bindgen` Vite plugin watches your `.did` files and generates TypeScript bindings:

```ts
// vite.config.ts
import { icpBindgen } from "@icp-sdk/bindgen/plugins/vite"

export default defineConfig({
  plugins: [
    react(),
    icpBindgen({
      didFile: "../../backend/dist/backend.did",
      outDir: "./src/backend/api",
    }),
  ],
})
```

### 3. IC-Reactor with Runtime Environment

IC-Reactor can now consume the canister environment automatically:

```tsx
// lib/reactor.ts
import { ClientManager, DisplayReactor } from "@ic-reactor/react"
import { getCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { idlFactory, type _SERVICE } from "../backend/api/backend"

// Get canister ID from runtime environment (cookie)
const canisterEnv = getCanisterEnv<{
  "PUBLIC_CANISTER_ID:backend": string
}>()

export const reactor = new DisplayReactor<_SERVICE>({
  clientManager,
  canisterId: canisterEnv["PUBLIC_CANISTER_ID:backend"],
  idlFactory,
})
```

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

## Before vs After

### ❌ Before (Hard-coded IDs)

```tsx
// Required: .env file with CANISTER_ID_BACKEND
// Required: Vite define block for process.env
// Required: Rebuild for each environment

const canisterId = process.env.CANISTER_ID_BACKEND // 😱 Hard-coded at build time
```

### ✅ After (Runtime Resolution)

```tsx
// No .env file needed!
// No rebuild for production!
// Works on any network automatically!

import { getCanisterEnv } from "@icp-sdk/core/agent/canister-env"
const { "PUBLIC_CANISTER_ID:backend": canisterId } = getCanisterEnv()
```

## Demo Flow for Raymond

1. **Show icp.yaml** - Single config file for the whole project
2. **Run `icp deploy`** - One command deploys everything
3. **Explain cookie flow** - Asset canister serves IDs via `ic_env` cookie
4. **Show reactor.ts** - Clean integration with `@icp-sdk/core`
5. **Edit backend** - Change `.did`, bindings regenerate automatically
6. **Deploy to mainnet** - Same frontend works without rebuild!

---

**Made with ❤️ by Behrad Deylami for the DFINITY DX Team**
