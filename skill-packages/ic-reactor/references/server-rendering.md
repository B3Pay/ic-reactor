# Server Rendering (SSR and RSC)

A reactor owns its `QueryClient`, and query keys carry no caller principal.
A reactor at module scope on a server is therefore one cache shared by every
request, and a caller-scoped result (`get_my_profile`, a balance of self) can
be served to the next visitor. An `AuthenticationManager` signs in on its
`ClientManager`'s agent, so it belongs to the same request. Build all of them,
and any query or mutation objects, inside the request.

Module scope stays correct in a client-only app.

## Client components: `createReactorProvider`

```tsx
// src/providers.tsx
"use client"
import {
  createQuery,
  createReactorProvider,
  defineDisplayReactor,
  defineReactor,
  skipToken,
} from "@ic-reactor/react"
import {
  canisterId as backendId,
  idlFactory as backendIdl,
  type _SERVICE as Backend,
} from "./declarations/backend"
import {
  canisterId as ledgerId,
  idlFactory as ledgerIdl,
  type _SERVICE as Ledger,
} from "./declarations/ledger"

// Called at module scope; the factory runs once per mounted provider, which
// is once per request on a server
export const { ReactorProvider, useReactor } = createReactorProvider(() => {
  const backend = defineReactor<Backend>({
    name: "backend",
    idlFactory: backendIdl,
    canisterId: backendId,
  })
  const ledger = defineDisplayReactor<Ledger>({
    name: "ledger",
    idlFactory: ledgerIdl,
    canisterId: ledgerId,
    // Same ClientManager and sign-in as backend
    authentication: backend.authentication,
  })
  // Query and mutation objects belong to the request too
  const posts = createQuery(backend.reactor, { functionName: "get_posts" })
  return { backend, ledger, posts }
})

// app/layout.tsx (a Server Component) renders
//   <ReactorProvider>{children}</ReactorProvider>

export function MyProfile() {
  const { useActorQuery, useAuth } = useReactor("backend")
  const { isAuthenticated, isAuthenticating, login } = useAuth()
  const { data } = useActorQuery({
    functionName: "get_my_profile",
    args: isAuthenticated ? [] : skipToken,
  })
  // true until the stored session has been checked, and in every server render
  if (isAuthenticating) return <p>Checking session…</p>
  if (!isAuthenticated)
    return <button onClick={() => void login()}>Sign in</button>
  return <h1>{data?.name}</h1>
}

export function PostCount() {
  const { data: posts } = useReactor("posts").useQuery()
  return <span>{posts?.length ?? 0} posts</span>
}
```

- `ReactorProvider` and `useReactor` are the names the app destructures, not
  package exports; rename them freely.
- `useReactor()` is typed as the factory's return value; `useReactor("key")`
  returns one property. Never write `as any` hook forwarders or a hand-made
  context provider, and never call `createActorHooks` or `createAuthHooks` in
  a component.
- The factory receives the provider's props other than `children`, read once
  per mount. Give the provider a new `key` to build a new value.
- On unmount the provider calls `dispose()` on the `AuthenticationManager`s
  built for its value. When the value holds exactly one `QueryClient`, it also
  renders a `QueryClientProvider` for it (`{ queryClientProvider: false }` as
  the second argument keeps your own).
- A provider mounted by a transition (router navigation, `startTransition`)
  needs a `<Suspense>` boundary inside it around suspending components.

## Server Components, server actions, route handlers

Import the core runtime from `@ic-reactor/react`: its `react-server` export
condition resolves to an entry that loads no React.

```tsx
// app/Supply.tsx: a React Server Component
import { ClientManager, Reactor, formatTokenAmount } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/ledger"

export default async function Supply() {
  // Built inside the request: a module-scope reactor would share its cache
  // with every visitor
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  const ledger = new Reactor<_SERVICE>({
    name: "ledger",
    clientManager,
    idlFactory,
    canisterId,
  })
  const [supply, decimals] = await Promise.all([
    ledger.fetchQuery({ functionName: "icrc1_total_supply" }),
    ledger.fetchQuery({ functionName: "icrc1_decimals" }),
  ])
  return <p>{formatTokenAmount(supply, decimals, { maxFractionDigits: 0 })}</p>
}
```

- Hooks, `defineReactor`, `defineDisplayReactor`, `createReactorProvider`,
  `createActorHooks`, the query/mutation factories, `skipToken`, the auth
  classes and the identity-attribute helpers are missing exports in the
  `react-server` graph (`next build`: "Export X doesn't exist in target
  module"). If the bundler ignores the `react-server` condition, add
  `@ic-reactor/core` as a dependency and import the runtime from it.
- Generated canister modules (codegen, including `factories: true` objects)
  import hooks and live at module scope: never import them into server code.
- `reactorRetry` retries nothing where there is no `window`. For query
  retries on a server, pass
  `{ retry: (count, error) => count < 3 && isRetryableReactorError(error) }`
  as `fetchQuery`'s second argument, or set it in the `QueryClient` defaults.
- `fetchQuery` is cache-first. The cache here lives for one request, so that
  is harmless; elsewhere use `callMethod()` for a value the canister returns
  now.

Docs: https://ic-reactor.b3pay.net/v3/reference/createReactorProvider.md,
https://ic-reactor.b3pay.net/v3/examples/nextjs-app-router.md
