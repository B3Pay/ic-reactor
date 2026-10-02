# CLAUDE.md — IC Reactor Project Context

This file gives Claude-based agents the context of this repository. Task
routing and verification by change type are in [`AGENTS.md`](./AGENTS.md).

## Branches

- **`v4`** (this branch) is the development line of ic-reactor 4. Nothing on it
  is released: its packages are at `4.0.0-alpha.0`, and its release lane
  publishes prereleases only, never under `latest`.
- **`main`** is the 3.x line: security fixes only until 4.0 GA. At GA, `v3` is
  cut from `main` and `v4` becomes `main`.

Open pull requests for ic-reactor 4 against `v4`.

## What ic-reactor 4 is

A thin layer over a module that `candid-core-cli gen` generates from a `.did`
file, plus one consumer guide. There are no typed handles. Until the 0.3 beta
of `@candid-core/schema` is published and pinned exactly, no package code on
this branch is written against unpublished candid-core shapes.

## Packages on this branch

| Package                   | Directory              | State on `v4`                                                                                    |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `@ic-reactor/core`        | `packages/core`        | `4.0.0-alpha.0`; the 3.x runtime is removed, the entry is empty until the rewrite slices fill it |
| `@ic-reactor/react`       | `packages/react`       | `4.0.0-alpha.0`; the 3.x hooks are removed, the entry is empty until IR6 fills it                |
| `@ic-reactor/vite-plugin` | `packages/vite-plugin` | `4.0.0-alpha.0`; the `ic_env` cookie and `/api` proxy only, until generation returns (IR7)       |

Not in this tree: `@ic-reactor/parser`, `@ic-reactor/codegen` and
`@ic-reactor/cli` (replaced by `candid-core-cli gen`), and
`@ic-reactor/candid` (frozen at 3.x, published from `main`). The 3.x example
apps are on `main`; the v4 examples come with DX1.

## AI context

- `packages/core/llms.txt` is the one consumer guide. It is a placeholder
  until DX3 writes it; it must not describe an API that is not built yet.
- There is no root `llms.txt`, `llms-full.txt`, per-package guide or skill on
  this branch. The site root's `llms.txt` stays the 3.x line's until GA.
- `pnpm check:ai-context` checks the version stamps and docs links of
  `scripts/ai-context-files.js`.

## Docs

The docs site in `docs/` is served under `/v4/` (`base` in
`docs/astro.config.mjs`); `/v3/` is built from `main`. `.github/workflows/docs.yml`
on this branch deploys both lines together.

## Development

```bash
pnpm install          # pnpm is pinned by packageManager; corepack picks it up
pnpm build            # Build the packages
pnpm test             # Run the package tests
pnpm typecheck        # Type-check every package and e2e/ (CI gate)
pnpm lint             # ESLint over packages/*/src and tests (CI gate; build first)
pnpm format:check     # Prettier over the repo (CI gate)
pnpm check:ai-context # AI context versions and docs links (CI gate)
pnpm check:snippets   # Compile the READMEs' ts/tsx snippets (CI gate; build first)
pnpm verify:packages  # Pack and verify the published artifacts
pnpm verify:peer-floors # Lowest peers and oldest TypeScript (CI gate; build first)
```
