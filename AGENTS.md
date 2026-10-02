# AGENTS.md instructions for @ic-reactor

## Project snapshot

This is the `v4` branch, the development line of ic-reactor 4. `main` is the
3.x line and takes security fixes only until 4.0 GA. Open pull requests for
ic-reactor 4 against `v4`.

ic-reactor 4 is a thin layer over a module that `candid-core-cli gen`
generates, plus one consumer guide. No package code on this branch is written
against unpublished candid-core shapes until the 0.3 beta of
`@candid-core/schema` is published and pinned exactly.

### Packages

- `@ic-reactor/core` (`packages/core`, `4.0.0-alpha.0`) — the 3.x runtime is removed (IR0): the entry exports nothing, and the milestone 1 slices add the 4 API. `src/testing/` keeps the fake replica.
- `@ic-reactor/react` (`packages/react`, `4.0.0-alpha.0`) — the 3.x hooks are removed (IR0): the entry exports nothing until IR6 adds the provider and `useAuth`.
- `@ic-reactor/vite-plugin` (`packages/vite-plugin`, `4.0.0-alpha.0`) — generates the candid-core module by running `@candid-core/cli` (`candid-core-cli gen`) in a child process, and sets the `ic_env` cookie and `/api` proxy.

`@ic-reactor/parser`, `@ic-reactor/codegen`, `@ic-reactor/cli` and
`@ic-reactor/candid` are not in this tree (the last stays at 3.x on `main`).

## Where to start for a task

| Task                          | Start here                                                                  |
| ----------------------------- | --------------------------------------------------------------------------- |
| Core runtime                  | `packages/core/src/`, `packages/core/tests/`                                |
| React bindings                | `packages/react/src/`, `packages/react/tests/`                              |
| Vite plugin generation        | `packages/vite-plugin/src/generate.ts`, `src/index.ts`                      |
| `ic_env` cookie and dev proxy | `packages/vite-plugin/src/dev-environment.ts`, `src/env.ts`, `src/index.ts` |
| Fake replica (testing)        | `packages/core/src/testing/`                                                |
| Real-replica e2e              | `e2e/` (Rust `hello_actor` canister, `e2e/test.sh`)                         |
| Docs site (`/v4/`)            | `docs/`, `.github/workflows/docs.yml`                                       |
| Consumer guide                | `packages/core/llms.txt` (placeholder until DX3)                            |
| Release lane                  | `scripts/release.js`, `.github/workflows/release.yml`                       |
| CI gates and their tests      | `scripts/` (`check-exports.mjs`, `verify-traps.mjs`, `verify-faults.mjs`)   |

## Verification commands

- Build and test: `pnpm build`, `pnpm test`
- Type check (CI gate): `pnpm typecheck` — each package's `typecheck` script plus `e2e/`'s.
- Lint (CI gate): `pnpm lint`. Run `pnpm build` first: the type-aware rules read core's emitted `.d.ts`.
- Format (CI gate): `pnpm format:check`
- AI context (CI gate): `pnpm check:ai-context` — version stamps, and docs links limited to the published bases (`/v2/`, `/v3/`, `/v4/`), with `/v4/` links resolved against `docs/src/content/docs/`.
- Snippets (CI gate; build first): `pnpm check:snippets`, and `pnpm check:snippets:docs` for the docs pages.
- Published artifacts: `pnpm verify:packages`
- Peer and TypeScript floors (CI gate; build first): `pnpm verify:peer-floors`
- Docs: `pnpm docs:build`, `pnpm docs:check-links`
- Export budget (CI gate; build first): `pnpm check:exports` — the built declarations of core, `core/testing`, react and the Vite plugin against the plan in `scripts/export-budget.mjs`: no unplanned name, no more than the cap, no name exported twice or also exported by `@candid-core/schema` or TanStack Query (D35), no `exports` subpath or publishable package the file does not list, and the schema declared only at the pinned version. Adding a public name or subpath means adding it to that file in the same change.
- Trap types (CI gate): `pnpm verify:traps` — every `@ts-expect-error` of `packages/core/tests/traps.test-d.ts` must be reported as unused (TS2578) once its fault fixture in `scripts/traps/` removes it. How to add a trap is in that file's header.
- Fault-proof runtime tests (CI gate): `pnpm verify:faults` — every test listed in `scripts/faults.json` must fail with its fault applied to a copy of its package. A test that guards a regression somebody could reintroduce gets an entry.
- Script tests (CI gate; build first): `pnpm test:scripts` — the gates above, `check:ai-context` and `check:snippets`, each run against repositories built for the purpose.
- A bug fix: `pnpm verify:test-fails <test file> --package <pkg>` on the new test, and a `scripts/faults.json` entry if it should stay proven

## Generated files

Outputs under `dist`, `.icp`, `target`, `.astro` and `*.tsbuildinfo` are build
artifacts. `docs/src/content/docs/libs/` is TypeDoc output written by
`pnpm docs:build`. `e2e/src/declarations/` is committed and, on this branch,
edited by hand when `e2e/src/actor/hello_actor.did` changes.

## AI context files

`scripts/ai-context-files.js` lists them: `packages/core/llms.txt`, this file
and `CLAUDE.md`, plus `packages/react/llms.txt` and the consumer skill
`skill-packages/ic-reactor/` once they exist. The consumer guide is
`packages/core/llms.txt`, shipped in core's tarball; it opens with an
`Applies to` line naming core's version, and until DX3 writes it, it states
only that ic-reactor 4 is in development. Keep repo paths and contributor
workflow out of it. The skill and any other guide land with DX3.

`check:ai-context` also fails on any of the 34 removed 3.x names
(`scripts/removed-v3-names.js`) outside a section headed "Removed in 4.0", and
`check:snippets` compiles every `ts`/`tsx` fence of these files against the
built packages.
