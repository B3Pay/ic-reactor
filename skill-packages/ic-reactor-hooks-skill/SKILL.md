---
name: ic-reactor-hooks
description: Create, refactor, review, and document IC Reactor React hook integrations for Internet Computer (ICP) apps. Use when working with @ic-reactor/react, createActorHooks, createQuery/createMutation factory patterns, useActorMethod, TanStack Query cache invalidation, generated hooks from the ic-reactor CLI or Vite plugin, or when explaining hook usage inside React components versus imperative usage outside React (fetch/execute/invalidate in loaders, actions, services, and tests).
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
- query and mutation factories (`createQuery`, `createMutation`)
- using IC Reactor outside React (`fetch`, `execute`, cache invalidation)
- IC Reactor CLI / Vite plugin generated hooks

## Follow This Workflow

1. Identify the target integration style.
2. Prefer generated hooks for canister-heavy app code.
3. Reuse singleton `QueryClient`, `ClientManager`, and reactor instances.
4. Choose the smallest abstraction that fits:
   - `createActorHooks(...)` for generic hook access
   - `createQuery` / `createMutation` factories for reusable operations
   - `useActorMethod` for unified imperative component calls
   - direct reactor methods for non-React code
5. Attach cache invalidation to mutations using `query.getQueryKey()` or `query.invalidate()`.
6. Keep custom logic outside generated files.

## Choose The Right Pattern

| Need                                           | Preferred API                                           | Use Location                     |
| ---------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| Fastest setup across many methods              | `createActorHooks(reactor)`                             | React components/custom hooks    |
| Reusable query with loader support             | `createQuery` / `createSuspenseQuery`                   | Inside React and outside React   |
| Reusable mutation with imperative execution    | `createMutation`                                        | Inside React and outside React   |
| Paginated data                                 | `createInfiniteQuery` / suspense variant                | Inside React and prefetch paths  |
| Dynamic args with cached factory instances     | `createQueryFactory` / `createSuspenseQueryFactory`     | Shared modules                   |
| Unified hook that auto-detects query vs update | `useActorMethod`                                        | React components/custom hooks    |
| Zero/low-maintenance canister hook generation  | `@ic-reactor/vite-plugin` or `@ic-reactor/cli`          | App scaffolding/codegen          |
| Imperative call outside React                  | `query.fetch`, `mutation.execute`, `reactor.callMethod` | loaders/actions/services/scripts |

## Apply Repo Conventions

- Keep `queryClient`, `clientManager`, and reactors as module-level singletons.
- Give each reactor an explicit `name`.
- Use `DisplayReactor` for UI-friendly string transforms and forms.
- Use `Reactor` for raw Candid types (`bigint`, `Principal`, etc.).
- Define reusable query and mutation instances in shared modules (for example `factories.ts`) instead of inside components.
- Call React hooks only inside React components or custom hooks.
- Use factory imperative methods (`fetch`, `execute`, `invalidate`, `getCacheData`) outside React.
- Prefer `query.getQueryKey()` when wiring invalidation to avoid key drift.
- Do not hand-edit generated hook files; wrap or compose around them.

## Implement Patterns Efficiently

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

## Inspect These Files First

- `packages/react/src/createActorHooks.ts`
- `packages/react/src/createQuery.ts`
- `packages/react/src/createSuspenseQuery.ts`
- `packages/react/src/createInfiniteQuery.ts`
- `packages/react/src/createMutation.ts`
- `packages/react/src/hooks/useActorMethod.ts`
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
