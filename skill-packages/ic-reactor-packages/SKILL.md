---
name: ic-reactor-packages
description: >-
  Inspect, modify, review, or document the IC Reactor monorepo package
  architecture. Use when work spans package ownership, package.json exports,
  tsconfig/project references, build/test scripts, generated artifacts,
  dependency boundaries, release readiness, or deciding where an AI agent should
  start for @ic-reactor/core, @ic-reactor/react, @ic-reactor/candid,
  @ic-reactor/parser, @ic-reactor/codegen, @ic-reactor/cli, or
  @ic-reactor/vite-plugin.
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
   - `react` can depend on `core`, React, TanStack React Query, and auth client peers.
   - `codegen` owns generated source templates used by CLI and Vite plugin.
   - `cli` and `vite-plugin` should use `codegen` rather than duplicating
     generation logic.
4. Avoid editing generated artifacts unless the task is explicitly about
   publish output. Prefer changing source, generator templates, `.did` files, or
   stable wrapper files.
5. Run the narrowest meaningful verification first, then broaden before
   finishing.

## Package Routing

| Task                                                          | Start here                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Agent/query runtime, canister calls, display transforms       | `packages/core`                                                                                          |
| React hooks, factories, `defineReactor`, `useActorMethod`     | `packages/react` and `ic-reactor-hooks`                                                                  |
| Internet Identity login and auth state                        | `packages/react/src/auth/authentication-manager.ts`                                                      |
| Signed OpenID identity attributes                             | `packages/react/src/auth/identity-attributes-manager.ts`                                                 |
| React auth and identity-attribute hooks                       | `packages/react/src/hooks/createAuthHooks.ts`, `packages/react/src/auth/createIdentityAttributeHooks.ts` |
| Dynamic Candid fetch/parse, metadata reactors                 | `packages/candid`                                                                                        |
| Rust/WASM Candid parsing                                      | `packages/parser`                                                                                        |
| Declaration/reactor/client generation                         | `packages/codegen`                                                                                       |
| `ic-reactor` executable and config schema                     | `packages/cli`                                                                                           |
| Vite `.did` watching and environment injection                | `packages/vite-plugin`                                                                                   |
| Local Internet Identity `/authorize` detection                | `packages/react/src/auth/local-ii-probe.ts`, `packages/react/src/auth/constants.ts`                      |
| `ic_env` trust decision (`allowEnvConfig`, `trustsEnvConfig`) | `packages/core/src/client.ts`, `packages/core/src/utils/helper.ts`, `packages/core/src/reactor.ts`       |

`AuthenticationManager.prepareClient()` probes the locally deployed Internet
Identity canister and picks `/authorize` or the legacy `/#authorize`, or refuses
login when the build serves neither — from `release-2026-03-23` the II frontend
left the canister entirely, so newer builds cannot sign anyone in locally.
`localInternetIdentityProvider(port, canisterId?, authorizePath?)` takes the
path the probe chose.

Root-key questions belong to `core`, not the Vite plugin. `allowsEnvRootKey` is
a positive allowlist of hosts that are unambiguously a local replica;
`isMainnetHost` is not a "safe to trust local config" test, because a mainnet
dapp on a custom domain falls through it.

## Verification

Use CI-aligned commands:

- Format check (CI gate, covers `packages/**` only): `pnpm format:check`
- AI context check (CI gate): `pnpm check:ai-context`
- Type check every package including tests (CI gate): `pnpm typecheck`
- Strict project-reference sanity: `pnpm exec tsc -b`
- Package builds: `pnpm build`
- Package tests: `pnpm test`
- Published-artifact verification (pack + publint + attw + real Node import): `pnpm verify:packages`
- Example type checks: `pnpm typecheck:examples`
- Example builds (CI gate — `tsc` never loads a bundler, so a broken Vite or Next config type-checks clean): `pnpm build:examples`
- Docs build: `pnpm docs:build`
- Dependency audit: `corepack pnpm audit --audit-level moderate`

Run `pnpm verify:packages` after any change to a package's `exports`, `files`,
build output, or module format — in-repo consumers resolve through workspace
symlinks, so nothing else catches a broken published artifact.

When the change fixes a bug, run `pnpm verify:test-fails <test-file> --package <pkg>`
on the new test before opening the PR. It re-runs the tests against a base
revision and reports which ones flipped — a test that passes with and without
the fix proves nothing about it.

For focused work, prefer filters such as:

```bash
pnpm --filter @ic-reactor/react test
pnpm --filter @ic-reactor/core test
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
- `.ic-reactor-owner` — codegen's ownership marker inside each generated
  `outDir`, recording which canister owns it so a second canister is refused
  before it replaces the first one's declarations. Never point two canisters at
  one `outDir`. Deleting the whole output directory and regenerating is the
  documented recovery after a canister rename — that is what the pipeline's own
  error tells you to do — so do not describe the marker as undeletable.

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
- Adding React imports to `core`.
- Adding duplicated codegen behavior in `cli` or `vite-plugin`.
- Running `tsc -b` without checking whether all referenced packages are listed
  in the root `tsconfig.json`.
- Treating mainnet-backed candid tests as ordinary fast unit tests.
