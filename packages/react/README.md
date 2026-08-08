# @ic-reactor/react

React bindings for IC Reactor. This package re-exports everything from
`@ic-reactor/core` and adds hook factories, auth hooks, direct reactor hooks,
and reusable query or mutation factories built around TanStack Query.

## Install

```bash
pnpm add @ic-reactor/react @icp-sdk/core @tanstack/react-query

# Optional: Internet Identity login helpers
pnpm add @icp-sdk/auth
```

`@icp-sdk/auth` is an optional peer. `AuthenticationManager` reaches it through a
literal `import("@icp-sdk/auth/client")`, so Vite, Rollup and webpack code-split
it into its own async chunk. That chunk is never fetched unless something
touches authentication, and its bytes are dropped from the output entirely in
apps that never reference the class.

Bundlers still **resolve** that specifier while building the module graph, which
happens before any tree-shaking — so a missing peer cannot simply be optimized
away. The import therefore sits inside a `try` block, which webpack-family
bundlers treat as declaring an optional dependency: with the peer absent the
build succeeds and prints one warning,
`Module not found: Can't resolve '@icp-sdk/auth/client'`. Only the login paths
are affected, and they throw an actionable error if they are ever called.

Install the peer to remove the warning, or silence it with
[`ignoreWarnings`](https://webpack.js.org/configuration/other-options/#ignorewarnings):

```js
// webpack.config.js / next.config.js (webpack)
ignoreWarnings: [{ module: /@ic-reactor\/react/, message: /@icp-sdk\/auth/ }]
```

## Quick Start

```tsx
// src/reactor.ts
import { ClientManager, Reactor, createActorHooks } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
})

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  // Required. Omit it only when the vite-plugin injects an `ic_env` cookie for
  // this canister; outside that flow the constructor throws.
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})

export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorMethod,
} = createActorHooks(backend)
```

```tsx
// src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient, useActorMethod, useActorQuery } from "./reactor"

function Greeting() {
  const { data, isPending } = useActorQuery({
    functionName: "greet",
    args: ["World"],
  })

  if (isPending) return <p>Loading...</p>
  return <p>{data}</p>
}

function Increment() {
  const { call, isPending } = useActorMethod({ functionName: "increment" })

  return (
    <button disabled={isPending} onClick={() => call([])}>
      {isPending ? "Updating..." : "Increment"}
    </button>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Greeting />
      <Increment />
    </QueryClientProvider>
  )
}
```

## Main APIs

- `createActorHooks(reactor)` for per-canister hooks like `useActorQuery` and
  `useActorMutation`
- `createAuthHooks(authentication)` for `useAuth`, `useAgentState`, and
  `useUserPrincipal`
- `createIdentityAttributeHooks(identityAttributes)` for signed identity
  attribute requests
- direct reactor hooks like `useReactorQuery` when you want to pass the reactor
  instance at call time
- factory helpers like `createQuery`, `createSuspenseQuery`,
  `createInfiniteQuery`, `createSuspenseInfiniteQuery`, and `createMutation`
  when the same operation must work both inside and outside React

## Choosing the Right Pattern

- Use `createActorHooks` for the simplest component-first integration.
- Use query and mutation factories when you also need loader, action, service,
  or test usage through `.fetch()`, `.prefetch()`, `.execute()`, `.invalidate()`,
  `.getCacheData()`, or `.setData()`.
- Use `DisplayReactor` when you want UI-friendly values such as strings instead
  of `bigint` or `Principal`.
- Use generated hooks from `@ic-reactor/vite-plugin` or `@ic-reactor/cli` when
  you have larger canisters or frequent `.did` changes.

## Factory Example

```ts
import { createSuspenseQueryFactory, createMutation } from "@ic-reactor/react"
import { backend } from "./reactor"

export const getProfile = createSuspenseQueryFactory(backend, {
  functionName: "get_profile",
})

export const updateProfile = createMutation(backend, {
  functionName: "update_profile",
  onCanisterError: (err) => console.error("Canister Err variant:", err.code),
})
```

```tsx
const profileQuery = getProfile(["alice"])

// React component
const { data } = profileQuery.useSuspenseQuery()

// Prefetch before navigating (fire-and-forget)
profileQuery.prefetch()

// Optimistic update
profileQuery.setData({ id: "alice", name: "Alice" })

// Mutation with cache invalidation
const mutation = updateProfile.useMutation({
  invalidateQueries: [profileQuery.getQueryKey()],
})
```

## Internet Identity

`defineReactor` wires up Internet Identity for you — `useAuth`,
`useUserPrincipal`, `useAgentState` and `useIdentityAttributes` come back
alongside the actor hooks:

```tsx
// src/reactor.ts
export const { useActorQuery, useAuth, useIdentityAttributes, authentication } =
  defineReactor<_SERVICE>({
    name: "backend",
    idlFactory,
    auth: {
      // Required when the app is served from more than one origin, so every
      // origin resolves to the same principal.
      derivationOrigin: "https://app.example.com",
      // The default signs the user out and reloads after 10 minutes idle.
      idleOptions: { disableIdle: true },
    },
  })
```

Auth options are forwarded to the underlying `@icp-sdk/auth` client:
`identityProvider`, `derivationOrigin`, `windowOpenerFeatures`,
`openIdProvider`, `storage`, `keyType`, `idleOptions`, `identity`, and
`transport`. Only the `"google" | "apple" | "microsoft"` aliases are accepted
for `openIdProvider`; any other value is dropped, since raw issuer URLs are
only meaningful on `requestOpenIdAttributes`, where they scope the keys.

Pass `authentication` from one reactor into another to share a single session
across canisters. That reactor adopts the manager's `ClientManager` so sign-in
updates the agent it calls through, so pass either `authentication` or `auth` —
not both.

Set up manually when you need more control:

```tsx
// src/auth.ts
import {
  AuthenticationManager,
  IdentityAttributesManager,
  createAuthHooks,
  createIdentityAttributeHooks,
} from "@ic-reactor/react"
import { clientManager } from "./reactor"

const authentication = new AuthenticationManager({ clientManager })
export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)

const identityAttributes = new IdentityAttributesManager(authentication)
export const { useIdentityAttributes } =
  createIdentityAttributeHooks(identityAttributes)
```

`useAuth()` calls `authentication.prepareClient()` on mount. Outside React, do
it yourself during startup — it preloads the auth module so `login()` can open
the identity provider window synchronously inside a click handler, which is
what browser popup blockers require:

```ts
// once, at startup — awaits the dynamic import and builds the AuthClient
await authentication.prepareClient()

// later, inside the click handler — no await before signIn(), so the popup
// still counts as user-initiated
button.onclick = () => authentication.login()
```

`authentication.getPreparedClient()` returns the already-built client
synchronously, or `undefined` when the module has not loaded yet.

If your bundler cannot resolve the optional peer at all, construct the client
yourself and inject it — IC Reactor then never imports `@icp-sdk/auth`:

```ts
import { AuthClient } from "@icp-sdk/auth/client"

const authentication = new AuthenticationManager({
  clientManager,
  authClient: new AuthClient(),
})
```

## Identity Attributes / OpenID email and profile values

Identity attributes use a dedicated `IdentityAttributesManager`, with React
bindings created by `createIdentityAttributeHooks`. Works with `@icp-sdk/auth`
v7 and v8; the two versions disagree on the nonce contract and IC Reactor
normalizes whichever form you pass.

**Pass the nonce as a callback.** Awaiting your backend before calling
`requestOpenIdAttributes` ends the user gesture, and the browser then blocks
the Internet Identity window:

```tsx
// ✅ window opens immediately, nonce resolves while the user is in II
await requestOpenIdAttributes({
  nonce: () => backend.callMethod({ functionName: "register_begin" }),
  openIdProvider: "google",
  keys: ["email", "name"],
})

// ❌ gesture is gone by the time the window would open
const nonce = await backend.callMethod({ functionName: "register_begin" })
await requestOpenIdAttributes({ nonce, openIdProvider: "google", keys })
```

```tsx
// src/RegisterWithOpenIdProvider.tsx
import { useIdentityAttributes } from "./auth"
import { backend } from "./reactor"

function RegisterWithOpenIdProvider() {
  const {
    requestOpenIdAttributes,
    attributes,
    isRequestingAttributes,
    attributeError,
  } = useIdentityAttributes()

  async function handleProviderLogin() {
    const result = await requestOpenIdAttributes({
      nonce: () => backend.callMethod({ functionName: "register_begin" }),
      openIdProvider: "microsoft",
      keys: ["email", "name"],
      windowOpenerFeatures: popupCenter(),
    })

    console.log(result.decodedAttributes.email)
    console.log(result.decodedAttributes.name)

    await backend.callMethod({
      functionName: "register_finish",
      args: [
        {
          data: result.signedAttributes.data,
          signature: result.signedAttributes.signature,
        },
      ],
    })
  }

  return (
    <button disabled={isRequestingAttributes} onClick={handleProviderLogin}>
      {attributes?.decodedAttributes.email ??
        attributeError?.message ??
        "Continue with provider"}
    </button>
  )
}
```

Use a documented auth provider alias (`"google"`, `"apple"`, or `"microsoft"`)
or the provider issuer URL your app expects for `openIdProvider`.

Frontend decoded `email` and `name` values are for display only. Production flows
must send `signedAttributes.data` and `signedAttributes.signature` to the backend
or canister and verify the signature, nonce, origin, timestamp, and requested keys
before trusting or storing the attributes.

## Server-Side Rendering

**Build the reactor inside the request, not at module scope.**

A reactor owns its `QueryClient`. On a server a module-scope reactor is created
once per process and shared by every request, and query keys are
`[canisterId, functionName, args]` — they do not include the caller. So a
cached result for a caller-scoped method (`get_my_balance`, a deposit address,
`my_profile`) is handed to whichever request asks next:

```tsx
// ❌ Shared by every request on the server
export const app = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId,
})
```

```tsx
// ✅ Per request: nothing is shared between users
export default async function Page() {
  const app = defineReactor<_SERVICE>({
    name: "backend",
    idlFactory,
    canisterId,
    queryClient: new QueryClient(),
  })

  const data = await app.reactor.fetchQuery({ functionName: "get_my_profile" })
  return <Profile data={data} />
}
```

Two further constraints on the App Router specifically:

- Hooks are client-only, like every React hook — call them from a `"use client"`
  module. A server component may import `Reactor` / `ClientManager` and make
  imperative calls; that path works.
- Hooks bind to their reactor's own `QueryClient` rather than to a
  `QueryClientProvider`, so `HydrationBoundary` prefetch does not feed them
  unless the provider's client _is_ that reactor's client. Next.js also
  evaluates a shared module twice on the server (the RSC and SSR graphs), so a
  module-scope reactor is two different instances there.

If none of that applies — a client-only SPA — module-scope reactors are exactly
right and none of this is a concern.

## Query Result Methods

Every object returned by `createQuery`, `createSuspenseQuery`, and their
factory variants exposes:

| Method                              | Description                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `fetch()`                           | Cache-first fetch — returns data, populates cache. Use in route loaders.                        |
| `prefetch()`                        | Fire-and-forget cache warm-up. Use on hover or before navigation.                               |
| `invalidate()`                      | Invalidates the cache entry (triggers refetch if query is mounted).                             |
| `getQueryKey()`                     | Returns the TanStack Query key for this query.                                                  |
| `getCacheData(select?)`             | Read directly from cache without fetching. Returns `undefined` if not cached.                   |
| `setData(updater)`                  | Write raw data into the cache. Accepts a value or updater function. Use for optimistic updates. |
| `useQuery()` / `useSuspenseQuery()` | React hook for the query.                                                                       |

## Canister Error Handling

Canister methods can return `Result { Err: E }` variants. These are surfaced
as `CanisterError` and can be handled separately from network or agent errors
via `onCanisterError`. This callback is supported on both `createMutation` and
the direct `useActorMutation` hook:

```tsx
// Via createActorHooks
const { mutate } = useActorMutation({
  functionName: "transfer",
  onCanisterError: (err, vars) => {
    // err.code — the Err variant key (e.g. "InsufficientFunds")
    // err.err  — the typed Err value
    console.error(`Transfer failed: ${err.code}`, vars)
  },
  onError: (err) => {
    // Fires for ALL errors: canister Err variants, network failures, etc.
    console.error("Unexpected error", err)
  },
})

// Via createMutation factory
const transferMutation = createMutation(backend, {
  functionName: "transfer",
  onCanisterError: (err) => toast.error(`${err.code}`),
})
```

## Re-exports

`@ic-reactor/react` re-exports the core runtime, so you can import these from a
single package:

- `ClientManager`
- `Reactor`
- `DisplayReactor`
- `CallError`
- `CanisterError`
- `ValidationError`

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/react
- `@ic-reactor/core`: ../core/README.md
- `@ic-reactor/vite-plugin`: ../vite-plugin/README.md
- `@ic-reactor/cli`: ../cli/README.md
