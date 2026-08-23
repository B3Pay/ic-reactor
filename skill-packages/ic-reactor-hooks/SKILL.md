---
name: ic-reactor-hooks
description: >-
  Create, refactor, review, and document IC Reactor React hook integrations for
  Internet Computer (ICP) apps. Use when working with @ic-reactor/react,
  createActorHooks, createQuery/createMutation factory patterns, useActorMethod,
  TanStack Query cache invalidation, generated hooks from the ic-reactor CLI or
  Vite plugin, or when explaining hook usage inside React components versus
  imperative usage outside React (fetch/execute/invalidate in loaders, actions,
  services, and tests).
---

# IC Reactor Hooks

Use this skill to implement or explain hook patterns in this repository with minimal rework and consistent cache behavior.

Read `references/patterns.md` only when you need concrete examples, file pointers, or exact API surface reminders.

## Search / Trigger Phrases

This skill should match requests about:

- IC Reactor hooks
- `@ic-reactor/react`
- ICP React hooks / Internet Computer React hooks
- `createActorHooks`, `useActorQuery`, `useActorMutation`
- one-call setup with `defineReactor`
- query and mutation factories (`createQuery`, `createMutation`)
- using IC Reactor outside React (`fetch`, `execute`, cache invalidation)
- IC Reactor CLI / Vite plugin generated hooks

## Follow This Workflow

1. Identify the target integration style.
2. Prefer generated hooks for canister-heavy app code.
3. Reuse singleton `QueryClient`, `ClientManager`, and reactor instances **in
   client-only apps**. On a server (SSR/RSC/Next.js), build one set per request
   instead — inside a `useState` initializer in a provider component, so it is
   created once per render tree rather than on every render — because a reactor
   owns its `QueryClient`, query keys carry no caller principal, and
   `AuthenticationManager` holds mutable identity state, so a module-scope set
   serves one visitor's caller-scoped data to the next. See
   `examples/nextjs/src/service/provider.tsx`.
4. Choose the smallest abstraction that fits:
   - `defineReactor(...)` for one-call setup (reactor + hooks + shared infra)
   - `createActorHooks(...)` for generic hook access
   - `createQuery` / `createMutation` factories for reusable operations
   - `useActorMethod` for unified imperative component calls
   - direct reactor methods for non-React code
5. Attach cache invalidation to mutations using `query.getQueryKey()` or `query.invalidate()`.
6. Keep custom logic outside generated files.

## Choose The Right Pattern

| Need                                           | Preferred API                                           | Use Location                     |
| ---------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| One-call setup (reactor + hooks + infra)       | `defineReactor(params)`                                 | App scaffolding/shared modules   |
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
  inside a provider's `useState` initializer
  (`examples/nextjs/src/service/provider.tsx`) so no cache or identity state is
  shared across requests.
- Give each reactor an explicit `name`.
- Use `DisplayReactor` for UI-friendly string transforms and forms.
- Use `Reactor` for raw Candid types (`bigint`, `Principal`, etc.).
- Define reusable query and mutation instances in shared modules (for example `factories.ts`) instead of inside components — **in client-only apps**. In a server-rendered app the module-scope singleton is itself the mistake; build them per request instead (see Common Mistakes in `references/patterns.md`).
- Call React hooks only inside React components or custom hooks.
- Use factory imperative methods (`fetch`, `execute`, `invalidate`, `getCacheData`) outside React.
- Prefer `query.getQueryKey()` when wiring invalidation to avoid key drift.
- Do not hand-edit generated hook files; wrap or compose around them.

## Implement Patterns Efficiently

### 0. One-Call Setup (`defineReactor`)

Use `defineReactor` when you want the fastest path: it creates the `QueryClient`,
`ClientManager`, reactor, and bound hooks in a single call and returns them
together. Set `display: true` for UI-friendly values instead of choosing between
`Reactor` and `DisplayReactor` manually.

```ts
import { defineReactor } from "@ic-reactor/react"
import { idlFactory, type _SERVICE } from "./declarations/backend"

export const {
  reactor: backend,
  queryClient,
  clientManager,
  useActorQuery,
  useActorMutation,
  useActorMethod,
} = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  display: true,
})
```

Share one agent **and one Internet Identity session** across canisters by passing
the returned `clientManager` **and** `authentication` into the next
`defineReactor` call:

```ts
const ledger = defineReactor<_LEDGER>({ name: "ledger", idlFactory: ledgerIdl })

const index = defineReactor<_INDEX>({
  name: "index",
  idlFactory: indexIdl,
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

### 1. Generic Actor Hooks (component-first)

Use `createActorHooks(reactor)` when you want a single typed entry point and can pass `{ functionName, args }` per call.

Export the returned hooks from a shared module and reuse them across components.

### 2. Factory Objects (shared component + non-component usage)

Use `createQuery`, `createSuspenseQuery`, `createInfiniteQuery`, and `createMutation` when you need:

- reusable method-specific objects
- route loader prefetching with `.fetch()`
- imperative execution with `.execute()`
- localized cache invalidation with `getQueryKey()`

This is the preferred pattern for code that must work both inside and outside React.

### 3. Generated Hooks (best for scale)

Prefer the Vite plugin in Vite apps for hot regeneration from `.did` changes.

Prefer the CLI in non-Vite apps, CI generation flows, or explicit codegen pipelines.

After generation, keep app-specific behavior in separate wrapper modules or factory files.

### 4. `useActorMethod` (unified but specialized)

Use `useActorMethod` when a component needs a single imperative API (`call`, `reset`, `refetch`) and you want the hook to auto-handle query vs update methods.

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

The others do not unwrap anything, because they never make a call:
`getCacheData()` and `reactor.getQueryData(...)` read an already-transformed
cache entry synchronously and return `undefined` on a miss — they cannot throw a
`CanisterError`. `invalidate()` and `reactor.invalidateQueries(...)` return void.

## Inspect These Files First

- `packages/react/src/defineReactor.ts`
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
- `packages/react/README.md`
- `packages/vite-plugin/README.md`
- `packages/cli/README.md`

## Verify Changes

- Check the generated/imported hook style matches the surrounding code.
- Confirm mutation invalidation targets the correct query keys.
- Confirm non-React usage uses imperative methods only.
- Run the most relevant React package tests or example app checks when available.
