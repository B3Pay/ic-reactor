# CLAUDE.md — IC Reactor Project Context

This file gives Claude-based agents the context of this repository. Task
routing and verification by change type are in [`AGENTS.md`](./AGENTS.md).

## Branches

- **`main`** (this branch) is the line of ic-reactor 4. Its release lane
  publishes a stable 4.x version under npm's `latest` dist-tag and a 4.x
  prerelease under `beta` (`scripts/release-tag.mjs`).
- **`v3`** is the 3.x line, cut from `main` at the 4.0 GA flip: security fixes
  only, until 90 days after the 4.0 release, released with its own
  workflows. `v4`, the branch 4 was developed on until GA, is retired.

Open pull requests for ic-reactor 4 against `main`, and 3.x security fixes
against `v3`.

## What ic-reactor 4 is

A thin layer over a module that `candid-core-cli gen` generates from a `.did`
file, plus one consumer guide. There are no typed handles. No package code on
this branch is written against unpublished candid-core shapes: core's peer
`@candid-core/schema` and the Vite plugin's peer `@candid-core/cli` are pinned
exactly to published betas.

## Packages on this branch

| Package                   | Directory              | State on `main`                                                                                                                            |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ic-reactor/core`        | `packages/core`        | `4.0.0-beta.1`; `createClient`, `ReactorError`, the units helpers and their types (13 names), and `./testing` with `createTestClient`      |
| `@ic-reactor/react`       | `packages/react`       | `4.0.0-beta.1`; `ReactorProvider`, `useClient`, `useAuth` and `ReactorProviderProps`, over a core client                                   |
| `@ic-reactor/vite-plugin` | `packages/vite-plugin` | `4.0.0-beta.1`; generates the candid-core module with `@candid-core/cli` in a child process, and sets the `ic_env` cookie and `/api` proxy |

Not in this tree: `@ic-reactor/parser`, `@ic-reactor/codegen` and
`@ic-reactor/cli` (replaced by `candid-core-cli gen`), and
`@ic-reactor/candid` (frozen at 3.x, published from `v3`). The 3.x example
apps are on `v3`; the four ic-reactor 4 examples are in `examples/` (`icrc-ledger`,
`vite-wallet`, `next-ssr`, `node-agent-tool`).

## AI context

- `packages/core/llms.txt` is the one consumer guide, shipped in core's
  tarball; it must not describe an API that is not built yet.
  `packages/react/llms.txt` points at it, and
  `skill-packages/ic-reactor/SKILL.md`, the one consumer skill, adds only
  workflow. `node evals/harness/check-docs.mjs "$PWD/packages/core/llms.txt"`
  must find no hidden-test name or literal in the guide.
- There is no root `llms.txt` or `llms-full.txt` in this tree. The docs
  deploy serves `packages/core/llms.txt` as the site's `/llms.txt`, and keeps
  the frozen 3.x `llms-full.txt` from `v3` at `/llms-full.txt` and under `/v3/`.
- `pnpm check:ai-context` checks the version stamps and docs links of
  `scripts/ai-context-files.js`, and that none of the 34 removed 3.x names
  (`scripts/removed-v3-names.js`) appears outside a "Removed in 4.0" section.
  `pnpm check:snippets` compiles the code fences of the same files.
- The hand-written docs pages follow the removed-names rule as well; only
  `migrating-from-3.mdx` links `/v3/`, and a page names no `@ic-reactor`
  version. `pnpm check:snippets:docs` compiles their fences.

## Docs

The docs site in `docs/` is served under `/v4/` (`base` in
`docs/astro.config.mjs`); `/v3/` is rebuilt from the `v3` branch.
`.github/workflows/docs.yml` deploys both lines together from `main`
(`scripts/assemble-docs-site.mjs` assembles the site).

## Development

```bash
pnpm install          # pnpm is pinned by packageManager; corepack picks it up
pnpm build            # Build the packages
pnpm test             # Run the package tests
pnpm typecheck        # Type-check every package and e2e/ (CI gate)
pnpm lint             # ESLint over packages/*/src and tests (CI gate; build first)
pnpm format:check     # Prettier over the repo (CI gate)
pnpm check:ai-context # AI context versions and docs links (CI gate)
pnpm check:snippets   # Compile the ts/tsx snippets of the READMEs and AI-context files (CI gate; build first)
pnpm check:exports    # Built entries against scripts/export-budget.mjs (CI gate; build first)
pnpm verify:traps     # Each @ts-expect-error of traps.test-d.ts bites (CI gate)
pnpm verify:faults    # Each test of scripts/faults.json fails under its fault (CI gate)
pnpm test:scripts     # The gates' own tests (CI gate; build first)
pnpm verify:packages  # Pack and verify the published artifacts
pnpm verify:peer-floors # Lowest peers and oldest TypeScript (CI gate; build first)
```
