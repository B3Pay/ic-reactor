# GitHub Copilot Instructions for IC Reactor

Follow these repository-specific patterns when suggesting code:

## Project Snapshot

- This branch publishes the IC Reactor v3 documentation and release line.
- Runtime packages are `@ic-reactor/core`, `@ic-reactor/react`, and `@ic-reactor/candid` at `3.13.0`.
- Code generation packages are `@ic-reactor/codegen`, `@ic-reactor/cli`, and `@ic-reactor/vite-plugin` at `0.15.1`.
- The WASM parser package is `@ic-reactor/parser` at `0.6.0`.
- Prefer `@icp-sdk/*` dependencies in examples and docs.

## Core Principles

- Preserve existing IC Reactor and TanStack Query patterns.
- Prefer small, explicit changes over large custom abstractions.
- Keep TypeScript types accurate and inferable.
- Do not hand-edit generated files unless the user explicitly asks.
- For package ownership, exports, generated artifacts, or verification workflow questions, use `skill-packages/ic-reactor-packages/SKILL.md`.
- For React hook/factory implementation questions, use `skill-packages/ic-reactor-hooks/SKILL.md`.

## Package Ownership

- `packages/core` owns framework-agnostic runtime behavior: `ClientManager`, `Reactor`, `DisplayReactor`, and query-cache integration.
- `packages/react` owns React hooks, query/mutation factories, `useActorMethod`, Internet Identity auth, and identity-attribute hooks.
- `packages/candid` owns runtime Candid fetching/parsing adapters and dynamic reactors.
- `packages/parser` owns the Rust/WASM Candid parser.
- `packages/codegen` owns declaration, reactor, client, and hook generation.
- `packages/cli` owns the `ic-reactor` executable and config schema.
- `packages/vite-plugin` owns Vite integration, `.did` watching, and environment-cookie injection.

## React Hook Patterns (Important)

- For new React canister setup, prefer `defineReactor(...)`, and `defineDisplayReactor(...)` (same options) for display values; `defineReactor({ display: true })` is deprecated, so never suggest it. Use `ClientManager`, `Reactor`, and `createActorHooks` when construction order must be explicit.
- For component-level canister calls with an existing reactor, prefer `createActorHooks(reactor)`.
- For reusable operations shared across components and non-React code, prefer:
  - `createQuery`
  - `createSuspenseQuery`
  - `createQueryFactory`
  - `createSuspenseQueryFactory`
  - `createInfiniteQuery`
  - `createSuspenseInfiniteQuery`
  - `createMutation`
- Define reusable query/mutation objects at module scope (not inside components) in client-only apps. In a server-rendered app, see "SSR / Server Rendering" below — module scope is a cross-request leak there.
- Use `useActorMethod` only when a unified query/update hook is specifically helpful.
- Call state-changing update methods only through mutations (`useActorMutation`, `useActorMethod`, `createMutation`). Query hooks and factories re-run their method on every refetch, and with no `retry` of its own an update method in a query retries only a SysTransient rejection. Mutations retry nothing unless `retry` is set; use `retry: reactorUpdateRetry`, never a number.
- When a query's args are not known yet, pass `skipToken` (re-exported by `@ic-reactor/react`) in their place, e.g. `args: userId ? [userId] : skipToken`. Suspense hooks, `createQuery` and `createSuspenseQuery` do not take it.
- For another canister of the same interface, use `reactor.forCanister(canisterId)`, or `callConfig: { canisterId }` for one query (hooks, `createQuery`, `createQueryFactory`); do not retarget a shared reactor with `setCanisterId`.
- Derive types from a reactor with `ReactorArgsOf`, `ReactorDataOf` and `ReactorErrorOf<typeof reactor, "method">` instead of hand-written interfaces.
- Show ledger base units with `formatTokenAmount(value, decimals)`, read typed amounts with `parseTokenAmount(text, decimals)`, and validate typed principals with `isPrincipalText(text.trim())`; never `Number` / `parseFloat` token math.
- Build auth hooks with `createAuthHooks(authentication)` where `authentication = new AuthenticationManager({ clientManager })` — it never takes a `ClientManager`. `useAuth()` reports `isAuthenticating: true` until the first session restore settles.
- `useIdentityAttributes` comes from `createIdentityAttributeHooks(identityAttributes)`, not from `createAuthHooks`.

## Inside React vs Outside React

- Only call React hooks (`useActorQuery`, `.useQuery()`, `.useMutation()`, etc.) inside React components or custom hooks.
- For non-React usage (loaders/actions/services/tests/scripts), use imperative APIs:
  - query `.fetch()`
  - query `.invalidate()`
  - query `.getCacheData()`
  - query `.cancel()`, `.reset()`, `.optimisticUpdate()`
  - mutation `.execute()`
  - reactor `.fetchQuery()`, `.getQueryData()`, `.invalidateQueries()`, `.callMethod()`
- `query.fetch()` and `reactor.fetchQuery()` fetch again when the principal switches mid-fetch. Wrap a hand-written `queryClient.fetchQuery` / `fetchInfiniteQuery` / `ensureQueryData` of a canister query in `clientManager.fetchAcrossIdentitySwitch(() => ...)`.
- Tests run the real reactor against `installFakeReplica` + `createTestCanister` from `@ic-reactor/core/testing` (`@ic-reactor/react/testing` in React apps), installed before any `ClientManager` is built — not a `Reactor` stub.

## SSR / Server Rendering

