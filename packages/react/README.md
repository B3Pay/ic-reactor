# @ic-reactor/react

React bindings for IC Reactor. This package re-exports everything from
`@ic-reactor/core` and adds hook factories, auth hooks, direct reactor hooks,
and reusable query or mutation factories built around TanStack Query.

## Install

```bash
pnpm add @ic-reactor/react @icp-sdk/core @tanstack/react-query

# Optional: Internet Identity login helpers
pnpm add @icp-sdk/auth@^10
```

## Which `@icp-sdk/auth` to install

The peer range is `^8.0.0 || ^10.0.0`. **v10 is the one to install.** It is the
first release whose peer is `@icp-sdk/core@^6` — the version this package needs —
so a strict `npm install` resolves it with no `overrides` block.

**v9 is deliberately excluded.** It peers `@icp-sdk/core@^5`, so it reintroduces
the resolution failure v10 fixes.

**v8 still works**, and is what this repository's end-to-end suite runs against.
On npm it still needs the override, because its peer metadata is stale rather
than the versions being incompatible — auth v8 runs against core v6:

```json
{ "overrides": { "@icp-sdk/auth": { "@icp-sdk/core": "$@icp-sdk/core" } } }
```

### What changes if you move from v8 to v10

IC Reactor keeps one options contract across both majors and translates at the
boundary, so `identityProvider`, `derivationOrigin`, `windowOpenerFeatures`,
`transport` and `openIdProvider` are written the same way either way. One
difference in `identityProvider`: v10 names a provider by its authorize URL
and the canister that mints its delegations, so a URL you set yourself needs
`internetIdentityId` on v10 as well. IC Reactor pairs the mainnet URL and its
own local default with the right canister, and throws for any other URL that
has none, instead of guessing one. Four
things genuinely have no v10 equivalent, and IC Reactor warns once on each
rather than forwarding an option the client ignores:

| Option        | On v10                                                                                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`     | Dropped. Credentials moved behind `credentialStorage`, whose store also generates identities and holds a delegation alongside each key, so an `AuthClientStorage` cannot be adapted into one. Pass a pre-built `authClient` to keep a custom store. |
| `keyType`     | Dropped. The credential store decides the key type.                                                                                                                                                                                                 |
| `idleOptions` | Dropped. The idle timeout belongs to the identity provider canister; pass `maxTimeToIdle` to `login()` instead.                                                                                                                                     |
| `identity`    | Dropped from constructor options. The agent signs as the session.                                                                                                                                                                                   |

Two options exist only on v10: `maxTimeToIdle` on `login()` and
`disableBrowserActivity` on the client. IC Reactor forwards them to a v10 client
and drops them on v8 with a one-time warning, since v8 has no equivalent.

One difference is security-relevant and warns unconditionally: **`targets` on
`login()` is ignored by v10.** v8 forwards it to restrict the delegation to named
canisters; v10 removed it and scopes a session at the identity provider instead.
A v10 client will hand you a delegation broader than a `targets` list asks for.
Pin `@icp-sdk/auth` to `^8` if you depend on canister-scoped delegations.

> **Support scope.** v10 is verified at the API-contract level — option
> translation, version detection and `signIn` handling all have tests. The
> end-to-end suite that drives a fake Internet Identity still speaks v8's
> ICRC-34 protocol; v10 signs in over `ii_session_delegation` and mints app
> delegations at the II canister, which that harness does not yet emulate.
>
> v10 makes those mint calls through an agent of its own. Off mainnet, IC
> Reactor gives that agent the replica your app already uses and has it fetch
> the network's root key, since certificates from a local replica or testnet
> cannot be checked against mainnet's. That path has unit tests only, and local
> sign-in with v10 has not been run end to end yet.

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
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
})

export const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  // `dfx` writes this alongside the idlFactory. Required — omit it only when
  // the vite-plugin injects an `ic_env` cookie for this canister; outside that
  // flow the constructor throws.
  canisterId,
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
`openIdProvider` and `transport` on either major, `storage`, `keyType`,
`idleOptions` and `identity` on v8 only, and `disableBrowserActivity` on v10
only. An option the installed major lacks is dropped with a one-time warning
(see [Which `@icp-sdk/auth` to install](#which-icp-sdkauth-to-install)). Only
the `"google" | "apple" | "microsoft"` aliases are accepted
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

### Local Internet Identity

On a local replica the provider URL is resolved for you. `prepareClient()`
queries the local Internet Identity canister's `http_request` to see what the
installed build actually serves, then targets `/authorize` (release-2026-01-05 …
release-2026-03-16) or the legacy `/#authorize` (up to release-2025-03-07, which
also logs a console warning). If the build serves neither, `login()` throws an
actionable error rather than opening a popup onto the gateway's
verification-error page. From `release-2026-03-23` the II frontend moved out of
the canister, so no local build past that point can be used for sign-in — pin an
older release in `dfx.json`.

An inconclusive probe — the canister unreachable, or answering no `http_request`
— does not throw: it keeps `/authorize`, because a diagnostic that blocks a
login that might have worked is worse than the failure it explains. To override
the URL yourself, `localInternetIdentityProvider(port, canisterId?, authorizePath?)`
takes the path as its third argument.

## Identity Attributes / OpenID email and profile values

Identity attributes use a dedicated `IdentityAttributesManager`, with React
bindings created by `createIdentityAttributeHooks`. Requires `@icp-sdk/auth` v8
or v10. The peer range is `^8.0.0 || ^10.0.0`, and the v7 compatibility path was
removed in 3.12.0. Both take the nonce as a thunk (`() => Promise<Uint8Array>`); IC Reactor accepts
either a value or a callback and adapts it, but the callback form is what
preserves the user gesture (see below).

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
      // Optional: any window.open() features string, e.g. to size the popup
      windowOpenerFeatures: "width=500,height=640",
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
