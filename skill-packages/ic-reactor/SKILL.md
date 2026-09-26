---
name: ic-reactor
description: >-
  Write, review and fix app code that calls Internet Computer (ICP) canisters
  with IC Reactor (@ic-reactor/react, @ic-reactor/core, @ic-reactor/candid,
  @ic-reactor/vite-plugin, @ic-reactor/cli) in React, Next.js or plain
  TypeScript. Use when the project depends on an @ic-reactor/* package, or the
  user asks to set up a canister client (defineReactor, defineDisplayReactor,
  createReactorProvider, createActorHooks), query or update a canister
  (useActorQuery, useActorMutation, createQuery, createMutation), invalidate or
  optimistically update cached canister data, sign in with Internet Identity
  (useAuth), handle a CanisterError, show or parse ICRC token amounts, generate
  hooks from .did files, call canisters during server rendering, or test
  canister code against a fake replica. Not for changing the IC Reactor library
  itself.
license: MIT
---

# IC Reactor in an App

IC Reactor calls Internet Computer canisters with types taken from the
canister's Candid service type (`_SERVICE`), caches results in TanStack Query,
and gives React hooks plus query and mutation objects that also work outside
React. This skill is for code that uses the published packages.

This skill describes these versions:

- `@ic-reactor/core`: `3.12.5`
- `@ic-reactor/react`: `3.12.5`
- `@ic-reactor/candid`: `3.12.5`
- `@ic-reactor/vite-plugin`: `0.15.0`
- `@ic-reactor/cli`: `0.15.0`

## Workflow

1. **Read the guide for the installed version.** Each package ships one, such
   as `node_modules/@ic-reactor/react/llms.txt`, whose first lines include
   ``Applies to `@ic-reactor/react` <version>.``. When that version differs
   from the list above, the installed guide wins. A package without the file
   or that line predates these guides: read
   https://ic-reactor.b3pay.net/llms-full.txt and the changelog,
   https://github.com/B3Pay/ic-reactor/blob/main/CHANGELOG.md.
2. **Find the canister's types.** Method names, argument tuples and results
   come from `_SERVICE` in the declarations generated from the `.did`
   (`idlFactory` is in the generated `.js`). The Vite plugin and the CLI write
   them to `src/declarations/<name>/declarations/`, as `<did>.d.ts` and
   `<did>.js` named after the `.did` file. The canister's entry,
   `src/declarations/<name>/index.ts`, exports the generated reactor, hooks,
   query/mutation objects and the service type as `<Name>Service`, but not
   `_SERVICE` or `idlFactory`. Never guess a method name or argument shape.
3. **Reuse the app's setup.** Search for `defineReactor`,
   `defineDisplayReactor`, `createReactorProvider`, `new ClientManager`,
   `icReactor(` and `ic-reactor.json` first. An app's reactors share one
   `ClientManager` and one `AuthenticationManager` (one of each per request on
   a server). For a new app, pick a setup below.
4. **Write the code** by the rules below; the files in `references/` hold
   complete, type-checked examples.
5. **Verify** with the app's type check and tests. Test canister code against
   the fake replica from `@ic-reactor/react/testing`, not a stubbed reactor.

## Choose a Setup

- **Client-only React app, a few canisters:** `defineReactor<_SERVICE>(...)`
  (raw `bigint`, `Principal`) or `defineDisplayReactor<_SERVICE>(...)`
  (strings, for forms and display), in a module.
- **Many canisters, or `.did` files that change:** `@ic-reactor/vite-plugin`
  (Vite) or `@ic-reactor/cli`, with `factories: true` on each canister, in a
  client-only app.
- **Server-rendered React (Next.js, any SSR):**
  `createReactorProvider(() => defineReactor(...))` in a `"use client"`
  module; components call `useReactor()`. The generated entry builds its
  reactor at module scope, so take only the declarations from codegen
  (`ic-reactor generate --bindgen-only`, or the `declarations/` folder).
- **React Server Component, server action, route handler:** `ClientManager`
  and `Reactor` built inside the request, then `fetchQuery()` /
  `callMethod()`.
- **A reactor built by hand** (explicit construction order, injection):
  `new ClientManager(...)`, `new Reactor(...)` or `new DisplayReactor(...)`,
  then `createActorHooks(reactor)`.
- **One call shared by components, loaders, actions and tests:**
  `createQuery`, `createQueryFactory` (args supplied later), `createMutation`,
  or the objects `factories: true` generates.
- **A second canister on the same sign-in:**
  `defineReactor({ ..., authentication: firstApp.authentication })`.
- **Several canisters with one interface (ICRC ledgers):** one reactor plus
  `reactor.forCanister(canisterId)`; `callConfig: { canisterId }` for one
  query.
- **No React:** `@ic-reactor/core` (`ClientManager`, `Reactor`) and the
  imperative API.
- **Candid known only at run time:** `@ic-reactor/candid`.

`defineReactor` builds the `QueryClient` (query retry `reactorRetry`), the
`ClientManager`, the reactor, the six hooks of `createActorHooks`, and
`useAuth`, `useAgentState`, `useUserPrincipal`, `useIdentityAttributes`,
`authentication` and `identityAttributes`. `defineDisplayReactor` takes the
same options and uses display values: `string` for `nat`, `int`, `nat64`,
`int64` and `principal`, hex for `blob`, `T | undefined` for `opt`, and
`{ _type: "Name", Name: value }` for a variant (`{ _type: "Name" }` when the
case has no value, so switch on `_type`, never `"Name" in value`). A query
whose whole result is an empty `opt` holds `null`. Always pass the
`<_SERVICE>` type argument. `canisterId` is required except on a local
replica whose `ic_env` cookie names it. A React app imports everything,
`ClientManager` and `Reactor` included, from `@ic-reactor/react`, which
re-exports `@ic-reactor/core`.

## Rules

### Inside and outside React

- Hooks run only in components and custom hooks: `useActorQuery`,
  `useActorMutation`, `useActorMethod`, `useAuth`, `.useQuery()`,
  `.useMutation()`, `.useSuspenseQuery()`, `.useInfiniteQuery()`.
- Loaders, actions, services, scripts and non-hook tests use query objects'
  `.fetch()`, `.prefetch()`, `.invalidate()`, `.getCacheData()`,
  `.setData()`, `.optimisticUpdate()`; mutation objects' `.execute(args)`;
  and the reactor's `.fetchQuery()`, `.getQueryData()`,
  `.invalidateQueries()`, `.callMethod()`.
- Build hooks and query/mutation objects once: at module scope in a
  client-only app, inside the `createReactorProvider` factory in a
  server-rendered one, or in a `useMemo` keyed by what they depend on.
- `query.fetch()` and `reactor.fetchQuery()` are cache-first (a stale cached
  value is returned as is); `reactor.callMethod()` asks the canister now.
  The two fetches run again as the new principal when a sign-in or sign-out
  lands mid-fetch. Wrap a hand-written `queryClient.fetchQuery`,
  `fetchInfiniteQuery` or `ensureQueryData` in
  `clientManager.fetchAcrossIdentitySwitch(() => ...)`.

### Queries

- `args` is the method's argument tuple (`[userId]`); omit it for a method
  without arguments.
- Args not known yet: pass `skipToken` (from `@ic-reactor/react`) in their
  place: `args: userId ? [userId] : skipToken` in `useActorQuery`,
  `getArgs: owner ? (page) => [...] : skipToken` in `useActorInfiniteQuery`,
  `getBalance(owner ? [account] : skipToken)` with a `createQueryFactory`
  object. The suspense hooks, `createQuery` and `createSuspenseQuery` do not
  take it.
- A Candid `Result` is unwrapped: `data` is the `Ok` payload, and an `Err`
  arrives as a `CanisterError` in `error`.
- Query hooks and objects take TanStack's options (`select`, `staleTime`,
  `enabled`, ...) and `callConfig` (`canisterId`, `agent`,
  `effectiveCanisterId`).
- Paginated reads: `createInfiniteQuery` or `useActorInfiniteQuery` with
  `initialPageParam`, `getNextPageParam` and
  `getArgs: (page) => [...] as const` (keep the `as const`).

### Update methods and mutations

- Call a state-changing update method only through `useActorMutation`,
  `useActorMethod` or `createMutation`. A query hook or object runs its method
  again on every refetch (mount, focus, reconnect, invalidation), and each run
  of an update executes on the canister.
- `onCanisterError` receives the `CanisterError` of an `Err`; `onError`
  receives every error.
- Mutations retry nothing unless `retry` is set. For an update use
  `retry: reactorUpdateRetry`, which resends only a `SysTransient` rejection
  (the call provably never ran); never a number.

### Cache invalidation and optimistic updates

- A mutation's `invalidateQueries` takes query objects (`[postsQuery]`),
  query factories (`[getPost]`, every args instance) and method descriptors
  of the mutation's reactor (`{ functionName: "get_post", args? }`). It is
  awaited before `onSuccess`.
- Never write a query key by hand: every key starts with the canister id, so
  `["get_posts"]` matches nothing. Use `query.getQueryKey()` or
  `reactor.generateQueryKey(...)` when a key is needed.
- `query.invalidate()`, a factory's `invalidate()` and
  `reactor.invalidateQueries(...)` return a `Promise`; prefix one you do not
  await with `void`.
- Optimistic UI: return `query.optimisticUpdate(updater)` from `onMutate`,
  call `update?.rollback()` in `onError`, and invalidate in `onSettled`.
- Use `reactor.queryClient` for the `QueryClient`; `useQueryClient()` throws
  when no `QueryClientProvider` is mounted.

### Server rendering (SSR and RSC)

- A reactor owns its `QueryClient` and its keys carry no caller principal, so
  a module-scope reactor on a server is one cache shared by every request.
  Build reactors, `ClientManager`, `AuthenticationManager` and query/mutation
  objects inside the request; a bare `defineReactor(...)` in a module body is
  module scope.
- Client components: call `createReactorProvider(factory)` at module scope in
  a `"use client"` module. The factory runs once per mounted provider (once
  per request on a server), may return a record read with
  `useReactor("ledger")`, and the provider disposes the
  `AuthenticationManager`s built for its value when it unmounts.
- Server Components, server actions and route handlers import
  `ClientManager`, `Reactor`, `DisplayReactor` and helpers such as
  `formatTokenAmount` from `@ic-reactor/react` (its `react-server` entry
  loads no React). Hooks, `defineReactor`, `defineDisplayReactor`,
  `createReactorProvider`, `createActorHooks`, the query/mutation factories,
  `skipToken` and the auth classes are not exported there. Never import a
  generated canister entry (`index.ts` and the `*.generated.ts` files) there;
  its `declarations/` folder (`idlFactory`, `_SERVICE`) is safe.

### Sign-in (Internet Identity)

- `createAuthHooks(authentication)` takes an `AuthenticationManager`, never a
  `ClientManager`, and returns `useAuth`, `useAgentState`,
  `useUserPrincipal`. `useIdentityAttributes` comes from
  `createIdentityAttributeHooks(identityAttributes)`.
- `useAuth()` reports `isAuthenticating: true` until the first session
  restore settles, and in every server render: check it before acting on
  `!isAuthenticated`. Read the principal from `useAuth().principal` or
  `useUserPrincipal()`.
- `useAuth()` restores a stored session when it mounts; outside React call
  `authentication.authenticate()`. `clientManager.initialize()` restores no
  session, and calls do not need it first.
- `authentication.dispose()` releases the auth client without signing out;
  `createReactorProvider` calls it for you.

### Errors and retries

- `CanisterError`: the canister returned `Err`; `.err` is the value, `.code`
  the variant name. `CallError`: network, agent, certificate, trap.
  `ValidationError`: a `DisplayReactor` validator refused the arguments
  (`mapValidationErrors(error)` gives form field messages). Narrow with
  `isCanisterError`, `isCallError`, `isValidationError`, not `instanceof`.
  A hook's `error` is typed `ReactorErrorOf<typeof reactor, "method">`, so
  its `.err` is the method's `Err` type. In a `catch`, `isCanisterError`
  gives `.err: unknown`: type the caught value as that `ReactorErrorOf`
  first.
- `reactorRetry` (the query retry `defineReactor` sets; set it yourself on a
  `QueryClient` you build) retries transport, certificate, HTTP 5xx/408/429
  and `SysTransient`/`SysUnknown` failures, never a `CanisterError`, a
  `ValidationError` or another 4xx. It and `reactorUpdateRetry` return
  `false` where there is no `window`.

### Token amounts, principals and types

- Ledger amounts are base units: a `bigint` from a `Reactor`, integer text
  from a `DisplayReactor`. Show them with `formatTokenAmount(value, decimals)`
  and read typed text with `parseTokenAmount(text, decimals)` (a `bigint`).
- Validate typed principal text with `isPrincipalText(text.trim())`.
- Derive types from the reactor: `ReactorArgsOf<typeof reactor, "method">`,
  `ReactorDataOf<...>`, `ReactorErrorOf<...>`, `ServiceOf<typeof reactor>`.

### Code generation

- Each canister's output holds `declarations/` (`idlFactory`, `_SERVICE`),
  `index.generated.ts` (`<name>Reactor`, the `<Name>Service` type, hooks
  `use<Name>Query`, `use<Name>Mutation`, ...),
  `index.factories.generated.ts` with `factories: true` (`<method>Query`,
  `<method>Mutation`), and `index.ts`, created once and yours to edit.
  Importing `index.ts` builds the reactor and its `ClientManager`.
- Never edit the generated files; change the `.did` or the options and
  generate again. Custom objects and invalidation wiring go in `index.ts`,
  where an export of the same name replaces the generated one.
- The generated reactor imports `clientManager` from the module
  `clientManagerPath` names (`src/clients.ts` when `outDir` is
  `src/declarations`). That module is yours: give its `QueryClient`
  `retry: reactorRetry` and build the `AuthenticationManager` there.
- Set `canisterId` for every deployed build; the `ic_env` cookie exists only
  on a local replica.

### Testing

- Run the real reactor and hooks against `installFakeReplica` and
  `createTestCanister` from `@ic-reactor/react/testing`
  (`@ic-reactor/core/testing` without React). Install the fake before any
  `ClientManager` is built; with a module-scope `defineReactor` or generated
  entry, install it at the top of the test file and `await import(...)` the
  modules under test. For generated code, import `idlFactory` and `_SERVICE`
  from the canister's `declarations/` folder, and key the fake by the
  `canisterId` the generator wrote. Vitest runs `vite.config.ts` unless a
  `vitest.config.ts` replaces it, so the Vite plugin generates again in mode
  `test`: a `canisterId` read with `loadEnv` needs its variable in
  `.env.test`, or the regenerated reactor has no id and importing it throws.
- A handler returns `{ Err: ... }` for a `CanisterError` and throws for a
  `CallError`. Test a signed-in user with `clientManager.updateAgent(identity)`.

## Do Not

- Call a hook in a loader, action, service or script; use `query.fetch()`,
  `mutation.execute()`, `reactor.fetchQuery()` or `callMethod()`.
- Call `createActorHooks` or `createAuthHooks` on every render; build them
  at module scope, in the provider factory, or in a `useMemo`.
- Put an update method in `useActorQuery`, `createQuery` or
  `createQueryFactory`; use a mutation.
- Give an update mutation, `useActorMethod` or a `mutations.retry` default a
  numeric `retry`; use `reactorUpdateRetry`.
- Write `invalidateQueries: [["get_posts"]]` or put the canister id in a
  `queryKey`; pass query objects, factories or `{ functionName }`.
- Write `args: [userId!]`, a placeholder account, or `as any` plus `enabled`;
  pass `skipToken`.
- Check `"Ok" in data`; `data` is already the `Ok` payload.
- Test a `DisplayReactor` variant with `"Name" in value`; read `value._type`.
- Compute amounts with `Number(x) / 10 ** decimals`, `parseFloat` or
  `toFixed`; use `formatTokenAmount` / `parseTokenAmount`.
- Retarget a shared reactor with `setCanisterId`; use `forCanister`.
- Write `defineReactor({ display: true })` (deprecated); use
  `defineDisplayReactor`.
- Build a reactor or manager at module scope in a server-rendered app, or
  import hooks or generated modules into a Server Component.
- Pass a `ClientManager` to `createAuthHooks`, or build a second
  `AuthenticationManager`; pass `authentication` on.
- Use `useQueryClient()` for cache writes or hand-roll `setQueryData`
  snapshots; use `reactor.queryClient` and `optimisticUpdate`.
- Stub a reactor with `{ ... } as unknown as Reactor` in tests.
- Edit `index.generated.ts` or `index.factories.generated.ts`.
- Leave out `<_SERVICE>`, or cast hooks or results to `any`.

## References

Read only the file the task needs:

- [references/setup.md](references/setup.md): `defineReactor` and
  `defineDisplayReactor`, a second canister on one sign-in, a manual setup,
  and codegen (`vite.config.ts`, `ic-reactor.json`, `src/clients.ts`, using
  the output).
- [references/queries-and-mutations.md](references/queries-and-mutations.md):
  hooks in a component, query and mutation objects inside and outside React,
  pagination, optimistic updates, `forCanister` and token transfers.
- [references/server-rendering.md](references/server-rendering.md):
  `createReactorProvider` and a Server Component that fetches in the request.
- [references/auth-errors-testing.md](references/auth-errors-testing.md):
  sign-in and route guards, identity attributes, error narrowing, retries,
  and tests against the fake replica.

Docs: https://ic-reactor.b3pay.net/llms.txt lists the docs pages as Markdown
links (such as https://ic-reactor.b3pay.net/v3/framework/mutations.md), and
https://ic-reactor.b3pay.net/llms-full.txt is the complete guide in one file.
