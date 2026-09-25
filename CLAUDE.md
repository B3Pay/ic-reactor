# CLAUDE.md — IC Reactor Project Context

This file provides context for Claude-based AI agents working in the IC Reactor repository.

## Project Overview

**IC Reactor v3** is a type-safe TypeScript monorepo for building Internet Computer (ICP) applications. It uses TanStack Query for caching/refetching, `@icp-sdk/*` packages for IC agent/auth/candid primitives, and generated or hand-written Candid service types for end-to-end TypeScript safety.

### Core Packages

- `@ic-reactor/core` (`packages/core`, `3.12.5`) — Core runtime, `ClientManager`, `Reactor`, `DisplayReactor`, cache integration
- `@ic-reactor/react` (`packages/react`, `3.12.5`) — React bindings, actor hooks, query/mutation factories, Internet Identity auth, and identity-attribute hooks
- `@ic-reactor/candid` (`packages/candid`, `3.12.5`) — Dynamic Candid adapter/reactors and metadata reactors
- `@ic-reactor/parser` (`packages/parser`, `0.5.0`) — Rust/WASM Candid parser
- `@ic-reactor/codegen` (`packages/codegen`, `0.14.0`) — Shared generation pipeline used by CLI and Vite plugin
- `@ic-reactor/cli` (`packages/cli`, `0.14.0`) — `ic-reactor` CLI for explicit declaration/reactor generation
- `@ic-reactor/vite-plugin` (`packages/vite-plugin`, `0.14.0`) — Vite plugin for watch-mode generation and local `ic_env` injection

## Package Ownership Map

Start in the package that owns the behavior:

| Package                   | Primary files                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `@ic-reactor/core`        | `packages/core/src/`, `packages/core/tests/`                                                      |
| `@ic-reactor/react`       | `packages/react/src/`, `packages/react/tests/`, `skill-packages/ic-reactor-hooks/SKILL.md`        |
| `@ic-reactor/candid`      | `packages/candid/src/`, `packages/candid/METADATA_REACTOR_GUIDE.md`                               |
| `@ic-reactor/parser`      | `packages/parser/src/`, `packages/parser/tests/`                                                  |
| `@ic-reactor/codegen`     | `packages/codegen/src/`, `packages/codegen/src/*.test.ts`                                         |
| `@ic-reactor/cli`         | `packages/cli/src/`, `packages/cli/schema.json`                                                   |
| `@ic-reactor/vite-plugin` | `packages/vite-plugin/src/`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/` |

`AGENTS.md` maps tasks to source files ("Where to start for a task") and lists
the minimum verification per kind of change. The root `llms.txt` and
`llms-full.txt` are consumer guides for apps that install the packages, not
repository routing; keep contributor content out of them.

## Skills

Skills are structured instruction sets stored in `skill-packages/`. When a task matches a skill's description, load the skill's `SKILL.md` and follow its workflow.

### Available Skills

- **`ic-reactor-hooks`**: Create, refactor, and document Reactor hook integrations, including `createActorHooks`, query/mutation factories, `useActorMethod`, and generated hooks. Use when implementing or explaining hook usage inside React components versus imperative usage outside React. (file: `skill-packages/ic-reactor-hooks/SKILL.md`)
- **`ic-reactor-packages`**: Inspect, modify, review, or document package ownership, exports, tsconfig/project references, generated artifacts, dependency boundaries, and verification workflows across the IC Reactor monorepo. Use when deciding which package owns behavior or when work spans package metadata/build/test/release readiness. (file: `skill-packages/ic-reactor-packages/SKILL.md`)

### How to Use Skills

1. **Discovery**: Skill instructions live in `skill-packages/<skill-name>/SKILL.md`.
2. **Trigger**: If the user names a skill or the task matches a skill's description, use that skill.
3. **Progressive disclosure**: Read the `SKILL.md` first; load `references/` files only when concrete examples are needed.
4. **Agent metadata**: Claude-specific metadata is in `skill-packages/<skill-name>/agents/claude.yaml`.

## Core Principles

- **Type Safety**: Use Candid types. Avoid `any` or loose typing. Derive types from a reactor instead of copying shapes by hand: `ReactorArgsOf<typeof reactor, "method">`, `ReactorDataOf<...>`, `ReactorErrorOf<...>` (plus `ServiceOf` / `TransformOf`).
- **DisplayReactor**: Prefer `DisplayReactor` for UI components (handles BigInt/Principal serialization).
- **Reactor**: Use standard `Reactor` when raw Candid types are required.
- **Setup Pattern**: Prefer `defineReactor(...)` for one-call setup (it creates the `QueryClient`, `ClientManager`, reactor, and bound hooks together), and `defineDisplayReactor(...)` (same options) for display values. `defineReactor({ display: true })` is deprecated, so never generate it; plain `defineReactor` is not. In a server-rendered app, wrap the setup in `createReactorProvider(() => defineReactor(...))` instead of calling it at module scope. Drop to `ClientManager` + `Reactor` + `createActorHooks` when construction order must be explicit.
- **Factory Pattern**: Use `createActorHooks`, `createQuery`, `createSuspenseQuery`, `createInfiniteQuery`, `createSuspenseInfiniteQuery`, and `createMutation` factories instead of manual hook implementations.
- **Many canisters, one interface**: `reactor.forCanister(canisterId)` returns a memoized sibling reactor (same class and `ClientManager`) for another canister, such as another ICRC ledger. For one query of another canister, pass `callConfig: { canisterId }` (hooks, `createQuery`, `createQueryFactory`). Do not retarget a shared reactor with `setCanisterId` or add the canister id to `queryKey`.
- **Token amounts**: Ledger amounts are base units. Show them with `formatTokenAmount(value, decimals)`, read typed text with `parseTokenAmount(text, decimals)` (a `bigint`), and validate a typed principal with `isPrincipalText(text.trim())`. Never use `Number(x) / 10 ** decimals`, `parseFloat` or `toFixed`.

## React Hook Patterns

- For component-level canister calls with an existing reactor, prefer `createActorHooks(reactor)`.
- For reusable operations shared across components and non-React code, prefer:
  - `createQuery` / `createSuspenseQuery`
  - `createQueryFactory` / `createSuspenseQueryFactory` when args are supplied later
  - `createInfiniteQuery` / `createSuspenseInfiniteQuery`
  - `createMutation`
- Define reusable query/mutation objects at module scope (not inside components) **in client-only apps**. In a server-rendered app they belong to a per-request provider: build them inside the `createReactorProvider` factory and read them with its `useReactor` hook — see Inside React vs Outside React below.
- Use `useActorMethod` only when a unified query/update hook is specifically helpful.
- Call state-changing update methods only through mutations (`useActorMutation`, `useActorMethod`, `createMutation`). Query hooks and factories run their method again on every refetch, and with no `retry` of its own an update method in a query retries only a SysTransient rejection. Mutations retry nothing unless `retry` is set; give an update `retry: reactorUpdateRetry`, never a number. `reactorRetry` (the query default of `defineReactor`'s `QueryClient`) never retries a canister `Err`, a validation error, or an HTTP 4xx other than 408/429.
- When a query's args are not known yet, pass `skipToken` (re-exported by `@ic-reactor/react`) in their place: `args: userId ? [userId] : skipToken` in `useActorQuery`, `getArgs: owner ? (page) => [...] : skipToken` in `useActorInfiniteQuery`, `getBalance(owner ? [account] : skipToken)` with `createQueryFactory`. Suspense hooks, `createQuery` and `createSuspenseQuery` do not take it. Do not write `args: [userId!]` or a placeholder account.
- For Internet Identity, use `createAuthHooks(authentication)` where `authentication` is an `AuthenticationManager` — never a `ClientManager`. `useIdentityAttributes` comes from `createIdentityAttributeHooks(identityAttributes)`, not `createAuthHooks`. `useAuth()` reports `isAuthenticating: true` until the first session restore settles, so check it before redirecting on `!isAuthenticated`.

## Inside React vs Outside React

- Only call React hooks (`useActorQuery`, `.useQuery()`, `.useMutation()`, etc.) inside React components or custom hooks.
- For non-React usage (loaders/actions/services/tests/scripts), use imperative APIs:
  - query `.fetch()` / `.invalidate()` / `.getCacheData()` / `.cancel()` / `.reset()` / `.optimisticUpdate()`
  - mutation `.execute()`
  - reactor `.fetchQuery()` / `.getQueryData()` / `.invalidateQueries()` / `.callMethod()`
- `query.fetch()` and `reactor.fetchQuery()` fetch again when a sign-in or
  sign-out switches the principal mid-fetch. Wrap a hand-written fetch that goes
  straight to the `QueryClient` (`queryClient.fetchQuery`,
  `fetchInfiniteQuery`, `ensureQueryData`) in
  `clientManager.fetchAcrossIdentitySwitch(() => ...)`; unwrapped, it can
  resolve with the previous principal's cached data.
- Tests: run the real reactor, in hook tests (`renderHook` / `render`) and
  imperative ones alike, against `installFakeReplica` + `createTestCanister`
  from `@ic-reactor/core/testing` (`@ic-reactor/react/testing` in a React app).
  Install the fake before any `ClientManager` or agent is built. Do not stub a
  reactor with `as unknown as Reactor`.
- On a server (SSR/RSC), build the reactor, `ClientManager`, `AuthenticationManager`
  and any query/mutation objects **inside the request** rather than at module
  scope. A reactor owns its `QueryClient` and query keys carry no caller
  principal, so a module-scope reactor shares one cache across all requests and
  can serve one user's caller-scoped data to another. `AuthenticationManager`
  is built from a `ClientManager` and signs in on that manager's agent, so it
  belongs in the same request as its `ClientManager`. On the server it loads
  no auth client and stays signed out unless app code signs in there, and a
  module-scope one would then leave that identity on the agent every request
  signs with. (The auth hooks themselves render a fixed state on the server:
  signed out, with `isAuthenticating: true`, which is what a browser shows
  until its session restore settles.)
  A bare `defineReactor(...)` in a module body is still module scope. For
  client components in a server-rendered app, use `createReactorProvider(factory)`
  from `@ic-reactor/react`. It runs the factory once per mounted provider in a
  `useState` initializer (so once per request on the server), disposes the
  `AuthenticationManager`s built for its value when it unmounts, and renders a
  `QueryClientProvider` for the value's `QueryClient`. Components read the
  value with the `useReactor` hook it returns. Reference:
  `examples/nextjs/src/service/provider.tsx` and
  `examples/nextjs-app-router/src/app/providers.tsx`. Codegen's generated
  canister entry (hooks and `factories: true` objects) is module scope, so it
  is client-only.
  A React Server Component, server action or route handler may import
  `Reactor`, `DisplayReactor`, `ClientManager` and the rest of the core runtime
  (including `formatTokenAmount`) from `@ic-reactor/react`: its `react-server`
  export condition resolves to an entry that loads no React. Hooks,
  `defineReactor`, `defineDisplayReactor`, `createReactorProvider`,
  `createActorHooks`, the query/mutation factories, `skipToken` and the auth
  classes are missing exports there, so server code calls
  `reactor.fetchQuery()` / `reactor.callMethod()`. Importing from
  `@ic-reactor/core` still works, and is required with an RSC bundler that
  ignores the `react-server` condition.

## Cache Invalidation

- In a mutation's `invalidateQueries` (`createMutation` config,
  `.useMutation()` options, `useActorMutation`, `useActorMethod`), pass the
  query object (`[postsQuery]`), a query factory to cover every args instance
  (`[getPost]`), or a method descriptor `{ functionName, args? }` resolved
  against the mutation's reactor and canister. It is awaited before
  `onSuccess`. Never hand-write `["get_posts"]`: every key starts with the
  canister id, so it matches nothing.
- `query.invalidate()`, a query factory's `invalidate()` and
  `reactor.invalidateQueries(...)` return a `Promise` that resolves once the
  active matches have refetched. Prefix a fire-and-forget call with `void`.
- For optimistic UI, return `query.optimisticUpdate(updater)` from `onMutate`,
  call `rollback()` on the result in `onError`, and invalidate the query in
  `onSettled`. Do not hand-roll `setQueryData` snapshots.

## Code Generation

- For many canisters or frequent `.did` changes, prefer generated hooks with:
  - `@ic-reactor/vite-plugin` (Vite)
  - `@ic-reactor/cli` (non-Vite / CI)
- Set `factories: true` on a canister entry (`target: "react"`) to also
  generate `index.factories.generated.ts`: a `<method>Query` (`createQuery`, or
  `createQueryFactory` when the method takes args) per query method and a
  `<method>Mutation` (`createMutation`) per update method. Prefer it over
  hand-written per-method factory modules; to change one, export the same name
  from the stable `index.ts`.
- Keep custom app logic in wrapper modules, not generated files.

## Development

```bash
pnpm install            # Install dependencies
pnpm build              # Build all packages
pnpm test               # Run all tests
pnpm typecheck          # Type-check every package + e2e/, incl. tests (CI gate)
pnpm typecheck:examples # Type-check example apps
pnpm build:examples     # Build every example app (CI gate)
pnpm lint               # ESLint over packages/*/src and packages/*/tests (CI gate)
pnpm format             # Format the whole repo with Prettier
pnpm format:check       # Verify formatting without writing (CI gate, whole repo)
pnpm check:ai-context   # AI guides: versions, package stamps, docs links (CI gate)
pnpm size               # size-limit gate for core/react/candid/parser (CI gate)
pnpm verify:packages    # Pack + publint + attw + real-Node import of published artifacts
pnpm verify:peer-floors # Typecheck + test core/react at the lowest peer versions they accept, and compile the built declarations with the oldest supported TypeScript (CI gate; build first)
pnpm verify:audit       # pnpm audit --audit-level=high over the workspace (CI gate)
pnpm verify:test-fails <file> --package <pkg>  # Check a new test actually fails without the fix
pnpm docs:build         # Build docs site (TypeDoc warnings are errors)
pnpm docs:check-links   # Crawl the built docs for broken links (CI gate)
```

`pnpm typecheck` runs each package's own `typecheck` script. The root
`tsconfig.json` is references-only, so `pnpm exec tsc --noEmit` at the root
type-checks nothing.

**Run `pnpm build` before `pnpm lint`.** The type-aware ESLint rules read
`@ic-reactor/core`'s emitted `.d.ts` through the workspace symlinks. Without a
build those types degrade to `any`, `no-floating-promises` silently stops
reporting, and lint exits 0 on code it should reject. CI is safe because the
build precedes the lint step; a fresh clone is not.

A new package must ship a `tsconfig.typecheck.json` with
`include: ["src/**/*", "tests/**/*"]` and be added to `TYPECHECK_PROJECTS` in
`eslint.config.mjs`. Skipping this makes `pnpm lint` fail with
`Parsing error: "parserOptions.project" has been provided ... The file was not
found in any of the provided project(s)`, a message that names no fix.

After editing an example, run `pnpm build:examples` as well as
`pnpm typecheck:examples`. `tsc` never loads a bundler, so a broken Vite/Next
config type-checks clean — both Next.js examples were unbuildable while the
type-check job stayed green. CI runs both.

When a change fixes a bug, run `pnpm verify:test-fails` on the new test file
before opening the PR. It reverts `packages/*/src` to a base revision, re-runs
the tests against that older code, and reports which ones flipped. A test that
passes with and without the fix proves nothing about it — it is either an
invariant guard, which is worth keeping, or vacuous, which is easy to write by
accident (an inline closure that changes a memo dependency every render, a
fixture that never reaches the state the defect lives in, an error shape
invented rather than captured from a real failure).

Run `pnpm verify:packages` after changing a package's
`exports`, `files`, build output, or module format — in-repo consumers resolve
through workspace symlinks, so nothing else sees the published artifact.

## Key File References

- `AGENTS.md` — Task routing to source files, verification by change type, and
  the rules for the AI context files
- `llms.txt` — Consumer index (llmstxt.org shape), published at
  `https://ic-reactor.b3pay.net/llms.txt`; no repo paths or contributor workflow
- `llms-full.txt` — Complete consumer guide, published at
  `https://ic-reactor.b3pay.net/llms-full.txt`; its snippets must compile
- `packages/*/llms.txt` — Per-package consumer guides shipped in the npm
  tarballs, each opening with an `Applies to` version line
- `CHANGELOG.md` — Per-package changes; add user-visible ones under
  `## Unreleased`
