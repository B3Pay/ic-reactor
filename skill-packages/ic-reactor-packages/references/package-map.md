# IC Reactor Package Map

Load this reference when package ownership, verification, public API boundaries,
or generated-file behavior matters.

## Package Ownership

| Package                   | Owns                                                                                                                                                                                                                           | First files to inspect                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ic-reactor/core`        | Framework-agnostic runtime: `ClientManager`, `Reactor`, `DisplayReactor`, query-cache integration, version exports                                                                                                             | `packages/core/src/index.ts`, `packages/core/src/client.ts`, `packages/core/src/reactor.ts`, `packages/core/tests/`                                                                                             |
| `@ic-reactor/react`       | React hook factories, direct reactor hooks, reusable query/mutation objects, `defineReactor`, `useActorMethod`, auth managers, and auth hooks                                                                                  | `packages/react/src/index.ts`, `packages/react/src/auth/`, `packages/react/src/createActorHooks.ts`, `packages/react/src/createQuery.ts`, `packages/react/src/hooks/useActorMethod.ts`, `packages/react/tests/` |
| `@ic-reactor/candid`      | Runtime Candid adapters, metadata reactors, dynamic display reactors                                                                                                                                                           | `packages/candid/src/index.ts`, `packages/candid/src/adapter.ts`, `packages/candid/src/metadata-display-reactor.ts`, `packages/candid/tests/`                                                                   |
| `@ic-reactor/parser`      | Rust/WASM Candid parser; `wasm-pack` emits `dist/web`, `dist/nodejs`, and `dist/bundler` behind a single conditional `.` export                                                                                                | `packages/parser/src/lib.rs`, `packages/parser/tests/`, `packages/parser/package.json`                                                                                                                          |
| `@ic-reactor/codegen`     | Shared pipeline for declarations, reactor files, stable wrappers, client manager helpers, naming helpers, and config validation (canister-name pattern, contained `outDir`, module specifiers) consumed by CLI and Vite plugin | `packages/codegen/src/index.ts`, `packages/codegen/src/pipeline.ts`, `packages/codegen/src/validate.ts`, `packages/codegen/src/generators/`, `packages/codegen/src/*.test.ts`                                   |
| `@ic-reactor/cli`         | `ic-reactor` executable, config loading, command prompts, JSON schema                                                                                                                                                          | `packages/cli/src/index.ts`, `packages/cli/schema.json`, `packages/cli/README.md`                                                                                                                               |
| `@ic-reactor/vite-plugin` | Vite plugin integration, watch-mode generation, environment-cookie injection                                                                                                                                                   | `packages/vite-plugin/src/index.ts`, `packages/vite-plugin/README.md`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/`                                                                     |

## Dependency Boundaries

- `core` should not import React.
- `react` re-exports core behavior and owns React-specific APIs, auth managers, and auth hooks.
- `candid` may use `core` and optionally load `parser`.
- `codegen` should stay UI-framework aware only through generated target options.
- `cli` and `vite-plugin` should call `codegen` APIs instead of copying generator
  logic.

## Public Surface Checks

For each package touched:

1. Inspect `package.json`:
   - `name`, `version`, `description`
   - `main`, `module`, `types`, `exports`
   - `files`
   - `dependencies` vs `peerDependencies`
   - scripts used by root `pnpm build` / `pnpm test`
2. Inspect `src/index.ts` for the public export shape.
3. Check README examples for imports from package names, not private paths.
4. For generated APIs, check the generator snapshot/tests before editing docs.

## Verification Matrix

| Change type                    | Minimum local verification                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `core` runtime                 | `pnpm --filter @ic-reactor/core test`, `pnpm --filter @ic-reactor/core build`                                                                |
| React hooks/factories          | `pnpm --filter @ic-reactor/react test`, use `ic-reactor-hooks`                                                                               |
| Auth runtime and auth hooks    | `pnpm --filter @ic-reactor/react test`, `pnpm --filter @ic-reactor/react build`                                                              |
| Candid runtime                 | `pnpm --filter @ic-reactor/parser build`, `pnpm --filter @ic-reactor/candid test`                                                            |
| Parser                         | `pnpm --filter @ic-reactor/parser build`, `pnpm --filter @ic-reactor/parser test`                                                            |
| Code generation                | `pnpm --filter @ic-reactor/codegen test`, affected CLI/Vite tests/examples                                                                   |
| CLI                            | `pnpm --filter @ic-reactor/cli test`, `pnpm --filter @ic-reactor/cli build`; add a focused manual run for behaviour the suite does not cover |
| Vite plugin                    | `pnpm --filter @ic-reactor/vite-plugin test`, affected Vite example build/run                                                                |
| Package metadata or references | `pnpm typecheck`, `pnpm exec tsc -b`, `pnpm build`, `pnpm verify:packages`                                                                   |
| Dependency/security work       | `corepack pnpm audit --audit-level moderate`, affected package builds/tests                                                                  |

Before finishing broad PR work, prefer:

```bash
pnpm format:check
pnpm check:ai-context
pnpm typecheck
pnpm build
pnpm test
pnpm build:examples
```

When the change fixes a bug, also run
`pnpm verify:test-fails <test-file> --package <pkg>` before opening the PR — it
re-runs the tests against a base revision, and a test that passes with and
without the fix proves nothing about it.

`pnpm typecheck` runs each package's own `typecheck` script, so it covers tests
as well as `src`. `pnpm format:check` only globs `packages/**`, so Prettier
never sees root markdown, `docs/`, `examples/`, or `skill-packages/`.

Add `pnpm typecheck:examples` **and `pnpm build:examples`** when example
compatibility may be affected — the type check never loads a bundler, so a
broken Vite or Next config passes it while the CI build job fails — and
`pnpm verify:packages` when `exports`, `files`, build output, or module format
changed — it packs each package, installs the tarballs outside the workspace,
imports every entry point in real Node, and runs `publint` + `attw`.

## Generated Output Rules

Generated or transient outputs are usually not source of truth:

- package `dist/`
- parser `target/`
- `*.tsbuildinfo`
- local canister state: `.dfx/`, `.icp/`, `.mops/`
- app build outputs: `.next/`, `.astro/`, `dist/`
- generated canister declarations and generated hook files
- `.ic-reactor-owner` — codegen's ownership marker inside each generated
  `outDir`; regenerate rather than edit or delete it, and never point two
  canisters at one `outDir` (the pipeline rejects it)

If generated files are wrong:

1. Find the owning generator in `packages/codegen/src/generators/`.
2. Update tests/snapshots in `packages/codegen/src/`.
3. Regenerate or rebuild only after the source generator is fixed.

## Example Routing

- Vite plugin generation: `examples/vite-plugin-demo`
- Vite environment cookie injection: `examples/vite-environment-variables`
- Reusable factory patterns: `examples/all-in-one-demo/src/lib/factories.ts`
- Generated TanStack Router hooks: `examples/tanstack-router/src/canisters/ledger/hooks/`
- Auth and identity attributes: `examples/identity-attributes-demo`
- Dynamic metadata/candid behavior: `examples/metadata-reactor-demo`,
  `examples/metadata-reactor-capabilities-demo`

## Known Testing Notes

- `packages/parser` tests import built `dist/nodejs`; build parser before parser
  tests if `dist` may be absent.
- `packages/candid` includes mainnet-backed tests; expect slower network-bound
  runs and use explicit timeouts for live IC calls.
- Do not run `pnpm build` and `pnpm test` concurrently across packages when
  parser/candid are involved because parser build removes `dist`.
