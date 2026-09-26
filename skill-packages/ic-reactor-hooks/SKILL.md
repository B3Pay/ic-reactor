---
name: ic-reactor-hooks
description: >-
  For contributors working inside the B3Pay/ic-reactor repository: create,
  refactor, review and document the @ic-reactor/react hook layer and how the
  repository's docs, examples and codegen templates use it (createActorHooks,
  createQuery/createMutation factories, useActorMethod, TanStack Query cache
  invalidation, generated hooks, inside versus outside React). Use when
  changing packages/react or its tests, docs or examples. In an app that
  installs @ic-reactor packages, use the ic-reactor skill instead.
---

# IC Reactor Hooks

Use this skill to implement or explain hook patterns in this repository with minimal rework and consistent cache behavior.

This skill is for work on IC Reactor itself. Code in an app that installs the packages is covered by the consumer skill in `skill-packages/ic-reactor/`, which apps install as a Claude Code plugin or with the `skills` CLI; keep it in step when a hook's public behavior changes.

Read `references/patterns.md` only when you need concrete examples, file pointers, or exact API surface reminders.

## Search / Trigger Phrases

This skill should match requests about:

- IC Reactor hooks
- `@ic-reactor/react`
- ICP React hooks / Internet Computer React hooks
- `createActorHooks`, `useActorQuery`, `useActorMutation`
- one-call setup with `defineReactor` / `defineDisplayReactor`
- server-rendered setup with `createReactorProvider`
- query and mutation factories (`createQuery`, `createMutation`)
- using IC Reactor outside React (`fetch`, `execute`, cache invalidation)
- IC Reactor CLI / Vite plugin generated hooks

## Follow This Workflow

1. Identify the target integration style.
2. Prefer generated hooks for canister-heavy app code.
3. Reuse singleton `QueryClient`, `ClientManager`, and reactor instances **in
   client-only apps**. On a server (SSR/RSC/Next.js), build one set per request
   instead with `createReactorProvider(factory)`, which runs the factory in a
   `useState` initializer once per mounted provider and returns a `useReactor`
   hook, because a reactor owns its `QueryClient` and query keys carry no
   caller principal, so a module-scope set serves one visitor's caller-scoped
   data to the next. The `AuthenticationManager` goes with its per-request
   `ClientManager`, whose agent it signs in on; the provider calls its
   `dispose()` when the tree unmounts. See
   `examples/nextjs/src/service/provider.tsx`.
4. Choose the smallest abstraction that fits:
   - `defineReactor(...)` for one-call setup (reactor + hooks + shared infra),
     or `defineDisplayReactor(...)` for display values
   - `createActorHooks(...)` for generic hook access
   - `createQuery` / `createMutation` factories for reusable operations (in a
     codegen project, prefer `factories: true` over hand-written modules)
   - `useActorMethod` for unified imperative component calls
   - direct reactor methods for non-React code
5. Attach cache invalidation to mutations by passing query objects, query
   factories or `{ functionName, args? }` descriptors to `invalidateQueries`.
6. Keep custom logic outside generated files.

## Choose The Right Pattern

| Need                                           | Preferred API                                           | Use Location                     |
| ---------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| One-call setup (reactor + hooks + infra)       | `defineReactor` / `defineDisplayReactor`                | App scaffolding/shared modules   |
| Per-request setup in a server-rendered app     | `createReactorProvider(factory)`                        | `"use client"` provider module   |
| Fastest setup across many methods              | `createActorHooks(reactor)`                             | React components/custom hooks    |
| Reusable query with loader support             | `createQuery` / `createSuspenseQuery`                   | Inside React and outside React   |
| Reusable mutation with imperative execution    | `createMutation`                                        | Inside React and outside React   |
| Paginated data                                 | `createInfiniteQuery` / suspense variant                | Inside React and prefetch paths  |
| Dynamic args with cached factory instances     | `createQueryFactory` / `createSuspenseQueryFactory`     | Shared modules                   |
| Unified hook that auto-detects query vs update | `useActorMethod`                                        | React components/custom hooks    |
| Zero/low-maintenance canister hook generation  | `@ic-reactor/vite-plugin` or `@ic-reactor/cli`          | App scaffolding/codegen          |
| Imperative call outside React                  | `query.fetch`, `mutation.execute`, `reactor.callMethod` | loaders/actions/services/scripts |

