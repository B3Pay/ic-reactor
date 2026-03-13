# @ic-reactor/vite-plugin

Vite plugin for IC Reactor code generation. It runs the shared
`@ic-reactor/codegen` pipeline, watches `.did` files, and can inject the
`ic_env` cookie used by `ClientManager` during local development.

## Install

```bash
pnpm add -D @ic-reactor/vite-plugin
pnpm add @ic-reactor/react @tanstack/react-query @icp-sdk/core
```

## Quick Start

```ts
// vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      canisters: [{ name: "backend", didFile: "./backend/backend.did" }],
    }),
  ],
})
```

```ts
// src/clients.ts
import { ClientManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()
export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true,
})
```

The plugin generates files under `src/declarations/<canister>/` by default.

## Options

```ts
icReactor({
  canisters: [
    {
      name: "backend",
      didFile: "./backend/backend.did",
      mode: "DisplayReactor",
    },
  ],
  outDir: "src/declarations",
  clientManagerPath: "../../clients",
  injectEnvironment: true,
})
```

### Per-canister options

- `name`
- `didFile`
- `outDir`
- `clientManagerPath`
- `mode`
- `canisterId`

Supported `mode` values:

- `Reactor`
- `DisplayReactor`
- `CandidReactor`
- `CandidDisplayReactor`
- `MetadataDisplayReactor`

## Local Development Behavior

When `injectEnvironment` is enabled during `vite dev`, the plugin:

1. asks `icp-cli` for the local network status
2. resolves configured canister IDs
3. sets the `ic_env` cookie
4. proxies `/api` to the local replica

If environment detection fails, the plugin still falls back to proxying `/api`
to `http://127.0.0.1:4943`, but it will not inject canister metadata.

## File Regeneration

On startup and on `.did` file changes, the plugin regenerates declarations and
the managed `index.generated.ts` implementation. The user-facing `index.ts`
entry is created once, then preserved unless it still matches the default
wrapper or a legacy generated scaffold that can be migrated automatically.
When a watched `.did` file changes, the plugin sends a full browser reload so
the new declarations are picked up.

## When To Use It

- Vite apps with active `.did` iteration
- teams that want zero extra codegen commands during development
- projects that want the same output format as the CLI without manual steps

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/vite-plugin
- `@ic-reactor/codegen`: ../codegen/README.md
- `@ic-reactor/cli`: ../cli/README.md
