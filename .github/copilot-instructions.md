# GitHub Copilot Instructions for IC Reactor

Follow these repository-specific patterns when suggesting code:

## Core Principles

- Preserve existing IC Reactor and TanStack Query patterns.
- Prefer small, explicit changes over large custom abstractions.
- Keep TypeScript types accurate and inferable.
- Do not hand-edit generated files unless the user explicitly asks.

## React Hook Patterns (Important)

- For component-level canister calls, prefer `createActorHooks(reactor)`.
- For reusable operations shared across components and non-React code, prefer:
  - `createQuery`
  - `createSuspenseQuery`
  - `createInfiniteQuery`
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

- `packages/react/src/`
- `packages/react/README.md`
- `examples/all-in-one-demo/src/lib/factories.ts`
- `examples/tanstack-router/src/canisters/ledger/hooks/`
- `AGENTS.md`
- `.codex/skills/ic-reactor-hooks/SKILL.md`