## Apply Repo Conventions

- Keep `queryClient`, `clientManager`, and reactors as module-level singletons
  in client-rendered apps; in server-rendered apps create one set per request
  with `createReactorProvider` (`examples/nextjs/src/service/provider.tsx`) so
  no cache or identity state is shared across requests.
- Give each reactor an explicit `name`.
- Use `DisplayReactor` for UI-friendly string transforms and forms.
- Use `Reactor` for raw Candid types (`bigint`, `Principal`, etc.).
- Define reusable query and mutation instances in shared modules (for example `factories.ts`) instead of inside components — **in client-only apps**. In a server-rendered app the module-scope singleton is itself the mistake; build them inside the `createReactorProvider` factory and read them with `useReactor` (see Common Mistakes in `references/patterns.md`).
- Call React hooks only inside React components or custom hooks.
- Use factory imperative methods (`fetch`, `execute`, `invalidate`, `getCacheData`) outside React.
- Call state-changing update methods only through mutations (`useActorMutation`, `useActorMethod`, `createMutation`), never a query hook or query factory: a query re-runs its method on every refetch. Give an update mutation `retry: reactorUpdateRetry`, never a number.
- Pass `skipToken` (from `@ic-reactor/react`) in place of args that are not known yet: `args: userId ? [userId] : skipToken`. Not in suspense hooks, `createQuery` or `createSuspenseQuery`.
- For another canister of the same interface, use `reactor.forCanister(canisterId)`, or `callConfig: { canisterId }` for one query; never retarget a shared reactor with `setCanisterId`.
- Derive types from a reactor with `ReactorArgsOf` / `ReactorDataOf` / `ReactorErrorOf<typeof reactor, "method">`.
- Show and read token amounts with `formatTokenAmount` / `parseTokenAmount`, and validate typed principals with `isPrincipalText`.
- In `invalidateQueries`, pass the query object or factory rather than a key, and never a hand-written key.
- `useAuth()` reports `isAuthenticating: true` until the first session restore settles; check it before redirecting on `!isAuthenticated`.
- In tests, run the real reactor against `installFakeReplica` from `@ic-reactor/react/testing` (or `@ic-reactor/core/testing`), installed before any `ClientManager` is built.
- Do not hand-edit generated hook files; wrap or compose around them.

## Implement Patterns Efficiently

### 0. One-Call Setup (`defineReactor` / `defineDisplayReactor`)

Use `defineReactor` when you want the fastest path: it creates the `QueryClient`,
`ClientManager`, reactor, and bound hooks in a single call and returns them
together. `defineReactor` builds a `Reactor` (raw Candid values);
`defineDisplayReactor` takes the same options and builds a `DisplayReactor`
(UI-friendly values). `defineReactor({ display: true })` is deprecated, so never
generate it, and do not switch a raw-value `defineReactor` setup to
`defineDisplayReactor` just to silence a `no-deprecated` lint report.

```ts
import { defineDisplayReactor } from "@ic-reactor/react"
import { canisterId, idlFactory, type _SERVICE } from "./declarations/backend"

export const {
  reactor: backend,
  queryClient,
  clientManager,
  useActorQuery,
  useActorMutation,
  useActorMethod,
} = defineDisplayReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  // Required unless the Vite plugin injects an `ic_env` cookie for this
  // canister on a local replica. Without it the reactor constructor throws
  // on a server and on any deployed origin.
  canisterId,
})
```

In a server-rendered app, wrap the same call in
`createReactorProvider(() => defineReactor<_SERVICE>({ ... }))` and read the
result with the `useReactor()` hook it returns, instead of exporting it from a
module.

Share one agent **and one Internet Identity session** across canisters by passing
the returned `clientManager` **and** `authentication` into the next
`defineReactor` call:

