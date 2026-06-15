# CLAUDE.md — IC Reactor Project Context

This file provides context for Claude-based AI agents working in the IC Reactor repository.

## Project Overview

**IC Reactor v4** is a type-safe TypeScript monorepo for building Internet Computer (ICP) applications. It uses TanStack Query for caching/refetching, `@icp-sdk/*` packages for IC agent/auth/candid primitives, and generated or hand-written Candid service types for end-to-end TypeScript safety.

This branch is the next major release line. Package manifests may still show
pre-release versions until release automation performs the final version bump.

### Core Packages

- `@ic-reactor/core` (`packages/core`, `3.6.0`) — Core runtime, `ClientManager`, `Reactor`, `DisplayReactor`, cache integration
- `@ic-reactor/react` (`packages/react`, `3.6.0`) — React bindings, `defineReactor`, actor hooks, query/mutation factories
- `@ic-reactor/auth` (`packages/auth`, `3.6.0`) — Internet Identity authentication and signed identity attributes
- `@ic-reactor/auth-react` (`packages/auth-react`, `3.6.0`) — React auth and identity-attribute hooks
- `@ic-reactor/candid` (`packages/candid`, `3.6.0`) — Dynamic Candid adapter/reactors and metadata reactors
- `@ic-reactor/parser` (`packages/parser`, `0.4.6`) — Rust/WASM Candid parser
- `@ic-reactor/codegen` (`packages/codegen`, `0.11.1`) — Shared generation pipeline used by CLI and Vite plugin
- `@ic-reactor/cli` (`packages/cli`, `0.11.1`) — `ic-reactor` CLI for explicit declaration/reactor generation
- `@ic-reactor/vite-plugin` (`packages/vite-plugin`, `0.11.1`) — Vite plugin for watch-mode generation and local `ic_env` injection

## Package Ownership Map

Start in the package that owns the behavior:

| Package                   | Primary files                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `@ic-reactor/core`        | `packages/core/src/`, `packages/core/tests/`                                                      |
| `@ic-reactor/react`       | `packages/react/src/`, `packages/react/tests/`, `skill-packages/ic-reactor-hooks/SKILL.md`        |
| `@ic-reactor/auth`        | `packages/auth/src/`, `packages/auth/tests/`                                                      |
| `@ic-reactor/auth-react`  | `packages/auth-react/src/`, `packages/auth-react/tests/`                                          |
| `@ic-reactor/candid`      | `packages/candid/src/`, `packages/candid/METADATA_REACTOR_GUIDE.md`                               |
| `@ic-reactor/parser`      | `packages/parser/src/`, `packages/parser/tests/`                                                  |
| `@ic-reactor/codegen`     | `packages/codegen/src/`, `packages/codegen/src/*.test.ts`                                         |
| `@ic-reactor/cli`         | `packages/cli/src/`, `packages/cli/schema.json`                                                   |
| `@ic-reactor/vite-plugin` | `packages/vite-plugin/src/`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/` |

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

- **Type Safety**: Use Candid types. Avoid `any` or loose typing.
- **DisplayReactor**: Prefer `DisplayReactor` for UI components (handles BigInt/Principal serialization).
- **Reactor**: Use standard `Reactor` when raw Candid types are required.
- **Setup Pattern**: Prefer `defineReactor` for new React setup; use manual `ClientManager` + reactor setup when construction order needs finer control.
- **Factory Pattern**: Use `createActorHooks`, `createQuery`, `createSuspenseQuery`, `createInfiniteQuery`, `createSuspenseInfiniteQuery`, and `createMutation` factories instead of manual hook implementations.

## React Hook Patterns

- For the fastest canister bootstrap, prefer `defineReactor(...)`.
- For component-level canister calls with an existing reactor, prefer `createActorHooks(reactor)`.
- For reusable operations shared across components and non-React code, prefer:
  - `createQuery` / `createSuspenseQuery`
  - `createQueryFactory` / `createSuspenseQueryFactory` when args are supplied later
  - `createInfiniteQuery` / `createSuspenseInfiniteQuery`
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
pnpm exec tsc --noEmit # Root type check used by CI
pnpm typecheck:examples # Type-check example apps
pnpm format     # Format code with Prettier
pnpm docs:build # Build docs site
```

## Key File References

- `llms.txt` — Compact AI routing manifest
- `llms-full.txt` — Longer AI-friendly API and task guide
- `README.md` — Root package overview, install paths, examples, and AI context index
- `skill-packages/ic-reactor-hooks/SKILL.md` — Hook patterns skill
- `skill-packages/ic-reactor-packages/SKILL.md` — Package ownership and verification skill
- `packages/react/src/` — React package source
- `packages/react/README.md` — React package docs
- `packages/core/README.md` — Core runtime docs
- `packages/auth/README.md` and `packages/auth-react/README.md` — Auth docs
- `packages/candid/README.md` — Dynamic Candid and metadata reactor docs
- `packages/cli/README.md`, `packages/codegen/README.md`, and `packages/vite-plugin/README.md` — Codegen docs
- `examples/all-in-one-demo/src/lib/factories.ts` — Factory pattern examples
- `examples/tanstack-router/src/canisters/ledger/hooks/` — Generated hooks examples
