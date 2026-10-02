# IC Reactor

<div align="center">
  <img src="docs/src/assets/icon.svg" alt="IC Reactor Logo" width="240" />
  <br><br>
  <strong>Type-safe Internet Computer integration for TypeScript and React</strong>
  <br><br>

[![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)

</div>

---

> **This is the `v4` branch, where ic-reactor 4 is in development.** Nothing
> from it is released: its packages are at `4.0.0-alpha.0`. ic-reactor 4 is a
> thin layer over a candid-core generated module, with a guide that lands with
> DX3. The 3.x runtime was removed from `@ic-reactor/core` and
> `@ic-reactor/react` (IR0, [#794](https://github.com/B3Pay/ic-reactor/issues/794)),
> so both export nothing until the 4 slices of milestone 1
> ([#790](https://github.com/B3Pay/ic-reactor/issues/790)) land. The released
> 3.x line lives on `main` (security fixes only until 4.0 GA) and is documented
> at [ic-reactor.b3pay.net/v3](https://ic-reactor.b3pay.net/v3/).

IC Reactor is a monorepo of libraries for building Internet Computer (ICP) apps
in TypeScript. ic-reactor 4 adds, over the module `candid-core-cli gen` writes
for a canister:

- a client with caller-scoped query keys, for TanStack Query
- one error union that says whether a failed call may have executed
- network resolution: mainnet, a local replica, or the `ic_env` cookie
- strict token-unit helpers (`parseUnits`, `formatUnits`)
- a test client over a fake replica
- `'use client'` React bindings: a provider, `useClient` and `useAuth`

## Package Overview

| Package                                             | Purpose                                                |
| --------------------------------------------------- | ------------------------------------------------------ |
| [`@ic-reactor/core`](./packages/core)               | The client, errors, network and units (in development) |
| [`@ic-reactor/react`](./packages/react)             | `'use client'` bindings over core (in development)     |
| [`@ic-reactor/vite-plugin`](./packages/vite-plugin) | Local `ic_env` cookie and `/api` proxy for `vite dev`  |

`@ic-reactor/parser`, `@ic-reactor/codegen` and `@ic-reactor/cli` are not part
of ic-reactor 4: `candid-core-cli gen` generates the canister module instead.
`@ic-reactor/candid` stays at 3.x, published from `main`. None of the four is
in this branch's tree.

What changed, per package, is in [`CHANGELOG.md`](./CHANGELOG.md).

## Install

ic-reactor 4 is not published yet, so there is nothing to install from this
branch. To use ic-reactor today, install the released 3.x packages from `main`
and follow their docs at
[ic-reactor.b3pay.net/v3](https://ic-reactor.b3pay.net/v3/).

## Examples

The v4 branch has no example apps yet. The four v4 examples land with DX1; the
3.x examples are on `main`.

## Documentation

- Docs site: [ic-reactor.b3pay.net/v3](https://ic-reactor.b3pay.net/v3/) for
  3.x. This branch's site (source: [`./docs`](./docs)) is served under `/v4/`
  and holds a placeholder until DX2.
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Package docs:
  - [`@ic-reactor/react`](./packages/react/README.md)
  - [`@ic-reactor/core`](./packages/core/README.md)
  - [`@ic-reactor/vite-plugin`](./packages/vite-plugin/README.md)

Run docs locally:

```bash
cd docs
pnpm install
pnpm dev
```

## Development

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Run package tests
pnpm test

# Lint packages/*/src and packages/*/tests (CI gate; run after pnpm build)
pnpm lint

# Type-check every package and e2e/, including their tests (CI gate)
pnpm typecheck

# Check formatting (CI gate; covers the whole repo)
pnpm format:check

# Check versions, package stamps and docs links in the AI guides (CI gate)
pnpm check:ai-context

# Pack, install outside the workspace, and verify the published artifacts
# (real Node import + publint + attw)
pnpm verify:packages

# Run e2e tests
pnpm test-e2e

# Build docs
pnpm docs:build
```

## AI and Agent Integration

ic-reactor 4 will ship one consumer guide, `llms.txt` in `@ic-reactor/core`'s
package (`node_modules/@ic-reactor/core/llms.txt`), and one consumer skill.
On this branch the guide is a placeholder until DX3 writes it, and the skill
comes with it. The 3.x guides and skills are on `main`.

For agents working in this repository: [`AGENTS.md`](./AGENTS.md) and
[`CLAUDE.md`](./CLAUDE.md).

## Contributing

`v4` is the development line for ic-reactor 4; `main` takes 3.x security fixes
only until 4.0 GA. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development workflow, formatting, release notes, and AI-assisted contribution guidance.

Please also review the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)

---

<div align="center">
  Built for the <a href="https://internetcomputer.org">Internet Computer</a>
</div>