```ts
import { defineReactor } from "@ic-reactor/react"

const ledger = defineReactor<_LEDGER>({
  name: "ledger",
  idlFactory: ledgerIdl,
  canisterId: ledgerCanisterId,
})

const index = defineReactor<_INDEX>({
  name: "index",
  idlFactory: indexIdl,
  canisterId: indexCanisterId,
  clientManager: ledger.clientManager,
  authentication: ledger.authentication, // one Internet Identity session
})
```

Passing `authentication` alone is enough — its `clientManager` is adopted.
Passing a _different_ `clientManager` alongside it throws, because sign-in would
update one agent while the reactor calls through another.

Drop down to manual `ClientManager` + `Reactor` + `createActorHooks` only when
you need finer control over construction order.

### 0b. Auth Hooks (manual setup)

`defineReactor` already returns `useAuth`, `useAgentState`, `useUserPrincipal`,
and `useIdentityAttributes`. When wiring auth by hand, note that the two hook
factories take **managers**, not a `ClientManager`:

```ts
import {
  AuthenticationManager,
  IdentityAttributesManager,
  createAuthHooks,
  createIdentityAttributeHooks,
} from "@ic-reactor/react"
import { clientManager } from "./reactor"

export const authentication = new AuthenticationManager({ clientManager })
export const identityAttributes = new IdentityAttributesManager(authentication)

export const { useAuth, useAgentState, useUserPrincipal } =
  createAuthHooks(authentication)

export const { useIdentityAttributes } =
  createIdentityAttributeHooks(identityAttributes)
```

`createAuthHooks` returns exactly `useAuth`, `useAgentState`, and
`useUserPrincipal`; `useIdentityAttributes` only ever comes from
`createIdentityAttributeHooks`.

`useAuth()` reports `isAuthenticating: true` from the first render (and on the
server) until the first session restore settles, so guard a protected route
with `if (isAuthenticating)` before `if (!isAuthenticated)`.
`authentication.dispose()` releases the Internet Identity client the manager
built without signing out; a per-mount manager calls it from its effect
cleanup, which `createReactorProvider` already does. Pass a real
`AuthenticationManager` to `createAuthHooks`, never a hand-rolled stub.

### 1. Generic Actor Hooks (component-first)

Use `createActorHooks(reactor)` when you want a single typed entry point and can pass `{ functionName, args }` per call.

Export the returned hooks from a shared module and reuse them across components.

### 2. Factory Objects (shared component + non-component usage)

Use `createQuery`, `createSuspenseQuery`, `createInfiniteQuery`, and `createMutation` when you need:

- reusable method-specific objects
- route loader prefetching with `.fetch()`
- imperative execution with `.execute()`, which runs in the QueryClient's
  MutationCache, so a `mutations.retry` default applies to it; set `retry` on
  the factory (`false` or `reactorUpdateRetry`) to decide per method
- localized cache control: `invalidate()`, `cancel()`, `reset()` and
  `optimisticUpdate()` on the query's own entry, and the query object or
  factory itself in a mutation's `invalidateQueries`

Query configs take `callConfig` (for example `{ canisterId }`) as the hooks do.
Query factories (`createQueryFactory`, ...) also have `getQueryKey()` and
`invalidate()` covering every args instance. In a codegen project, prefer
`factories: true`, which generates one such object per method (the generated
`createQuery` objects keep the factory's 5-minute default `staleTime`, while
the bound `useActorQuery` hooks default to 0); wrap or override in `index.ts`
only when the config differs.

This is the preferred pattern for code that must work both inside and outside React.

### 3. Generated Hooks (best for scale)

Prefer the Vite plugin in Vite apps for hot regeneration from `.did` changes.

Prefer the CLI in non-Vite apps, CI generation flows, or explicit codegen pipelines.

After generation, keep app-specific behavior in separate wrapper modules or factory files.

### 4. `useActorMethod` (unified but specialized)

Use `useActorMethod` when a component needs a single imperative API (`call`, `reset`, `refetch`) and you want the hook to auto-handle query vs update methods.

