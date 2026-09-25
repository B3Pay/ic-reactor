# AGENTS.md instructions for @ic-reactor

## Project snapshot

IC Reactor v3 is a TypeScript monorepo for Internet Computer apps.

Treat the published documentation and package manifests as the v3 release line.

### Packages

- `@ic-reactor/core` (`packages/core`, `3.12.5`) — core runtime, `ClientManager`, `Reactor`, `DisplayReactor`, cache integration.
- `@ic-reactor/react` (`packages/react`, `3.12.5`) — React bindings, actor hooks, query/mutation factories, Internet Identity auth, and identity-attribute hooks.
- `@ic-reactor/candid` (`packages/candid`, `3.12.5`) — dynamic Candid adapter/reactors and metadata reactors.
- `@ic-reactor/parser` (`packages/parser`, `0.5.0`) — Rust/WASM Candid parser.
- `@ic-reactor/codegen` (`packages/codegen`, `0.14.0`) — shared generation pipeline used by CLI and Vite plugin.
- `@ic-reactor/cli` (`packages/cli`, `0.14.0`) — `ic-reactor` CLI for explicit declaration/reactor generation.
- `@ic-reactor/vite-plugin` (`packages/vite-plugin`, `0.14.0`) — Vite plugin for watch-mode generation and local `ic_env` injection.

### Package alignment rules

- Describe published documentation as IC Reactor v3.
- Keep package-specific docs aligned with the released `@ic-reactor/core` v3.12.5 runtime and its published tooling.
- Prefer `@icp-sdk/*` package names in docs and examples.
- Prefer `defineReactor(...)` for React setup, and `defineDisplayReactor(...)` (same options) for display values; `defineReactor({ display: true })` is deprecated, so never generate it. Use `ClientManager` + `Reactor` + `createActorHooks` when explicit construction order is needed.
- In a server-rendered app, build reactors and query/mutation objects per request with `createReactorProvider(factory)` and read them with its `useReactor` hook, never at module scope (reference: `examples/nextjs/src/service/provider.tsx`). A React Server Component may import the core runtime (`Reactor`, `DisplayReactor`, `ClientManager`, `formatTokenAmount`, ...) from `@ic-reactor/react` through its `react-server` export condition; hooks, factories, `defineReactor` and the auth classes are not exported there.
- `createAuthHooks` takes an `AuthenticationManager`, not a `ClientManager`. `useIdentityAttributes` comes from `createIdentityAttributeHooks`, not `createAuthHooks`. `useAuth()` reports `isAuthenticating: true` until the first session restore settles.
- Call state-changing update methods only through mutations (`useActorMutation`, `useActorMethod`, `createMutation`), never a query hook or factory, which re-runs its method on every refetch. Give an update mutation `retry: reactorUpdateRetry`, never a numeric retry.
- A mutation's `invalidateQueries` takes query objects, query factories and `{ functionName, args? }` descriptors; never hand-write a key. `reactor.invalidateQueries(...)` returns a `Promise`.
- Wrap a hand-written `queryClient.fetchQuery` / `fetchInfiniteQuery` of a canister query in `clientManager.fetchAcrossIdentitySwitch(() => ...)`, as `query.fetch()` and `reactor.fetchQuery()` already are, so a sign-in mid-fetch cannot return the previous principal's data.
- Pass `skipToken` in place of args that are not known yet, use `reactor.forCanister(canisterId)` for many canisters of one interface, derive types with `ReactorArgsOf` / `ReactorDataOf` / `ReactorErrorOf<typeof reactor, "method">`, show or read token amounts with `formatTokenAmount` / `parseTokenAmount`, and validate typed principals with `isPrincipalText`.
- For codegen projects, `factories: true` on a canister entry generates a query or mutation object per method (`index.factories.generated.ts`); prefer it over hand-written per-method factory modules.
- Tests run the real reactor against `installFakeReplica` from `@ic-reactor/core/testing` (`@ic-reactor/react/testing` in React apps) instead of stubbing a `Reactor`.

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Skills live in the `skill-packages/` directory. Below is the list of skills that can be used in this repository.

### Available skills

The consumer skill, for apps that install the packages (not for work in this repository):

- `ic-reactor`: Setup choices, queries and mutations, invalidation, server rendering, sign-in, errors, token amounts, testing and anti-patterns for app code. It is the Claude Code plugin that `.claude-plugin/marketplace.json` lists, and other agents install it with `npx skills add B3Pay/ic-reactor --skill ic-reactor`. Update it when public API guidance changes, as you would `llms-full.txt`. (file: `skill-packages/ic-reactor/SKILL.md`)

Contributor skills, for work in this repository:

