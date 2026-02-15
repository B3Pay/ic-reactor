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

The plugin expects you to have a `ClientManager` exported from a file. By default, it looks for `./src/lib/reactor.ts`:

```typescript
// src/lib/reactor.ts
import { ClientManager } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient()
export const clientManager = new ClientManager({ queryClient })
```

### 3. Use Generated Hooks

The plugin generates a `reactor.ts` file in your canister folder (default: `./src/canisters/<name>/index.ts`):

```tsx
import { useActorQuery, useActorMutation } from "./canisters/backend"

function MyComponent() {
  const { data, isPending } = useActorQuery({
    functionName: "get_message",
  })

  return <p>{isPending ? "Loading..." : data}</p>
}
```

## Configuration

### Plugin Options

| Option              | Type               | Description                                          | Default             |
| :------------------ | :----------------- | :--------------------------------------------------- | :------------------ |
| `canisters`         | `CanisterConfig[]` | List of canisters to generate hooks for.             | `[]`                |
| `outDir`            | `string`           | Base output directory for generated files.           | `"./src/canisters"` |
| `autoInjectIcEnv`   | `boolean`          | Whether to inject canister IDs into `ic_env` cookie. | `true`              |
| `clientManagerPath` | `string`           | Path to a custom `ClientManager` instance.           | undefined           |

### Canister Config

| Option              | Type      | Description                                         | Required |
| :------------------ | :-------- | :-------------------------------------------------- | :------- |
| `name`              | `string`  | Name of the canister (used in generated code).      | Yes      |
| `didFile`           | `string`  | Path to the `.did` file.                            | Yes      |
| `outDir`            | `string`  | Override output directory for this canister.        | No       |
| `useDisplayReactor` | `boolean` | Use `DisplayReactor` instead of standard `Reactor`. | `true`   |
| `clientManagerPath` | `string`  | Override client manager path for this canister.     | No       |

## How It Works

1. **Build Start**: The plugin reads your `.did` files and generates TypeScript declarations.
2. **Code Generation**: Creates a reactor instance and typed hooks (using `createActorHooks`) for each canister.
3. **Hot Reload**: Watches for `.did` file changes and regenerates everything automatically.
4. **Local Proxy**: Configures a Vite proxy to redirect `/api` calls to your local replica.
5. **Environment Detection**: Automatically injects canister IDs from `icp-cli` or `dfx` cache into your session.

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