- On a server (SSR/RSC), build the reactor, `ClientManager`, `AuthenticationManager`, and the query/mutation objects inside the request — never at module scope.
- A reactor owns its `QueryClient`, and query keys are built by `reactor.generateQueryKey()` from the canister ID, function name, transform and args, plus an agent number when `callConfig.agent` is not the `ClientManager`'s own agent — and carry no caller principal. A module-scope reactor on a server is one cache shared by every request, so a caller-scoped result (`balanceOf(self)`, `myProfile`) is served to the next visitor.
- `AuthenticationManager` is built from a `ClientManager` and signs in on that manager's agent, so it belongs in the same request as its `ClientManager`. On the server it loads no auth client and stays signed out unless app code signs in there, and a module-scope one would then leave that identity on the agent every request signs with. (The auth hooks themselves render a fixed state on the server: signed out, with `isAuthenticating: true`.)
- A bare `defineReactor(...)` call in a module body is still module scope. Use `createReactorProvider(factory)` from `@ic-reactor/react`: it runs the factory once per mounted provider (once per request on the server), disposes the `AuthenticationManager`s it built on unmount, renders a `QueryClientProvider` for the value's `QueryClient`, and returns a `useReactor` hook. Reference: `examples/nextjs/src/service/provider.tsx`.
- A React Server Component, server action or route handler may import the core runtime (`Reactor`, `DisplayReactor`, `ClientManager`, `formatTokenAmount`, ...) from `@ic-reactor/react`: its `react-server` export condition loads no React. Hooks, `defineReactor`, `defineDisplayReactor`, `createReactorProvider`, `createActorHooks`, the query/mutation factories and the auth classes are not exported there.
- Module scope stays correct for client-only SPAs.

## Reactor Choice

- Prefer `DisplayReactor` for UI/form-friendly values (stringified principals/bigints).
- Prefer `Reactor` when raw Candid types are required.
- Always provide an explicit reactor `name`.

## Cache Invalidation

- In a mutation's `invalidateQueries` (`createMutation`, `.useMutation()`, `useActorMutation`, `useActorMethod`), pass the query object (`[postsQuery]`), a query factory to cover every args instance (`[getPost]`), or a method descriptor `{ functionName, args? }`. It is awaited before `onSuccess`. Never hand-write `["get_posts"]`: every key starts with the canister id.
- `query.invalidate()`, a query factory's `invalidate()` and `reactor.invalidateQueries(...)` return a `Promise` that resolves once the active matches have refetched; prefix a fire-and-forget call with `void`.
- For optimistic UI, return `query.optimisticUpdate(updater)` from `onMutate`, call `rollback()` on it in `onError`, and invalidate in `onSettled`.

## Code Generation

- For many canisters or frequent `.did` changes, prefer generated hooks with:
  - `@ic-reactor/vite-plugin` (Vite)
  - `@ic-reactor/cli` (non-Vite / CI)
- Set `factories: true` on a canister entry (`target: "react"`) to also generate `index.factories.generated.ts`, with a `<method>Query` per query method and a `<method>Mutation` per update method. Prefer it over hand-written per-method factory modules.
- Keep custom app logic in wrapper modules, not generated files.

## Where to look for examples

- `AGENTS.md` (task-to-source-file routing and verification by change type)
- `llms-full.txt` (the consumer guide; `llms.txt` is its index)
- `README.md`
- `packages/react/src/`
- `packages/react/README.md`
- `packages/core/README.md`
- `packages/candid/README.md`
- `packages/codegen/README.md`
- `packages/cli/README.md`
- `packages/vite-plugin/README.md`
- `examples/all-in-one-demo/src/lib/factories.ts`
- `examples/tanstack-router/src/canisters/ledger/hooks/`
- `skill-packages/ic-reactor-hooks/SKILL.md`
- `skill-packages/ic-reactor-packages/SKILL.md`

## Verification

- Format check (CI gate; covers the whole repo): `pnpm format:check`
- AI context check (CI gate): `pnpm check:ai-context` (versions, package guide stamps and docs links in the AI guides). `llms.txt`, `llms-full.txt`, `packages/*/llms.txt` and the consumer skill `skill-packages/ic-reactor/` are consumer guides: keep repo paths and contributor workflow out of them, update them together when public API guidance changes, and record user-visible changes in `CHANGELOG.md`.
- Snippet check (CI gate; run `pnpm build` first): `pnpm check:snippets` compiles the `ts`/`tsx` fences of the AI guides, the skills and the READMEs against the built packages. Fix a failing snippet in its file; app names snippets assume live in `scripts/check-snippets/`, never library exports.
- Lint used by CI: `pnpm lint` (ESLint flat config over `packages/*/src` and `packages/*/tests`; run `pnpm build` first or the type-aware rules degrade to `any` and stop reporting)
- Type check used by CI: `pnpm typecheck` (every package plus `e2e/`, `src` and tests; the root `tsconfig.json` is references-only, so `pnpm exec tsc --noEmit` at the root checks nothing)
- Package builds: `pnpm build`
- Package tests: `pnpm test`
- Published-artifact verification: `pnpm verify:packages` (pack + publint + attw + real Node import; run it after `exports`/`files`/build-output changes)
- Example type checks: `pnpm typecheck:examples`
- Example builds (CI gate): `pnpm build:examples` — `tsc` never loads a bundler, so a broken Vite/Next config type-checks clean; both Next.js examples were unbuildable while the type-check job stayed green
