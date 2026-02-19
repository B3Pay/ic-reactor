# @ic-reactor/vite-plugin

<div align="center">
  <strong>Zero-config Vite plugin for auto-generating IC reactor hooks from Candid files.</strong>
  <br><br>
  
  [![npm version](https://img.shields.io/npm/v/@ic-reactor/vite-plugin.svg)](https://www.npmjs.com/package/@ic-reactor/vite-plugin)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
</div>

---

Automatically generate type-safe React hooks for your Internet Computer canisters. This plugin watches your `.did` files and generates ready-to-use hooks with full TypeScript support using the shared `@ic-reactor/codegen` pipeline.

## Features

- ⚡ **Zero Config** — Point to your `.did` file and get hooks instantly
- 🔄 **Hot Reload** — Automatically regenerates hooks and types when `.did` files change
- 📦 **TypeScript Declarations** — Full built-in type safety
- 🌍 **Auto Environment** — Automatically detects local replica and injects `ic_env` cookie

## Installation

```bash
# With pnpm
pnpm add -D @ic-reactor/vite-plugin

# Required peer dependencies
pnpm add @ic-reactor/react @tanstack/react-query @icp-sdk/core
```

## Quick Start

### 1. Configure the Plugin

```typescript
// vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactorPlugin } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactorPlugin({
      canisters: [
        {
          name: "backend",
          didFile: "./backend/backend.did",
        },
      ],
    }),
  ],
})
```

### 2. Create Your ClientManager

The plugin looks for a client manager to import. By default, it expects it at `../../clients` relative to the generated files.

```typescript
// src/clients.ts
import { ClientManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()
export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true, // Important for cookie injection support
})
```

### 3. Use Generated Hooks

The plugin generates headers in `src/declarations/<name>/index.ts` by default.

```tsx
import { useBackendQuery } from "./declarations/backend"

function MyComponent() {
  const { data, isPending } = useBackendQuery({
    functionName: "get_message",
  })

  return <p>{isPending ? "Loading..." : data}</p>
}
```

## Configuration

### Plugin Options

| Option              | Type               | Description                                         | Default              |
| :------------------ | :----------------- | :-------------------------------------------------- | :------------------- |
| `canisters`         | `CanisterConfig[]` | List of canisters to generate hooks for (required). | -                    |
| `outDir`            | `string`           | Base output directory for generated files.          | `"src/declarations"` |
| `clientManagerPath` | `string`           | Path to client manager import.                      | `"../../clients"`    |
| `injectEnvironment` | `boolean`          | Inject `ic_env` cookie for local development.       | `true`               |

### Canister Config

| Option              | Type     | Description                                     | Required |
| :------------------ | :------- | :---------------------------------------------- | :------- |
| `name`              | `string` | Name of the canister (used for variable names). | Yes      |
| `didFile`           | `string` | Path to the `.did` file.                        | Yes      |
| `outDir`            | `string` | Override output directory for this canister.    | No       |
| `clientManagerPath` | `string` | Override client manager path.                   | No       |
| `canisterId`        | `string` | Optional fixed canister ID.                     | No       |

## Local Development (Environment Injection)

When running `vite dev`, the plugin automatically handles local canister environment connection:

1. Detects your local environment (using `icp` or `dfx` CLI).
2. Sets an `ic_env` cookie containing the root key and canister IDs.
3. Sets up a proxy for `/api` to your local replica.

This means you **don't** need complex `vite.config.ts` proxy rules or manual `.env` file management for local addresses — it just works.

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)
