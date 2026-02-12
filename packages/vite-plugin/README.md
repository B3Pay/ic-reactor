# @ic-reactor/vite-plugin

<div align="center">
  <strong>Zero-config Vite plugin for auto-generating IC reactor hooks from Candid files.</strong>
  <br><br>
  
  [![npm version](https://img.shields.io/npm/v/@ic-reactor/vite-plugin.svg)](https://www.npmjs.com/package/@ic-reactor/vite-plugin)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
</div>

---

Automatically generate type-safe React hooks for your Internet Computer canisters. This plugin watches your `.did` files and generates ready-to-use hooks with full TypeScript support.

## Features

- ⚡ **Zero Config** — Point to your `.did` file and get hooks instantly
- 🔄 **Hot Reload** — Automatically regenerates hooks when `.did` files change
- 📦 **TypeScript Declarations** — Full type safety with auto-generated types
- 🎯 **Display Types** — Optional `DisplayReactor` support for React-friendly types
- 🔌 **Flexible** — Works with any `ClientManager` configuration

## Installation

```bash
# With npm
npm install -D @ic-reactor/vite-plugin

# With pnpm
pnpm add -D @ic-reactor/vite-plugin

# Required peer dependencies
npm install @ic-reactor/react @tanstack/react-query @icp-sdk/core
npm install -D @icp-sdk/bindgen
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

The plugin expects you to have a `ClientManager` exported from a file. By default, it looks for `./src/lib/client.ts`:

```typescript
// src/lib/client.ts
import { ClientManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
  withCanisterEnv: true, // Enable environment-based canister ID resolution
})
```

### 3. Use Generated Hooks

The plugin generates hooks in `./src/canisters/<name>/index.ts`:

```tsx
// Generated at: ./src/canisters/backend/index.ts
import {
  backendReactor,
  useBackendQuery,
  useBackendMutation,
  useBackendSuspenseQuery,
} from "./canisters/backend"

function MyComponent() {
  // Query data
  const { data, isPending } = useBackendQuery({
    functionName: "get_message",
  })

  // Mutate data
  const { mutate } = useBackendMutation({
    functionName: "set_message",
    onSuccess: () => console.log("Message updated!"),
  })

  return (
    <div>
      <p>{isPending ? "Loading..." : data}</p>
      <button onClick={() => mutate(["Hello IC!"])}>Update</button>
    </div>
  )
}
```

## Configuration

### Plugin Options

```typescript
interface IcReactorPluginOptions {
  /** List of canisters to generate hooks for */
  canisters: CanisterConfig[]
  /** Base output directory (default: "./src/canisters") */
  outDir?: string
  /** Path to import ClientManager from (default: "../../lib/client") */
  clientManagerPath?: string
}

interface CanisterConfig {
  /** Name of the canister (used for variable naming) */
  name: string
  /** Path to the .did file */
  didFile: string
  /** Output directory (default: ./src/canisters/<name>) */
  outDir?: string
  /** Use DisplayReactor for React-friendly types (default: true) */
  useDisplayReactor?: boolean
  /** Path to import ClientManager from (relative to generated file) */
  clientManagerPath?: string
}
```

### Example: Multiple Canisters

```typescript
// vite.config.ts
import { icReactorPlugin } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactorPlugin({
      clientManagerPath: "@/lib/client", // Global default
      canisters: [
        {
          name: "backend",
          didFile: "./backend/backend.did",
        },
        {
          name: "ledger",
          didFile: "./ledger/ledger.did",
          useDisplayReactor: true, // BigInt → string, etc.
        },
        {
          name: "nft",
          didFile: "./nft/nft.did",
          outDir: "./src/services/nft", // Custom output
          clientManagerPath: "@/lib/nft-client", // Custom client
        },
      ],
    }),
  ],
})
```

## Advanced Plugin

For more granular control, use `icReactorAdvancedPlugin` which generates individual hooks per method:

```typescript
import { icReactorAdvancedPlugin } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactorAdvancedPlugin({
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

This generates method-specific hooks:

```tsx
import {
  useGetMessageQuery,
  useSetMessageMutation,
  getMessageQuery, // Static query for no-arg methods
} from "./canisters/backend"

function MyComponent() {
  // Method-specific hook
  const { data } = useGetMessageQuery([], { staleTime: 5000 })

  // Static query usage
  const { data: cached } = getMessageQuery.useQuery()

  const { mutate } = useSetMessageMutation()

  return <div>{data}</div>
}
```

## Generated File Structure

```
src/
├── canisters/
│   └── backend/
│       ├── index.ts          # Reactor + hooks
│       └── declarations/
│           └── backend.did.ts  # Type declarations
├── lib/
│   └── client.ts             # Your ClientManager (not generated)
```

## How It Works

1. **Build Start**: The plugin reads your `.did` files and uses `@icp-sdk/bindgen` to generate TypeScript declarations
2. **Code Generation**: Creates a reactor instance and typed hooks for each canister
3. **Hot Reload**: Watches for `.did` file changes and regenerates hooks automatically

## DisplayReactor vs Reactor

By default, the plugin uses `DisplayReactor` which transforms Candid types into React-friendly formats:

| Candid Type | Reactor      | DisplayReactor |
| ----------- | ------------ | -------------- |
| `nat`       | `bigint`     | `string`       |
| `int`       | `bigint`     | `string`       |
| `principal` | `Principal`  | `string`       |
| `vec nat8`  | `Uint8Array` | `string` (hex) |

To use raw Candid types:

```typescript
icReactorPlugin({
  canisters: [
    {
      name: "backend",
      didFile: "./backend/backend.did",
      useDisplayReactor: false, // Use Reactor instead
    },
  ],
})
```

## Integration with ICP CLI

`@ic-reactor/vite-plugin` now supports **zero-config local `icp-cli` canister env injection** during `vite dev`.

When dev server starts, the plugin automatically tries to read:

- `.icp/cache/mappings/local.ids.json`

If present, it sets an `ic_env` cookie with:

- `ic_root_key=<local-root-key>`
- `PUBLIC_CANISTER_ID:<name>=<canister-id>`

This means `withCanisterEnv: true` works out of the box after `icp deploy`, without custom cookie code in `vite.config.ts`.

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

If you need to disable this behavior:

```typescript
icReactorPlugin({
  canisters: [...],
  autoInjectIcEnv: false,
})
```

## Requirements

- **Vite 5.x, 6.x, or 7.x**
- **Node.js 18+**
- **TypeScript 5.0+**

## Related Packages

- [@ic-reactor/react](https://www.npmjs.com/package/@ic-reactor/react) — React hooks for IC
- [@ic-reactor/core](https://www.npmjs.com/package/@ic-reactor/core) — Core reactor functionality
- [@icp-sdk/bindgen](https://www.npmjs.com/package/@icp-sdk/bindgen) — Candid binding generator

## Documentation

For comprehensive guides and API reference, visit the [documentation site](https://b3pay.github.io/ic-reactor/v3).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)
