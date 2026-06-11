# IC Reactor Package Map

Load this reference when package ownership, verification, public API boundaries,
or generated-file behavior matters.

## Package Ownership

| Package                   | Owns                                                                                                               | First files to inspect                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ic-reactor/core`        | Framework-agnostic runtime: `ClientManager`, `Reactor`, `DisplayReactor`, query-cache integration, version exports | `packages/core/src/index.ts`, `packages/core/src/client.ts`, `packages/core/src/reactor.ts`, `packages/core/tests/`                                                                 |
| `@ic-reactor/react`       | React hook factories, direct reactor hooks, reusable query/mutation objects, `defineReactor`, `useActorMethod`     | `packages/react/src/index.ts`, `packages/react/src/createActorHooks.ts`, `packages/react/src/createQuery.ts`, `packages/react/src/hooks/useActorMethod.ts`, `packages/react/tests/` |
| `@ic-reactor/auth`        | Internet Identity authentication state, auth client loading, identity attributes, auth constants/types             | `packages/auth/src/index.ts`, `packages/auth/src/authentication-manager.ts`, `packages/auth/src/identity-attributes-manager.ts`, `packages/auth/tests/`                             |
| `@ic-reactor/auth-react`  | React hooks wrapping auth and identity attribute managers                                                          | `packages/auth-react/src/index.ts`, `packages/auth-react/src/createAuthHooks.ts`, `packages/auth-react/src/createIdentityAttributeHooks.ts`, `packages/auth-react/tests/`           |
| `@ic-reactor/candid`      | Runtime Candid adapters, metadata reactors, dynamic display reactors                                               | `packages/candid/src/index.ts`, `packages/candid/src/adapter.ts`, `packages/candid/src/metadata-display-reactor.ts`, `packages/candid/tests/`                                       |
| `@ic-reactor/parser`      | Rust/WASM Candid parser and generated web/node/bundler parser packages                                             | `packages/parser/src/lib.rs`, `packages/parser/tests/`, `packages/parser/package.json`                                                                                              |
| `@ic-reactor/codegen`     | Shared pipeline for declarations, reactor files, stable wrappers, client manager helpers, naming/parser utilities  | `packages/codegen/src/index.ts`, `packages/codegen/src/pipeline.ts`, `packages/codegen/src/generators/`, `packages/codegen/src/*.test.ts`                                           |
| `@ic-reactor/cli`         | `ic-reactor` executable, config loading, command prompts, JSON schema                                              | `packages/cli/src/index.ts`, `packages/cli/schema.json`, `packages/cli/README.md`                                                                                                   |
| `@ic-reactor/vite-plugin` | Vite plugin integration, watch-mode generation, environment-cookie injection                                       | `packages/vite-plugin/src/index.ts`, `packages/vite-plugin/README.md`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/`                                         |

## Dependency Boundaries

- `core` should not import React or auth-react.
- `react` re-exports core behavior and owns React-specific APIs.
- `auth` should stay usable outside React.
- `auth-react` should be the only auth package that imports React hooks.
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

| Change type                    | Minimum local verification                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `core` runtime                 | `pnpm --filter @ic-reactor/core test`, `pnpm --filter @ic-reactor/core build`             |
| React hooks/factories          | `pnpm --filter @ic-reactor/react test`, use `ic-reactor-hooks`                            |
| Auth runtime                   | `pnpm --filter @ic-reactor/auth test`, `pnpm --filter @ic-reactor/auth build`             |
| Auth React hooks               | `pnpm --filter @ic-reactor/auth-react test`, `pnpm --filter @ic-reactor/auth-react build` |
| Candid runtime                 | `pnpm --filter @ic-reactor/parser build`, `pnpm --filter @ic-reactor/candid test`         |
| Parser                         | `pnpm --filter @ic-reactor/parser build`, `pnpm --filter @ic-reactor/parser test`         |
| Code generation                | `pnpm --filter @ic-reactor/codegen test`, affected CLI/Vite tests/examples                |
| CLI                            | `pnpm --filter @ic-reactor/cli build`, focused manual command if behavior changed         |
| Vite plugin                    | `pnpm --filter @ic-reactor/vite-plugin test`, affected Vite example build/run             |
| Package metadata or references | `pnpm exec tsc --noEmit`, `pnpm exec tsc -b`, `pnpm build`                                |
| Dependency/security work       | `corepack pnpm audit --audit-level moderate`, affected package builds/tests               |

Before finishing broad PR work, prefer:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc -b
pnpm build
pnpm test
```

Add `pnpm typecheck:examples` when example compatibility may be affected.

## Generated Output Rules

Generated or transient outputs are usually not source of truth:

- package `dist/`
- parser `target/`
- `*.tsbuildinfo`
- local canister state: `.dfx/`, `.icp/`, `.mops/`
- app build outputs: `.next/`, `.astro/`, `dist/`
- generated canister declarations and generated hook files

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