- `README.md` — Root package overview, install paths, examples, and AI context index
- `skill-packages/ic-reactor-hooks/SKILL.md` — Hook patterns skill
- `skill-packages/ic-reactor-packages/SKILL.md` — Package ownership and verification skill
- `packages/react/src/` — React package source
- `packages/react/README.md` — React package docs
- `packages/core/README.md` — Core runtime docs
- `packages/candid/README.md` — Dynamic Candid and metadata reactor docs
- `packages/cli/README.md`, `packages/codegen/README.md`, and `packages/vite-plugin/README.md` — Codegen docs
- `examples/all-in-one-demo/src/lib/factories.ts` — Factory pattern examples
- `examples/codegen-in-action/` — Current CLI and Vite plugin output (`index.generated.ts` with the six bound hooks, plus `index.factories.generated.ts` from `factories: true`)
- `examples/tanstack-router/src/canisters/ledger/hooks/` — Hand-maintained query/mutation factory modules used by router loaders (not codegen output; the example builds its reactor by hand, and codegen does not generate the suspense factories)
- `examples/nextjs/src/service/provider.tsx` — `createReactorProvider` for a server-rendered app
- `packages/react/src/server.ts` — The `react-server` entry of `@ic-reactor/react` (core runtime only, no React)
- `packages/core/src/testing/` — `installFakeReplica` / `createTestCanister` (`@ic-reactor/core/testing`, re-exported as `@ic-reactor/react/testing`)
