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
})
```

No opt-in flag is needed to pick up the plugin's environment in development:
the plugin sets the `ic_env` cookie and `ClientManager` reads it automatically
in the browser. That trust stops at the local replica — cookies are not
origin-isolated, so on a custom domain or mainnet the cookie is ignored and a
reactor with no `canisterId` throws. Set the per-canister `canisterId` in the
plugin config to bake it into the generated output for those builds, or pass
`allowEnvConfig: true` to `ClientManager` if you trust every subdomain of the
domain you serve from.

The plugin generates files under `src/declarations/<canister>/` by default —
`declarations/<did-basename>.{js,d.ts,did}` plus a managed `index.generated.ts`
and a stable `index.ts` wrapper. With `target: "react"`, `index.generated.ts`
exports the reactor and six hooks named after the canister
(`use<Canister>Query`, `use<Canister>SuspenseQuery`,
`use<Canister>InfiniteQuery`, `use<Canister>SuspenseInfiniteQuery`,
`use<Canister>Mutation`, `use<Canister>Method`).

If you want non-React output, set `target: "core"` and install the matching
runtime package instead of `@ic-reactor/react`.

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
  target: "react",
  injectEnvironment: true,
  failOnError: true,
})
```

Relative paths — `didFile`, `outDir` — resolve against Vite's resolved
`config.root`, not the directory vite was started from. If you set
`root: "frontend"`, write the paths as the project itself sees them.

Note `--config` alone does **not** change the root: `vite build --config
apps/web/vite.config.ts` still leaves `root` at the directory vite was started
from, so app-relative paths resolve against the monorepo root. Set `root` in the
config file, or pass it positionally (`vite build apps/web --config …`), for
those paths to mean what the app expects.

`failOnError` decides what a failed canister does to the run. It defaults to
`true` under `vite build` and `false` under `vite dev`: a build that quietly
ships the bindings left over from the last successful run is worse than no
build at all, while a dev server has to survive the broken intermediate states
of a `.did` file being edited.

### Per-canister options

- `name`
- `didFile`
- `outDir`
- `clientManagerPath`
- `target`
- `mode`
- `canisterId`

Supported `mode` values:

- `Reactor`
- `DisplayReactor`
- `CandidReactor`
- `CandidDisplayReactor`
- `MetadataDisplayReactor`

Supported `target` values:

- `react` (default): generates the reactor plus bound React hooks
- `core`: generates only the typed reactor exports with no React dependency

## Local Development Behavior

When `injectEnvironment` is enabled during `vite dev`, the plugin:

1. asks `icp` for the local network status
2. resolves canister IDs — `internet_identity` is added automatically if not
   already in your canister list
3. sets the `ic_env` cookie
4. proxies `/api` to the local replica

If a canister has a `canisterId` set in the plugin config, that value overrides
the auto-detected ID for that canister.

Set the `ICP_ENVIRONMENT` environment variable to target a non-default network
(defaults to `"local"`).

If environment detection fails, the plugin still falls back to proxying `/api`
to `http://127.0.0.1:4943`, but it will not inject canister metadata. It warns
when that happens with canisters configured, because the failure is otherwise
indistinguishable from success until the app breaks on an undefined canister
id. Run with `DEBUG=ic-reactor` to see the `icp` output behind the warning.

## File Regeneration

On startup and on `.did` file changes, the plugin regenerates declarations and
the managed `index.generated.ts` implementation. The user-facing `index.ts`
entry is created once, then preserved unless it still matches the default
wrapper or a legacy generated scaffold that can be migrated automatically.
When a watched `.did` file changes, the plugin sends a full browser reload so
the new declarations are picked up. Regeneration is serialized per canister —
saves that land while a run is in flight collapse into a single rerun — so two
rapid saves cannot interleave inside the pipeline's delete-then-write sequence.
A regeneration that fails is reported to the terminal and to the browser error
overlay rather than leaving the page on stale bindings.

## When To Use It

- Vite apps with active `.did` iteration
- teams that want zero extra codegen commands during development
- projects that want the same output format as the CLI without manual steps

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/vite-plugin
- `@ic-reactor/codegen`: ../codegen/README.md
- `@ic-reactor/cli`: ../cli/README.md
