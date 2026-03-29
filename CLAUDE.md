# CLAUDE.md — IC Reactor Project Context

This file provides context for Claude-based AI agents working in the IC Reactor repository.

## Project Overview

**IC Reactor v3** is a type-safe TypeScript library for building Internet Computer (ICP) applications. It leverages TanStack Query (React Query) for state management and caching, with full Candid type support.

### Core Packages

- `@ic-reactor/core` — Low-level API for managing actors, agents, and query caching
- `@ic-reactor/react` — High-level React hooks and context providers
- `@ic-reactor/candid` — Dynamic Candid parsing and runtime reactors
- `@ic-reactor/cli` — Code generation for declarations + typed hooks/reactors
- `@ic-reactor/vite-plugin` — Watch-mode code generation for Vite projects

## Skills

Skills are structured instruction sets stored in `skill-packages/`. When a task matches a skill's description, load the skill's `SKILL.md` and follow its workflow.

### Available Skills

- **`ic-reactor-hooks`**: Create, refactor, and document Reactor hook integrations, including `createActorHooks`, query/mutation factories, `useActorMethod`, and generated hooks. Use when implementing or explaining hook usage inside React components versus imperative usage outside React. (file: `skill-packages/ic-reactor-hooks/SKILL.md`)

### How to Use Skills

1. **Discovery**: Skill instructions live in `skill-packages/<skill-name>/SKILL.md`.
2. **Trigger**: If the user names a skill or the task matches a skill's description, use that skill.
3. **Progressive disclosure**: Read the `SKILL.md` first; load `references/` files only when concrete examples are needed.
4. **Agent metadata**: Claude-specific metadata is in `skill-packages/<skill-name>/agents/claude.yaml`.

## Core Principles

- **Type Safety**: Use Candid types. Avoid `any` or loose typing.
- **DisplayReactor**: Prefer `DisplayReactor` for UI components (handles BigInt/Principal serialization).
- **Reactor**: Use standard `Reactor` when raw Candid types are required.
- **Factory Pattern**: Use `createActorHooks`, `createQuery`, and `createMutation` factories instead of manual hook implementations.

## React Hook Patterns

- For component-level canister calls, prefer `createActorHooks(reactor)`.
- For reusable operations shared across components and non-React code, prefer:
  - `createQuery` / `createSuspenseQuery`
  - `createInfiniteQuery`
  - `createMutation`
- Define reusable query/mutation objects at module scope (not inside components).
- Use `useActorMethod` only when a unified query/update hook is specifically helpful.

## Inside React vs Outside React

- Only call React hooks (`useActorQuery`, `.useQuery()`, `.useMutation()`, etc.) inside React components or custom hooks.
- For non-React usage (loaders/actions/services/tests/scripts), use imperative APIs:
  - query `.fetch()` / `.invalidate()` / `.getCacheData()`
  - mutation `.execute()`
  - reactor `.fetchQuery()` / `.getQueryData()` / `.invalidateQueries()` / `.callMethod()`

## Cache Invalidation

- Prefer `query.getQueryKey()` or `query.invalidate()` for invalidation wiring.
- Avoid hard-coded query keys when a query object already exists.

## Code Generation

- For many canisters or frequent `.did` changes, prefer generated hooks with:
  - `@ic-reactor/vite-plugin` (Vite)
  - `@ic-reactor/cli` (non-Vite / CI)
- Keep custom app logic in wrapper modules, not generated files.

## Development

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run all tests
pnpm format     # Format code with Prettier
```

## Key File References

- `llms.txt` — Comprehensive AI-friendly API guide
- `skill-packages/ic-reactor-hooks/SKILL.md` — Hook patterns skill
- `packages/react/src/` — React package source
- `packages/react/README.md` — React package docs
- `examples/all-in-one-demo/src/lib/factories.ts` — Factory pattern examples
- `examples/tanstack-router/src/canisters/ledger/hooks/` — Generated hooks examples
