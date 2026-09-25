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

It needs `@tanstack/react-query` 5.90.2 or later and React 18 or later. CI runs
this package's tests at those minimums (`pnpm verify:peer-floors`).

## Which `@icp-sdk/auth` to install

The peer range is `^8.0.0 || ^10.0.0`. **v10 is the one to install.** It is the
first release whose peer is `@icp-sdk/core@^6` — the version this package needs —
so a strict `npm install` resolves it with no `overrides` block.

**v9 is deliberately excluded.** It peers `@icp-sdk/core@^5`, so it reintroduces
the resolution failure v10 fixes.

**v8 still works**, and this repository's real-client suite runs against both
majors. On npm it still needs the override, because its peer metadata is stale rather
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

A v10 client also tells IC Reactor when the session changes in another tab of
the origin. `AuthenticationManager` follows it: a sign-out in another tab signs
this tab out, and a sign-in there as another account is adopted here, with no
call in this tab. A v8 tab notices only when it checks the session again.

One difference is security-relevant and warns unconditionally: **`targets` on
`login()` is ignored by v10.** v8 forwards it to restrict the delegation to named
canisters; v10 removed it and scopes a session at the identity provider instead.
A v10 client will hand you a delegation broader than a `targets` list asks for.
Pin `@icp-sdk/auth` to `^8` if you depend on canister-scoped delegations.

> **Support scope.** The real-client suite
> (`tests/auth/internet-identity-integration.test.ts` and
> `tests/auth/auth-client-lifecycle.test.ts`) runs the actual `AuthClient`
> under v10 and under v8. A fake Internet Identity answers both
> sign-in protocols (`icrc34_delegation` and `ii_session_delegation`). A fake
> replica certifies v10's mint and revoke calls
> (`app_prepare_delegation`, `app_get_delegation`, `app_revoke_session`) and
> checks request signatures the way a replica does, so v10's own minting agent
> verifies them unchanged.
>
> v10 makes those calls through an agent of its own. Off mainnet, IC Reactor
> gives that agent the replica your app already uses and has it fetch the
> network's root key, since certificates from a local replica or testnet cannot
> be checked against mainnet's. A root key you passed as `agentOptions.rootKey`
> goes to that agent instead, as your app's own agent keeps it. The suite covers that path. What it does not
> cover is a deployed Internet Identity canister.

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

- `defineReactor(...)` for one-call setup: the `QueryClient`, `ClientManager`,
  a `Reactor`, its actor hooks and the Internet Identity hooks together;
  `defineDisplayReactor(...)` takes the same options and builds a
  `DisplayReactor` instead
- `createReactorProvider(factory)` for a server-rendered app: a provider that
  builds the reactors once per mounted tree (so once per request on a server)
  and a `useReactor()` hook that returns them fully typed
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
- Use `createReactorProvider` when the app renders on a server (Next.js, any
  React SSR) or a part of the UI needs reactors of its own: module-scope
  reactors are right only for a client-only app.
- Use query and mutation factories when you also need loader, action, service,
  or test usage through `.fetch()`, `.prefetch()`, `.execute()`, `.invalidate()`,
  `.getCacheData()`, or `.setData()`.
- Use `DisplayReactor` (or `defineDisplayReactor`) when you want UI-friendly
  values such as strings instead of `bigint` or `Principal`. It adds zod to the
  bundle; see [Bundle Size](#bundle-size).
- Use generated hooks from `@ic-reactor/vite-plugin` or `@ic-reactor/cli` when
  you have larger canisters or frequent `.did` changes.
- When a query's arguments are not known yet, pass `skipToken` (re-exported
  from TanStack Query) in their place: `args: owner ? [owner] : skipToken` in
  `useActorQuery`, `getArgs: skipToken` in `useActorInfiniteQuery`, or
  `getBalance(owner ? [owner] : skipToken).useQuery()` on a query factory. The
  query waits without calling the canister. Placeholder args with `enabled`,
  or a `!`, are not needed. The suspense variants do not take it.
