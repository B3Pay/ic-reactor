# GitHub Copilot Instructions for IC Reactor

Follow these repository-specific patterns when suggesting code:

## Project Snapshot

- This branch is the next major release line and should be described as IC Reactor v4.
- Package manifests may still show pre-release versions until release automation performs the final version bump.
- Runtime packages are `@ic-reactor/core`, `@ic-reactor/react`, and `@ic-reactor/candid` at `3.6.0`.
- Code generation packages are `@ic-reactor/codegen`, `@ic-reactor/cli`, and `@ic-reactor/vite-plugin` at `0.11.1`.
- The WASM parser package is `@ic-reactor/parser` at `0.4.6`.
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
- `packages/react` owns React hooks, query/mutation factories, `defineReactor`, `useActorMethod`, Internet Identity auth, and identity-attribute hooks.
- `packages/candid` owns runtime Candid fetching/parsing adapters and dynamic reactors.
- `packages/parser` owns the Rust/WASM Candid parser.
- `packages/codegen` owns declaration, reactor, client, and hook generation.
- `packages/cli` owns the `ic-reactor` executable and config schema.
- `packages/vite-plugin` owns Vite integration, `.did` watching, and environment-cookie injection.

## React Hook Patterns (Important)

- For new React canister setup, prefer `defineReactor(...)` when one-call setup is enough.
- For component-level canister calls with an existing reactor, prefer `createActorHooks(reactor)`.
- For reusable operations shared across components and non-React code, prefer:
  - `createQuery`
  - `createSuspenseQuery`
  - `createQueryFactory`
  - `createSuspenseQueryFactory`
  - `createInfiniteQuery`
  - `createSuspenseInfiniteQuery`
  - `createMutation`
- Define reusable query/mutation objects at module scope (not inside components).
- Use `useActorMethod` only when a unified query/update hook is specifically helpful.

## Inside React vs Outside React

- Only call React hooks (`useActorQuery`, `.useQuery()`, `.useMutation()`, etc.) inside React components or custom hooks.
- For non-React usage (loaders/actions/services/tests/scripts), use imperative APIs:
  - query `.fetch()`
  - query `.invalidate()`
  - query `.getCacheData()`
  - mutation `.execute()`
  - reactor `.fetchQuery()`, `.getQueryData()`, `.invalidateQueries()`, `.callMethod()`

## Reactor Choice

- Prefer `DisplayReactor` for UI/form-friendly values (stringified principals/bigints).
- Prefer `Reactor` when raw Candid types are required.
- Always provide an explicit reactor `name`.

## Cache Invalidation

- Prefer `query.getQueryKey()` or `query.invalidate()` for invalidation wiring.
- Avoid hard-coded query keys when a query object already exists.

## Code Generation

- For many canisters or frequent `.did` changes, prefer generated hooks with:
  - `@ic-reactor/vite-plugin` (Vite)
  - `@ic-reactor/cli` (non-Vite / CI)
- Keep custom app logic in wrapper modules, not generated files.

## Where to look for examples

- `llms.txt`
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
- `AGENTS.md`
- `llms.txt`
- `llms-full.txt`
- `skill-packages/ic-reactor-hooks/SKILL.md`
- `skill-packages/ic-reactor-packages/SKILL.md`

## Verification

- Package builds: `pnpm build`
- Package tests: `pnpm test`
- Root type check used by CI: `pnpm exec tsc --noEmit`
- Example type checks: `pnpm typecheck:examples`
