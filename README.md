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

> **This is the `v4` branch, where ic-reactor 4 is in development.** Its
> packages are at `4.0.0-beta.1`, published under npm's `beta` dist-tag; `latest`
> stays 3.x until 4.0 GA. ic-reactor 4 is a
> thin layer over a candid-core generated module, with a guide shipped in
> `@ic-reactor/core` (`packages/core/llms.txt`). Milestone 1
> ([#790](https://github.com/B3Pay/ic-reactor/issues/790)) replaced the 3.x
> runtime of `@ic-reactor/core` and `@ic-reactor/react` with the 4 API. The released
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

| Package                                             | Purpose                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@ic-reactor/core`](./packages/core)               | The client, errors, network and units (beta)                                                                                                       |
| [`@ic-reactor/react`](./packages/react)             | `'use client'` bindings over core (beta)                                                                                                           |
| [`@ic-reactor/vite-plugin`](./packages/vite-plugin) | Generates the candid-core module with `candid-core-cli gen` in a child process, and sets the local `ic_env` cookie and `/api` proxy for `vite dev` |

`@ic-reactor/parser`, `@ic-reactor/codegen` and `@ic-reactor/cli` are not part
of ic-reactor 4: `candid-core-cli gen` generates the canister module instead.
`@ic-reactor/candid` stays at 3.x, published from `main`. None of the four is
in this branch's tree.

What changed, per package, is in [`CHANGELOG.md`](./CHANGELOG.md).

## Install

ic-reactor 4 is a prerelease, published under npm's `beta` dist-tag: a plain
`npm install @ic-reactor/core` still installs 3.x. Install the beta with
`@beta`, and the candid-core packages at the exact versions its peers name:

```bash
npm install @ic-reactor/core@beta @ic-reactor/react@beta \
  @icp-sdk/core @tanstack/react-query
npm install --save-exact @candid-core/schema@0.3.0-beta.1
npm install --save-dev --save-exact @candid-core/cli@0.2.0-beta.1
npm install --save-dev @ic-reactor/vite-plugin@beta # optional, for Vite
```

Then read `node_modules/@ic-reactor/core/llms.txt`. The released 3.x packages
are documented at [ic-reactor.b3pay.net/v3](https://ic-reactor.b3pay.net/v3/).

## Examples

Four apps in [`examples/`](examples/), each with its own tests, and a page in
the [examples docs](https://ic-reactor.b3pay.net/v4/examples/):

- [`icrc-ledger`](examples/icrc-ledger/): mainnet ICP ledger reads, archive
  callbacks, and a sandbox that injects faults into transfers.
- [`vite-wallet`](examples/vite-wallet/): a React and Vite wallet on a local
  icp-cli network, with Internet Identity, a dev-account sign-in, a backend
  canister and optimistic writes.
- [`next-ssr`](examples/next-ssr/): a Next.js App Router app over mainnet
  ledgers, with one client per request, lossless hydration and streaming.
- [`node-agent-tool`](examples/node-agent-tool/): a command-line tool for
  people and AI agents, with identities, certified reads, safe re-sends and
  JSON output.

The 3.x examples are on `main`.

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

ic-reactor 4 ships one consumer guide, `llms.txt` in `@ic-reactor/core`'s
package (`node_modules/@ic-reactor/core/llms.txt`), and one consumer skill,
[`skill-packages/ic-reactor`](./skill-packages/ic-reactor/SKILL.md), which
points at it. The 3.x guides and skills are on `main`.

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
