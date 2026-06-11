---
name: ic-reactor-packages
description: >-
  Inspect, modify, review, or document the IC Reactor monorepo package
  architecture. Use when work spans package ownership, package.json exports,
  tsconfig/project references, build/test scripts, generated artifacts,
  dependency boundaries, release readiness, or deciding where an AI agent should
  start for @ic-reactor/core, @ic-reactor/react, @ic-reactor/auth,
  @ic-reactor/auth-react, @ic-reactor/candid, @ic-reactor/parser,
  @ic-reactor/codegen, @ic-reactor/cli, or @ic-reactor/vite-plugin.
---

# IC Reactor Packages

Use this skill to orient package-level work quickly and avoid monorepo traps.
For React hook implementation details, use `ic-reactor-hooks`; for package
ownership, build boundaries, generated files, or cross-package changes, use this
skill first.

Read `references/package-map.md` when you need exact package responsibilities,
entry points, verification commands, or known failure modes.

## Workflow

1. Identify the owning package before editing.
2. Check the package's public surface: `package.json`, `src/index.ts`, exports,
   peer dependencies, and README.
3. Follow dependency direction:
   - `core` must stay framework-agnostic.
   - `react` can depend on `core`, React, and TanStack React Query.
   - `auth` can depend on `core` but not React.
   - `auth-react` can depend on `auth`, `core`, and React.
   - `codegen` owns generated source templates used by CLI and Vite plugin.
   - `cli` and `vite-plugin` should use `codegen` rather than duplicating
     generation logic.
4. Avoid editing generated artifacts unless the task is explicitly about
   publish output. Prefer changing source, generator templates, `.did` files, or
   stable wrapper files.
5. Run the narrowest meaningful verification first, then broaden before
   finishing.

## Package Routing

| Task                                                      | Start here                              |
| --------------------------------------------------------- | --------------------------------------- |
| Agent/query runtime, canister calls, display transforms   | `packages/core`                         |
| React hooks, factories, `defineReactor`, `useActorMethod` | `packages/react` and `ic-reactor-hooks` |
| Internet Identity login, auth state, identity attributes  | `packages/auth`                         |
| React auth hooks                                          | `packages/auth-react`                   |
| Dynamic Candid fetch/parse, metadata reactors             | `packages/candid`                       |
| Rust/WASM Candid parsing                                  | `packages/parser`                       |
| Declaration/reactor/client generation                     | `packages/codegen`                      |
| `ic-reactor` executable and config schema                 | `packages/cli`                          |
| Vite `.did` watching and environment injection            | `packages/vite-plugin`                  |

## Verification

Use CI-aligned commands:

- Root type check: `pnpm exec tsc --noEmit`
- Strict project-reference sanity: `pnpm exec tsc -b`
- Package builds: `pnpm build`
- Package tests: `pnpm test`
- Example type checks: `pnpm typecheck:examples`
- Docs build: `pnpm docs:build`
- Dependency audit: `corepack pnpm audit --audit-level moderate`

For focused work, prefer filters such as:

```bash
pnpm --filter @ic-reactor/auth test
pnpm --filter @ic-reactor/react test
pnpm --filter @ic-reactor/codegen test
pnpm --filter @ic-reactor/vite-plugin test
```

Build before parser/candid tests when tests import parser `dist` output:

```bash
pnpm --filter @ic-reactor/parser build
pnpm --filter @ic-reactor/candid test
```

Do not run package build and package test concurrently when parser/candid tests
are involved; parser build deletes and recreates `dist`.

## Generated Files

Normally ignore or regenerate these instead of hand-editing:

- `dist/`
- `.dfx/`, `.icp/`, `.mops/`
- `target/`
- `.next/`, `.astro/`
- `*.tsbuildinfo`
- generated canister declarations and generated hook files

For codegen behavior, edit `packages/codegen/src/` and verify both
`@ic-reactor/codegen` tests and the affected CLI/Vite example.

## Public API Checklist

When changing a package's exports or types, confirm:

- `src/index.ts` exports the intended API.
- `package.json` `main`, `types`, `module`, and `exports` are consistent.
- Peer dependencies remain peer dependencies when consumers must provide them.
- README examples import from the public package name, not private source paths.
- Existing examples still use the intended public API.

## Common Agent Mistakes

- Starting in an example when the bug belongs in a package generator.
- Fixing generated output instead of the generator.
- Adding React imports to `core` or `auth`.
- Adding duplicated codegen behavior in `cli` or `vite-plugin`.
- Running `tsc -b` without checking whether all referenced packages are listed
  in the root `tsconfig.json`.
- Treating mainnet-backed candid tests as ordinary fast unit tests.