- `ic-reactor-hooks`: Create, refactor, and document Reactor hook integrations for this repo, including `createActorHooks`, query/mutation factories, `useActorMethod`, and generated hooks. Use when implementing or explaining hook usage inside React components versus imperative usage outside React. (file: `skill-packages/ic-reactor-hooks/SKILL.md`)
- `ic-reactor-packages`: Inspect, modify, review, or document the IC Reactor monorepo package architecture, package ownership, exports, tsconfig/project references, generated artifacts, dependency boundaries, and package verification workflows. Use when deciding which package owns a behavior or when work spans package metadata/build/test/release readiness. (file: `skill-packages/ic-reactor-packages/SKILL.md`)

## Package map

Use this map before editing so you can start in the package that owns the behavior:

| Package                   | Owns                                                                                                   | Look here first                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `@ic-reactor/core`        | Framework-agnostic runtime: `ClientManager`, `Reactor`, `DisplayReactor`, query-cache integration      | `packages/core/src/`, `packages/core/tests/`                                                      |
| `@ic-reactor/react`       | React hook factories, reusable query/mutation objects, `useActorMethod`, auth managers, and auth hooks | `packages/react/src/`, `packages/react/tests/`, `skill-packages/ic-reactor-hooks/SKILL.md`        |
| `@ic-reactor/candid`      | Runtime Candid fetching/parsing adapters and dynamic reactors                                          | `packages/candid/src/`, `packages/candid/METADATA_REACTOR_GUIDE.md`                               |
| `@ic-reactor/parser`      | Rust/WASM Candid parser package                                                                        | `packages/parser/src/`, `packages/parser/tests/`                                                  |
| `@ic-reactor/codegen`     | Shared declaration/reactor/client generation pipeline                                                  | `packages/codegen/src/`, `packages/codegen/src/*.test.ts`                                         |
| `@ic-reactor/cli`         | `ic-reactor` command-line interface and config schema                                                  | `packages/cli/src/`, `packages/cli/schema.json`                                                   |
| `@ic-reactor/vite-plugin` | Vite integration, `.did` watching, environment-cookie injection                                        | `packages/vite-plugin/src/`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/` |

## Where to start for a task

| Task                                        | Start here                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-call React setup                        | `packages/react/src/defineReactor.ts`, `packages/react/src/defineDisplayReactor.ts` (shared body in `defineReactorShared.ts`), `skill-packages/ic-reactor-hooks/SKILL.md` |
| Server-rendered apps                        | `packages/react/src/createReactorProvider.ts`, `examples/nextjs/src/service/provider.tsx`, `examples/nextjs-app-router/src/app/providers.tsx`                             |
| React Server Components                     | `packages/react/src/server.ts` (the `react-server` entry), `packages/react/tests/server-entry.test.ts`                                                                    |
| Hooks and query/mutation factories          | `packages/react/src/createActorHooks.ts`, `packages/react/src/create*.ts`, `packages/react/src/types.ts`, `docs/src/content/docs/reference/factories/`                    |
| `skipToken`, invalidation targets           | `packages/react/src/types.ts` (`SkippableQueryConfig`, `InvalidationTarget`), `packages/react/src/utils.ts`                                                               |
| Many canisters of one interface             | `Reactor.forCanister` in `packages/core/src/reactor.ts`                                                                                                                   |
| Types from a reactor                        | `packages/core/src/types/reactor.ts` (`ReactorArgsOf`, `ReactorDataOf`, `ReactorErrorOf`, `ServiceOf`, `TransformOf`)                                                     |
| Token amounts and principal text            | `packages/core/src/utils/token-amount.ts`, `packages/core/src/utils/helper.ts`, `docs/src/content/docs/reference/Utilities.mdx`                                           |
| Retries and errors                          | `packages/core/src/errors/index.ts`, `docs/src/content/docs/guides/error-handling.mdx`                                                                                    |
| Identity switches and the cache             | `ClientManager.updateAgent` and `fetchAcrossIdentitySwitch` in `packages/core/src/client.ts`                                                                              |
| Internet Identity auth, identity attributes | `packages/react/src/auth/`, `packages/react/src/hooks/createAuthHooks.ts`, `docs/src/content/docs/guides/authentication.mdx`                                              |
| Testing kit                                 | `packages/core/src/testing/`, `packages/react/src/testing.ts`, `docs/src/content/docs/guides/testing.mdx`                                                                 |
| Generated hooks and factories               | `packages/codegen/src/` (factories in `generators/factories.ts`), then the CLI and Vite consumers; `examples/codegen-in-action/`                                          |
| CLI config and commands                     | `packages/cli/src/`, `packages/cli/schema.json`                                                                                                                           |
| Vite generation and `ic_env` injection      | `packages/vite-plugin/src/`, `examples/vite-plugin-demo/`, `examples/vite-environment-variables/`                                                                         |
| Runtime Candid, metadata forms              | `packages/candid/src/`, `packages/candid/METADATA_REACTOR_GUIDE.md`                                                                                                       |
| `.did` parsing                              | `packages/parser/src/` (Rust), `packages/parser/tests/`                                                                                                                   |
| Consumer AI guides                          | `llms.txt`, `llms-full.txt`, `packages/*/llms.txt`; see [AI context files](#ai-context-files)                                                                             |

## Verification commands

- Format check (CI gate; covers the whole repo, with exclusions declared in `.prettierignore`): `pnpm format:check`
- AI context check (CI gate): `pnpm check:ai-context`; see [AI context files](#ai-context-files) for what it asserts.
- Lint used by CI: `pnpm lint` — ESLint flat config over `packages/*/src` and `packages/*/tests`. Run `pnpm build` first: the type-aware rules read core's emitted `.d.ts`, and without a build they degrade to `any` and stop reporting. A new package needs a `tsconfig.typecheck.json` and an entry in `TYPECHECK_PROJECTS`.
- Type check used by CI: `pnpm typecheck` — runs each package's own `typecheck` script plus `e2e/`'s, covering `src` and tests. The root `tsconfig.json` is references-only, so `pnpm exec tsc --noEmit` at the root checks nothing.
- Package builds: `pnpm build`
- Package tests: `pnpm test`
- Published-artifact verification: `pnpm verify:packages` — packs every publishable package, installs the tarballs outside the workspace, imports/requires each entry point in real Node, and runs `publint` + `attw`. Run it after any change to `exports`, `files`, build output, or module format; in-repo consumers resolve through workspace symlinks, so nothing else catches a broken published artifact.
- Example type checks: `pnpm typecheck:examples`
- Example builds (CI gate): `pnpm build:examples` — `tsc` never loads a bundler, so a broken Vite/Next config type-checks clean. Both Next.js examples were unbuildable while the type-check job stayed green.
- Docs build: `pnpm docs:build`, `pnpm docs:check-links`
- Dependency audit (CI gate on every PR): `pnpm verify:audit`

### Verification by change type

| Change                                     | Minimum verification                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Docs only                                  | `pnpm format:check`, `pnpm check:ai-context`, `pnpm docs:build`, `pnpm docs:check-links` |
| AI context files, `CHANGELOG.md`           | `pnpm check:ai-context`, `pnpm format:check`                                             |
| Skill, frontmatter or agent metadata       | a YAML/frontmatter parse check, `pnpm format:check`                                      |
| React hooks, factories or auth             | `pnpm --filter @ic-reactor/react test`                                                   |
| Core runtime                               | `pnpm --filter @ic-reactor/core test`                                                    |
| Parser or candid                           | `pnpm --filter @ic-reactor/parser build`, `pnpm --filter @ic-reactor/candid test`        |
| Codegen, CLI or Vite output                | `pnpm --filter @ic-reactor/codegen test`, plus the affected CLI or Vite plugin tests     |
| Broad package change                       | `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`                                 |
| Package `exports`, `files` or build output | `pnpm verify:packages`                                                                   |
| Examples                                   | `pnpm typecheck:examples`, `pnpm build:examples`                                         |
| A bug fix                                  | `pnpm verify:test-fails <test file> --package <pkg>` on the new test                     |

Do not run a package build and a package test at the same time when parser or
candid tests read the parser's `dist`: a parser build removes and recreates it.

## Generated files

Outputs under `dist`, `.dfx`, `.icp`, `.mops`, `target`, `.next`, `.astro`, and `*.tsbuildinfo` are build artifacts, and so are generated canister declarations, `index.generated.ts` and `index.factories.generated.ts` in the examples. Do not hand-edit them; change the generator in `packages/codegen/src/`, the wrapper, or the source `.did` instead, then regenerate and check the affected CLI or Vite consumer. `docs/src/content/docs/libs/` is TypeDoc output rewritten by `pnpm docs:build`.

## AI context files

Two audiences, kept apart:

- **Consumers** (agents writing apps that install the packages):
  - `llms.txt`: an index in the llmstxt.org shape (H1, `>` summary, short
    orientation, `##` sections of `[title](url): note` links, `## Optional`
    last). `.github/workflows/docs.yml` publishes it at
    `https://ic-reactor.b3pay.net/llms.txt`. Its links point at the `.md`
    companions `starlight-page-actions` publishes for each docs page under
    `/v3/` (source-cased: `reference/ClientManager.md`, and `packages/candid.md`
    for `packages/candid/index.mdx`).
  - `llms-full.txt`: the complete consumer guide, published at
    `https://ic-reactor.b3pay.net/llms-full.txt`. Every snippet must compile
    against the public API of the current packages.
  - `packages/<name>/llms.txt`: each package's own guide, shipped in its npm
    tarball through `"files"`. It opens with an `Applies to` line naming the
    package and its version, holds a setup snippet, a when-to-use table and a
    do-not list, and the package README's first lines point agents to it.
  - `CHANGELOG.md`: per-package Added / Changed / Deprecated / Fixed under
    `## Unreleased`.
  - `skill-packages/ic-reactor/`: the consumer Agent Skill (`SKILL.md` and
    `references/`). The folder is also the Claude Code plugin that
    `.claude-plugin/marketplace.json` lists (`.claude-plugin/plugin.json`
    beside a root `SKILL.md`), and the `skills` CLI installs the same folder,
    so there is no second copy. Its `SKILL.md` lists the versions it describes
    in the `llms.txt` line shape, and its plugin `version` is the runtime
    version.
  - Keep repo paths, pnpm commands and CI notes out of these files.
- **Contributors** (agents working in this repository): this file,
  `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md` and the
  contributor skills `skill-packages/ic-reactor-hooks/` and
  `skill-packages/ic-reactor-packages/`.

`pnpm check:ai-context` (`scripts/check-ai-context.js`) asserts that:

- `llms.txt` and `llms-full.txt` list every package at its `package.json`
  version (`` - `@ic-reactor/core`: `3.12.5` ``);
- every package, the parser included, ships a `packages/<name>/llms.txt`
  whose stamp line names its own current version
  (``Applies to `@ic-reactor/core` 3.12.5.``);
- no file in `scripts/ai-context-files.js` names a version no package is at,
  or a docs path other than `/v3/`;
- every `https://ic-reactor.b3pay.net/...` link in those files, the root and
  package READMEs, `CHANGELOG.md` and `CONTRIBUTING.md` is `/llms.txt`,
  `/llms-full.txt` or a `/v3/` page that exists in `docs/src/content/docs/`:
  a lowercase route (`/v3/reference/clientmanager`) or a source-cased `.md`
  companion (`/v3/reference/ClientManager.md`), with any `#fragment` naming a
  heading of that page. `libs/` (TypeDoc output) is not checked.
- every `skill-packages/<name>/SKILL.md` has frontmatter with only Agent
  Skills keys, a `name` equal to its folder and a `description` of at most
  1024 characters, and every skill's `SKILL.md` and `references/*.md` are in
  `scripts/ai-context-files.js`;
- `.claude-plugin/marketplace.json` and each plugin's `plugin.json` parse,
  their names agree, each `source` is a directory holding a skill, and a
  plugin `version` equals `@ic-reactor/react`'s;
- the consumer skill's `SKILL.md` and references name no repository path, and
  its version list is current.

`scripts/release.js` and `scripts/release-tools.js` rewrite the versions in
every file listed in `scripts/ai-context-files.js`, on lines that name a
released package, so the stamps and version lists follow a release. A plugin
manifest's `"version"` line names no package, so `scripts/release.js` sets the
manifests in `RUNTIME_PLUGIN_MANIFESTS` to the runtime version separately;
Claude Code updates an installed plugin only when that version changes. The parser
has no release script: bumping it means updating `llms.txt`, `llms-full.txt`,
`packages/parser/llms.txt` and the lane lines in the contributor files by
hand, and the check names each one that is stale.

## How to use skills

- Discovery: Skill bodies live on disk at `skill-packages/<skill-name>/SKILL.md`. Agent-specific metadata for the contributor skills is in `skill-packages/<skill-name>/agents/`.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description, use that skill for the turn.
- Missing/blocked: If a named skill is missing or the path can't be read, say so briefly and continue with the best fallback.
- Progressive disclosure:
  1. Open the skill `SKILL.md` and read only enough to follow the workflow.
  2. Load only the specific referenced files needed for the current request.
  3. Prefer bundled scripts/assets/references over recreating content.
- Coordination:
  1. Use the minimal set of skills that covers the task.
  2. State which skill(s) you're using and why (one short line).
- Context hygiene: Keep context small, avoid deep reference chasing, and load only relevant variant files.
- Safety and fallback: If a skill can't be applied cleanly, state the issue and continue with the next-best approach.

### Cross-agent compatibility

These skills are designed to work across multiple AI agent platforms. Each skill includes agent-specific metadata in `agents/`:

| Agent Platform     | Metadata File         | Project Discovery File            |
| ------------------ | --------------------- | --------------------------------- |
| OpenAI Codex       | `agents/openai.yaml`  | `AGENTS.md` (this file)           |
| Claude / Anthropic | `agents/claude.yaml`  | `CLAUDE.md`                       |
| GitHub Copilot     | `agents/copilot.yaml` | `.github/copilot-instructions.md` |
| Cursor             | —                     | `.cursorrules`                    |