- Call a method that changes state through a mutation (`useActorMutation`,
  `useActorMethod`, `createMutation`), never a query hook or factory. A query
  runs its method again on every refetch (mount, window focus, reconnect,
  invalidation), and an update method executes each time. Without a `retry` of
  its own, a query of an update method retries only a `SysTransient`
  rejection, which proves the call never ran, so a lost response is not
  executed twice; see
  [Update Methods in Queries](https://ic-reactor.b3pay.net/v3/framework/queries#update-methods-in-queries).

## Bundle Size

What each setup path adds to a browser bundle, measured with esbuild 0.28
(minified ESM, `@ic-reactor/core` bundled). The peers `react`,
`@tanstack/react-query` and `@icp-sdk/*` are left out, since an app ships them
either way; so is `@icp-sdk/auth`, which loads as its own chunk on first use.

| Setup                                                            | Minified | Gzipped | zod |
| ---------------------------------------------------------------- | -------: | ------: | :-: |
| `createActorHooks` + `Reactor` + `ClientManager`                 |    31 kB |  9.8 kB | no  |
| … + `AuthenticationManager` + `createAuthHooks`                  |    52 kB | 14.9 kB | no  |
| … + `IdentityAttributesManager` + `createIdentityAttributeHooks` |    58 kB | 16.7 kB | no  |
| `createActorHooks` + `DisplayReactor` + `ClientManager`          |   129 kB | 37.3 kB | yes |
| `defineDisplayReactor`                                           |   158 kB | 45.4 kB | yes |
| `defineReactor`                                                  |   158 kB | 45.4 kB | yes |

`DisplayReactor` builds its codecs on zod's classic API, which does not
tree-shake. That is about 85 kB minified (24 kB gzipped) of every row marked
"yes"; an app that already bundles zod for its own code pays it once.

`defineReactor` costs as much as `defineDisplayReactor` today, even without
`display`: its deprecated `display: true` option can still build a
`DisplayReactor`, so the class and zod stay in the bundle. When that option is
removed at the next major, `defineReactor` drops to about 60 kB minified,
17.6 kB gzipped. Until then, an app that wants the smallest bundle and has no
use for `DisplayReactor` sets up with `createActorHooks(new Reactor(...))` and
`createAuthHooks` (see [Internet Identity](#internet-identity)).

Both `define*` functions also include the identity-attribute code (about 6 kB
minified, 1.8 kB gzipped) whether or not the app calls `useIdentityAttributes`,
because it is part of the object they return.

## Factory Example

```ts
import { createSuspenseQueryFactory, createMutation } from "@ic-reactor/react"
import { backend } from "./reactor"

export const getProfile = createSuspenseQueryFactory(backend, {
  functionName: "get_profile",
})

export const updateProfile = createMutation(backend, {
  functionName: "update_profile",
  // Every get_profile query this factory made, whatever the args
  invalidateQueries: [getProfile],
  onCanisterError: (err) => console.error("Canister Err variant:", err.code),
})
```

```tsx
const profileQuery = getProfile(["alice"])

// React component
const { data } = profileQuery.useSuspenseQuery()

// Prefetch before navigating (fire-and-forget)
profileQuery.prefetch()

// Write into the cache
profileQuery.setData({ id: "alice", name: "Alice" })

// Mutation with extra invalidation: a query object, a query factory, a
// `{ functionName, args? }` method of the reactor, or a query key
const mutation = updateProfile.useMutation({
  invalidateQueries: [{ functionName: "list_profiles" }],
})
```

An `invalidateQueries` entry of `createMutation`, `useActorMutation` and
`useActorMethod` is a query object, a query factory (every query it returns),
a `{ functionName, args? }` method of the mutation's reactor, whose name and
args are type-checked, or a query key. The invalidation is awaited before
`onSuccess`. Query keys start with the canister ID, so a hand-written
`["get_profile"]` matches nothing.

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
    canisterId,
    auth: {
      // Required when the app is served from more than one origin, so every
      // origin resolves to the same principal.
      derivationOrigin: "https://app.example.com",
    },
  })
```

Idle handling depends on the installed major. On v8 the client signs the user
out and reloads the page after 10 minutes idle unless `auth` carries
`idleOptions: { disableIdle: true }`. v10 drops `idleOptions` with a warning and
leaves the idle limit to the identity provider: pass `maxTimeToIdle` to
`login()` to set it, and `disableBrowserActivity: true` in `auth` if only
requests should count as activity.

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

Pinning only helps `@icp-sdk/auth` v8: v10 signs in through calls II gained
after its frontend left the canister, so no build both serves `/authorize` and
supports v10 sessions. With v10, serve an II frontend separately and pass its
authorize URL as `identityProvider`, with `internetIdentityId` set to the local
II canister that mints its delegations.

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
// ✅ Per request: nothing is shared between users.
// In a server component this resolves to the `react-server` entry: the core
// classes are there, the hooks are not.
import { ClientManager, Reactor } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"

export default async function Page() {
  const clientManager = new ClientManager({ queryClient: new QueryClient() })
  const reactor = new Reactor<_SERVICE>({
    name: "backend",
    clientManager,
    idlFactory,
    canisterId,
  })

  const data = await reactor.fetchQuery({ functionName: "get_my_profile" })
  return <Profile data={data} />
}
```

Client components need their reactors built inside the React tree too.
`createReactorProvider` builds them once per mounted provider, in a `useState`
initializer, and a server render is a tree of its own, so each request gets its
own reactors, cache and `AuthenticationManager`. `useReactor()` returns what
the factory built with its full type, so the hooks on it keep their generic
signatures:

```tsx
// src/reactor.tsx
"use client"
import { createReactorProvider, defineReactor } from "@ic-reactor/react"

export const { ReactorProvider, useReactor } = createReactorProvider(() =>
  defineReactor<_SERVICE>({ name: "backend", idlFactory, canisterId })
)
```

```tsx
// app/layout.tsx (a server component) renders
// <ReactorProvider>{children}</ReactorProvider>, and a client component
// below it takes its hooks from useReactor():
export function Profile() {
  const { useActorQuery } = useReactor()
  const { data } = useActorQuery({ functionName: "get_my_profile" })
  return <h1>{data?.name}</h1>
}
```

The factory can return a record (`{ backend, ledger }`, read with
`useReactor("ledger")`), reactors and managers built by hand, or query and
mutation objects. It receives the provider's props, read once per mount; a new
`key` builds a new value. The provider also renders a `QueryClientProvider` for
the value's QueryClient, so `useQueryClient()`, React Query Devtools and a
`HydrationBoundary` below it use the cache the hooks fill. Below it, that
provider takes the place of an outer `QueryClientProvider`; pass
`{ queryClientProvider: false }` to keep your own.

A suspense hook below the provider may suspend its first render: the provider
reuses the value that render built when React renders it again. A provider that
a transition mounts (`startTransition`, a client-side navigation) can be built
again on each retry, so wrap its suspending components in a `<Suspense>`
boundary inside the provider.

When the tree unmounts, the provider disposes each `AuthenticationManager`
built for the value (in the factory, or later by a `defineReactor` result in
it), releasing the Internet Identity client it built: a v10 client keeps
listening to the page until it is disposed, so each remount would otherwise
leave one behind. A manager built elsewhere and passed in, such as an app-wide
one, is left alone. A provider you write yourself has to do the same from its
cleanup:

```tsx
const [value] = useState(createReactorContext)
useEffect(() => () => value.authentication.dispose(), [value])
```

`dispose()` only forgets the client, and the next sign-in builds a new one, so
this is safe under StrictMode, which runs the cleanup and the effect again on
the same managers. A client passed in as `authClient` is left alone.

Two further constraints on the App Router specifically:

- Hooks are client-only, like every React hook — call them from a `"use client"`
  module. A server component, server action or route handler resolves
  `@ic-reactor/react` to its `react-server` entry, which Next.js (Turbopack and
  webpack) selects through the export condition of that name. That entry exports
  everything `@ic-reactor/core` does — `Reactor`, `DisplayReactor`,
  `ClientManager`, the error classes and utilities — plus the validation helpers
  (`mapValidationErrors`, `getFieldError`, …), and nothing that imports React.
  Importing a hook, `defineReactor`, `createActorHooks`, a query or mutation
  factory, or the auth classes there fails `next build` with "Export
  defineReactor doesn't exist in target module"; hooks belong in a
  `"use client"` module, and server code calls the reactor itself
  (`reactor.fetchQuery()`, `reactor.callMethod()`) where client code would use a
  factory's `.fetch()` or `.execute()`. TypeScript does not read the condition,
  so the editor does not flag it first. A server-component bundler that ignores
  `react-server` loads the full entry and rejects its hooks: import from
  `@ic-reactor/core` there, and list it in your own `package.json`, since a
  transitive dependency does not resolve under pnpm.
- Hooks bind to their reactor's own `QueryClient` rather than to a
  `QueryClientProvider`, so `HydrationBoundary` prefetch does not feed them
  unless the provider's client _is_ that reactor's client, as it is below
  `createReactorProvider`'s provider. Next.js also evaluates a shared module
  twice on the server (the RSC and SSR graphs), so a module-scope reactor is
  two different instances there.

If none of that applies — a client-only SPA — module-scope reactors are exactly
right and none of this is a concern.

## Query Result Methods

Every object returned by `createQuery`, `createSuspenseQuery`, and their
factory variants exposes:

| Method                              | Description                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `fetch()`                           | Cache-first fetch — returns data, populates cache. Use in route loaders.                   |
| `prefetch()`                        | Fire-and-forget cache warm-up. Use on hover or before navigation.                          |
| `invalidate()`                      | Invalidates the cache entry (triggers refetch if query is mounted).                        |
| `getQueryKey()`                     | Returns the TanStack Query key for this query.                                             |
| `getCacheData(select?)`             | Read directly from cache without fetching. Returns `undefined` if not cached.              |
| `setData(updater)`                  | Write raw data into the cache. Accepts a value or updater function.                        |
| `optimisticUpdate(updater)`         | Cancel the fetch in flight, write `updater(cached)`, resolve with `{ rollback() }`.        |
| `cancel()`                          | Cancel this query's fetch in flight; the entry keeps its previous value.                   |
| `reset()`                           | Reset this entry to its initial state; a mounted hook refetches, a suspense hook suspends. |
| `useQuery()` / `useSuspenseQuery()` | React hook for the query.                                                                  |

A sign-in or sign-out while `fetch()` is in flight does not reject it: the
previous identity's answer is dropped, and `fetch()` runs again for the new
identity and resolves with that answer. The infinite query factories' `fetch()`
behaves the same. `prefetch()` runs again too, and still never rejects: when
that run succeeds, the cache holds the new identity's answer by the time it
resolves.

`optimisticUpdate`, `cancel` and `reset` act on the query's own entry only, and
the infinite query objects have them too, over their `{ pages, pageParams }`.
An optimistic update is three lines of mutation config:

```tsx
const getPost = createQueryFactory(backend, { functionName: "get_post" })
const likePost = createMutation(backend, { functionName: "like_post" })

// In a component
const { mutate } = likePost.useMutation({
  onMutate: ([postId]) =>
    getPost([postId]).optimisticUpdate((post) => ({
      ...post,
      likes: post.likes + 1n,
    })),
  onError: (_error, _args, update) => update?.rollback(),
  onSettled: (_data, _error, [postId]) => getPost([postId]).invalidate(),
})
```

The updater gets the raw, typed value and is not called when nothing is
cached. Refetch once the mutation settles, as `onSettled` does here: the fetch
`optimisticUpdate` cancels may be a refetch an invalidation or a sign-in
started. `rollback()` does nothing after a sign-in or sign-out, because the
value it kept was the previous principal's.

Use `backend.queryClient` rather than `useQueryClient()` when you need the
QueryClient itself: the hooks bind to the reactor's client, and
`useQueryClient()` throws without the optional `QueryClientProvider`.

The function a factory variant returns (`createQueryFactory`,
`createSuspenseQueryFactory`, `createInfiniteQueryFactory`,
`createSuspenseInfiniteQueryFactory`) also has `getQueryKey()`, the key prefix
every query it returns shares, and `invalidate()`, which invalidates all of
them whatever their args.

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

`@ic-reactor/react` re-exports the core runtime, so client and server code can
import these from a single package. A React Server Component resolves the
package's `react-server` entry, which has them but none of the hooks; see
[Server-Side Rendering](#server-side-rendering):

- `ClientManager`
- `Reactor`
- `DisplayReactor`
- `CallError`
- `CanisterError`
- `ValidationError`
- `formatTokenAmount` and `parseTokenAmount`, which convert a ledger's base
  units to and from decimal text exactly (see
  [Token Amounts](../core/README.md#token-amounts)); do not use `Number` for
  either
- `isPrincipalText`, which checks a principal a person typed without a `try`
  around `Principal.fromText`

The main entry also re-exports TanStack Query's `skipToken` (and its
`SkipToken` type), the same symbol `@tanstack/react-query` exports.

## Testing

`@ic-reactor/react/testing` re-exports `@ic-reactor/core/testing`, so an app
that depends on this package alone can test its components against a fake
replica instead of a `Reactor` stub:

```tsx
import { afterEach, beforeEach, expect, it } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { ClientManager, Reactor, createActorHooks } from "@ic-reactor/react"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
} from "@ic-reactor/react/testing"
import { QueryClient } from "@tanstack/react-query"
import { idlFactory, type _SERVICE } from "./declarations/backend"

const BACKEND = "bkyz2-fmaaa-aaaaa-qaaaq-cai"
let replica: FakeReplica

beforeEach(() => {
  replica = installFakeReplica({
    canisters: {
      [BACKEND]: createTestCanister<_SERVICE>(idlFactory, {
        balance: () => 42n,
      }),
    },
  })
})
// Also when the test fails, so the next test gets a fetch of its own.
afterEach(() => replica.restore())

it("reads the balance", async () => {
  // Built after the fake is installed, and pointed at it.
  const reactor = new Reactor<_SERVICE>({
    clientManager: new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: replica.host },
    }),
    name: "backend",
    canisterId: BACKEND,
    idlFactory,
  })
  const { useActorQuery } = createActorHooks(reactor)

  const { result } = renderHook(() =>
    useActorQuery({ functionName: "balance" })
  )

  await waitFor(() => expect(result.current.data).toBe(42n))
})
```

A reactor built at module scope, such as one from `defineReactor`, builds its
agent when its module is imported: install the fake first, then import the
component under test dynamically. With no `host` on either side, its
`ClientManager` and the fake both use the page's origin in jsdom, so they
meet. The
[Testing guide](https://ic-reactor.b3pay.net/v3/guides/testing) shows how, and
how to test as a signed-in user.

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/react
- `@ic-reactor/core`: ../core/README.md
- `@ic-reactor/vite-plugin`: ../vite-plugin/README.md
- `@ic-reactor/cli`: ../cli/README.md
