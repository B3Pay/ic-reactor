# Setup

Examples for the setups in the skill's decision table. The imports from
`./declarations/backend` stand for the canister's declarations: `idlFactory`
from the generated `.js`, the `_SERVICE` type from the `.d.ts`, and
`canisterId`, the canister's id as text (a constant or a build-time value).

## One-call setup: `defineReactor` / `defineDisplayReactor`

```ts
// src/reactor.ts
import { defineDisplayReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const backendApp = defineDisplayReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  // Required unless the Vite plugin injects it on a local replica
  canisterId,
})

export const {
  reactor: backend,
  useActorQuery,
  useActorMutation,
  useAuth,
} = backendApp
```

- `defineDisplayReactor` gives strings for `nat`, `int` and `principal`, hex
  for `blob` and `T | undefined` for `opt`. Use `defineReactor` (same options)
  for raw `bigint`, `Principal`, `Uint8Array` and `[] | [T]`.
- The result also holds `useActorSuspenseQuery`, `useActorInfiniteQuery`,
  `useActorSuspenseInfiniteQuery`, `useActorMethod`, `useAgentState`,
  `useUserPrincipal`, `useIdentityAttributes`, `clientManager`, `queryClient`,
  `authentication` and `identityAttributes`. `authentication` and
  `identityAttributes` are lazy, so `@icp-sdk/auth` loads only once sign-in is
  used.
- Module scope is right in a client-only app. In a server-rendered app, wrap
  this call in `createReactorProvider` (see `server-rendering.md`).

## A second canister on the same sign-in

```ts
// src/ledger.ts
import { defineReactor } from "@ic-reactor/react"
import {
  canisterId as ledgerId,
  idlFactory as ledgerIdl,
  type _SERVICE as Ledger,
} from "./declarations/ledger"
import { backendApp } from "./reactor"

export const ledgerApp = defineReactor<Ledger>({
  name: "ledger",
  idlFactory: ledgerIdl,
  canisterId: ledgerId,
  // Adopts backendApp's ClientManager: one agent, one Internet Identity session
  authentication: backendApp.authentication,
})
export const ledger = ledgerApp.reactor
```

Passing a different `clientManager` alongside `authentication` throws. For
more ledgers of the same interface, use `ledger.forCanister(otherId)` rather
than another `defineReactor`.

## Manual setup

When construction order must be explicit, or the app injects its own
`QueryClient`:

```ts
// src/manual.ts
import {
  ClientManager,
  DisplayReactor,
  createActorHooks,
  reactorRetry,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient({
  // A QueryClient you build keeps TanStack's retry unless you set this
  defaultOptions: { queries: { retry: reactorRetry } },
})
export const clientManager = new ClientManager({ queryClient })

export const backend = new DisplayReactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId,
})

export const { useActorQuery, useActorMutation } = createActorHooks(backend)
```

The hooks bind to the reactor's own `QueryClient`, so a
`QueryClientProvider` is optional. Without React, install
`@ic-reactor/core` and `@tanstack/query-core`, import `ClientManager` and
`Reactor` from `@ic-reactor/core`, and use the imperative API.

## Code generation

### Vite

```ts
// vite.config.ts
import { defineConfig, loadEnv } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [
      icReactor({
        // outDir "src/declarations" and clientManagerPath "../../clients" by
        // default, so src/clients.ts must export `clientManager`
        canisters: [
          {
            name: "backend",
            didFile: "./backend/backend.did",
            factories: true, // a query or mutation object per method
            // Written into the generated reactor and used under `vite dev`
            // too, so take it from the environment
            canisterId: env.CANISTER_ID_BACKEND,
          },
        ],
      }),
    ],
  }
})
```

### CLI (any other project, or CI)

`pnpm exec ic-reactor init` writes `ic-reactor.json`; run
`pnpm exec ic-reactor generate` after every `.did` change.

```json
{
  "$schema": "./node_modules/@ic-reactor/cli/schema.json",
  "outDir": "src/declarations",
  "clientManagerPath": "../../clients",
  "canisters": {
    "backend": {
      "name": "backend",
      "didFile": "./backend/backend.did",
      "canisterId": "rrkah-fqaaa-aaaaa-aaaaq-cai",
      "factories": true
    }
  }
}
```

### The clients module both tools import

```ts
// src/clients.ts
import {
  AuthenticationManager,
  ClientManager,
  createAuthHooks,
  reactorRetry,
} from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: reactorRetry } },
})
export const clientManager = new ClientManager({ queryClient })

// Optional Internet Identity sign-in (needs @icp-sdk/auth); every generated
// reactor on this clientManager then calls as the signed-in user
export const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
```

### Using the output

Each canister's folder (`src/declarations/backend/`) holds `declarations/`,
`index.generated.ts` (`backendReactor` and `useBackendQuery`,
`useBackendMutation`, ...), `index.factories.generated.ts` with
`factories: true` (`getPostsQuery`, `getPostQuery`, `likePostMutation`, ...)
and `index.ts`, the stable entry you import and may edit.

```tsx
import { getPostQuery, likePostMutation } from "./declarations/backend"

export function Post({ id }: { id: string }) {
  const { data: post } = getPostQuery([id]).useQuery()
  const like = likePostMutation.useMutation({
    invalidateQueries: [getPostQuery],
  })
  return <button onClick={() => like.mutate([id])}>{post?.likes} likes</button>
}
// Outside React: await getPostQuery([id]).fetch()
//                await likePostMutation.execute([id])
```

A method that takes arguments becomes a `createQueryFactory` object (called
with the args, as `getPostQuery([id])`); one without becomes a `createQuery`
object (`getPostsQuery.useQuery()`). Never edit the two `*.generated.ts`
files or `declarations/`; add custom objects and invalidation wiring to
`index.ts`.

Docs: https://ic-reactor.b3pay.net/v3/framework/react-setup.md,
https://ic-reactor.b3pay.net/v3/packages/vite-plugin.md,
https://ic-reactor.b3pay.net/v3/packages/cli.md
