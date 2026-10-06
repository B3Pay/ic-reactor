# AGENTS.md instructions for @ic-reactor

## Project snapshot

This is the `v4` branch, the development line of ic-reactor 4. `main` is the
3.x line and takes security fixes only until 4.0 GA. Open pull requests for
ic-reactor 4 against `v4`.

ic-reactor 4 is a thin layer over a module that `candid-core-cli gen`
generates, plus one consumer guide. Its packages are written against the
published stable candid-core releases, `@candid-core/schema` and
`@candid-core/cli`, each pinned exactly.

### Packages

- `@ic-reactor/core` (`packages/core`, `4.0.0-beta.2`) — the 4 API of milestone 1: `createClient`, `ReactorError` and `isReactorError`, `parseUnits` and `formatUnits`, and their types (13 names, `scripts/export-budget.mjs`). `src/testing/` is the `@ic-reactor/core/testing` entry: `createTestClient` (a real client over the fake replica, with typed `TestHandlers` and a controllable sign-in) is its only export; the fake replica and the test auth behind it are internal.
- `@ic-reactor/react` (`packages/react`, `4.0.0-beta.2`) — `'use client'` bindings over a core client: `ReactorProvider`, `useClient`, `useAuth` and the type `ReactorProviderProps`. It never re-exports core.
- `@ic-reactor/vite-plugin` (`packages/vite-plugin`, `4.0.0-beta.2`) — generates the candid-core module by running `@candid-core/cli` (`candid-core-cli gen`) in a child process, and sets the `ic_env` cookie and `/api` proxy.

`@ic-reactor/parser`, `@ic-reactor/codegen`, `@ic-reactor/cli` and
`@ic-reactor/candid` are not in this tree (the last stays at 3.x on `main`).

## Where to start for a task

| Task                          | Start here                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Core runtime                  | `packages/core/src/`, `packages/core/tests/`                                                |
| React bindings                | `packages/react/src/`, `packages/react/tests/`                                              |
| Vite plugin generation        | `packages/vite-plugin/src/generate.ts`, `src/index.ts`                                      |
| `ic_env` cookie and dev proxy | `packages/vite-plugin/src/dev-environment.ts`, `src/env.ts`, `src/index.ts`                 |
| Test client, fake replica     | `packages/core/src/testing/` (`test-client.ts` is the entry's only export)                  |
| Real-replica e2e              | `e2e/` (Rust `hello_actor` canister, `e2e/test.sh`)                                         |
| Example apps                  | `examples/<name>/` (own tests and `gen:check`; a page in `docs/src/content/docs/examples/`) |
| Docs site (`/v4/`)            | `docs/`, `.github/workflows/docs.yml`                                                       |
| Consumer guide and skill      | `packages/core/llms.txt`, `skill-packages/ic-reactor/SKILL.md`                              |
| Release lane                  | `scripts/release.js`, `.github/workflows/release.yml`                                       |
| CI gates and their tests      | `scripts/` (`check-exports.mjs`, `verify-traps.mjs`, `verify-faults.mjs`)                   |

## Verification commands

- Build and test: `pnpm build`, `pnpm test`
- Type check (CI gate): `pnpm typecheck` — each package's `typecheck` script plus `e2e/`'s.
- Lint (CI gate): `pnpm lint`. Run `pnpm build` first: the type-aware rules read core's emitted `.d.ts`.
- Format (CI gate): `pnpm format:check`
- AI context (CI gate): `pnpm check:ai-context` — version stamps, and docs links limited to the published bases (`/v2/`, `/v3/`, `/v4/`), with `/v4/` links resolved against `docs/src/content/docs/`.
- Snippets (CI gate; build first): `pnpm check:snippets`, and `pnpm check:snippets:docs` for the docs pages.
- Published artifacts: `pnpm verify:packages`
- Examples on the published beta: `pnpm test:examples:published` (needs only Node, npm and git) — each example's tracked files copied outside the repository and installed from npm with npm; it refuses a `workspace:` range, checks every installed @ic-reactor/* package is a real directory at the version of npm's `beta` dist-tag, then runs the example's `typecheck`, `test` and `build` scripts, and its `.stackblitzrc` start command under a model of what StackBlitz's WebContainer lacks (no global `Iterator`; an `AsyncLocalStorage` that keeps no store across an await). Its own workflow, `.github/workflows/examples-published.yml`, runs it on pushes and pull requests to `v4`. An example change that needs an unpublished API lands with the release that publishes it.
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
`pnpm docs:build`. `e2e/src/declarations/` is committed: the module
`candid-core-cli gen` writes from `e2e/src/actor/hello_actor.did` (`pnpm gen`
in `e2e/`; `e2e/test.sh` fails a stale copy with `pnpm gen:check`).

## AI context files

`scripts/ai-context-files.js` lists them: `packages/core/llms.txt`, this file
and `CLAUDE.md`, plus `packages/react/llms.txt` (a pointer to the guide) and
the consumer skill `skill-packages/ic-reactor/`. The consumer guide is
`packages/core/llms.txt`, shipped in core's tarball; it opens with an
`Applies to` line naming core's version. Keep repo paths and contributor
workflow out of it, and keep it free of the eval's hidden-test names and
literals (`node evals/harness/check-docs.mjs "$PWD/packages/core/llms.txt"`).
Its snippets import the generated modules in
`scripts/check-snippets/app/generated/`.

`check:ai-context` also fails on any of the 34 removed 3.x names
(`scripts/removed-v3-names.js`) outside a section headed "Removed in 4.0", and
`check:snippets` compiles every `ts`/`tsx` fence of these files against the
built packages.

The hand-written docs pages (`docs/src/content/docs/`, not `libs/`) are not
AI-context files, but `check:ai-context` holds them to the removed-names rule
too, lets only `migrating-from-3.mdx` link `/v3/`, refuses an `@ic-reactor`
version on a page (the site follows the branch) and any prerelease version
that is not an exact pin of a `packages/*/package.json`, and wants each
package's `homepage` to be its page under `/v4/packages/`.
`pnpm check:snippets:docs` compiles the pages' fences; their fixtures are in
`scripts/check-snippets/docs/<section>/`.