The hook's `retry`, `retryDelay`, `networkMode` and `meta` apply to an update
method's `call()` as well as to query methods, so a generic `retry: 3`
re-sends state-changing update calls. Pass `retry` only for query methods, or
pass `reactorUpdateRetry`. Without a hook `retry`, an update's `call()` follows
the QueryClient's mutation defaults (no retry unless `mutations.retry` is set).
A query method's `call()` and `refetch()` fetch again for the new principal
when a sign-in or sign-out lands mid-call, and resolve `undefined` if that
fetch fails. Loaders and services still use `query.fetch()` or
`reactor.fetchQuery()`, since hooks belong in components.

Prefer query/mutation factories when the method-specific API is clearer or you need outside-React access.

## Handle Outside-React Usage Correctly

Never call `.useQuery()`, `.useSuspenseQuery()`, `.useInfiniteQuery()`, or `.useMutation()` outside React.

Use these instead:

- `query.fetch()` for cache-aware reads in loaders/actions
- `query.getCacheData()` for synchronous cache reads
- `query.invalidate()` for targeted invalidation
- `mutation.execute(args)` for imperative updates
- `reactor.fetchQuery(...)` / `reactor.getQueryData(...)` / `reactor.invalidateQueries(...)` / `reactor.callMethod(...)` for advanced control

The three that actually **call** the canister — `query.fetch()`,
`mutation.execute(args)`, and `reactor.fetchQuery(...)` / `reactor.callMethod(...)`
— unwrap candid `variant { Ok; Err }`: the resolved value is the `Ok` payload,
and an `Err` rejects with a `CanisterError` carrying the raw payload on `.err`.
`callMethod()` is included in that: it is not an escape hatch. Overriding
`transformResult` on a `Reactor` subclass is the only way to keep the raw variant.
`query.fetch()` (including the infinite factories) and `reactor.fetchQuery()`
fetch again, at most 3 times, when a sign-in or sign-out switches the principal
mid-fetch, then reject with a `CallError`. Wrap any other fetch that goes
straight to the QueryClient (`queryClient.fetchQuery`, `fetchInfiniteQuery`,
`ensureQueryData`) in `clientManager.fetchAcrossIdentitySwitch(() => ...)`.

The others return no canister result, so there is nothing for them to unwrap:
`getCacheData()` and `reactor.getQueryData(...)` read an already-transformed
cache entry synchronously and return `undefined` on a miss — they cannot throw a
`CanisterError`. `query.invalidate()` and `reactor.invalidateQueries(...)` both
return a `Promise<void>` that resolves once the active queries they matched
have refetched; a failed refetch does not reject it. Await it where the next
step reads the refetched data, and prefix a fire-and-forget call with `void`.

## Inspect These Files First

- `packages/react/src/defineReactor.ts`
- `packages/react/src/defineDisplayReactor.ts`, `packages/react/src/defineReactorShared.ts`
- `packages/react/src/createReactorProvider.ts`
- `packages/react/src/createActorHooks.ts`
- `packages/react/src/createQuery.ts`
- `packages/react/src/createSuspenseQuery.ts`
- `packages/react/src/createInfiniteQuery.ts`
- `packages/react/src/createMutation.ts`
- `packages/react/src/hooks/useActorMethod.ts`
- `packages/react/src/hooks/createAuthHooks.ts`
- `packages/react/src/auth/createIdentityAttributeHooks.ts`
- `examples/all-in-one-demo/src/lib/factories.ts`
- `examples/tanstack-router/src/canisters/ledger/hooks/`
- `examples/tanstack-router/src/components/transfer.tsx` (`parseTokenAmount` + `isPrincipalText` in a form)
- `examples/nextjs/src/service/provider.tsx` (`createReactorProvider`)
- `packages/react/README.md`
- `packages/vite-plugin/README.md`
- `packages/cli/README.md`

## Verify Changes

- Check the generated/imported hook style matches the surrounding code.
- Confirm mutation invalidation targets the correct query keys.
- Confirm non-React usage uses imperative methods only.
- Run the most relevant React package tests or example app checks when available.
