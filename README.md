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

IC Reactor is a monorepo of libraries for building Internet Computer (ICP) apps with:

- end-to-end TypeScript types
- TanStack Query-powered caching and refetching
- React hook factories (`useActorQuery`, `useActorMutation`, etc.)
- display-friendly transforms (`DisplayReactor`)
- optional code generation (CLI + Vite plugin)

## Why IC Reactor

IC Reactor gives you a higher-level API than raw `Actor` usage while keeping type safety and control:

- typed canister method calls
- built-in cache keys and invalidation primitives
- typed `Ok`/`Err` result handling
- shared agent + cache management via `ClientManager`, with Internet Identity in `AuthenticationManager`
- reusable query/mutation objects that work both inside and outside React

## Package Overview

| Package                                             | Purpose                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`@ic-reactor/core`](./packages/core)               | Core runtime (`ClientManager`, `Reactor`, `DisplayReactor`, cache integration) |
| [`@ic-reactor/react`](./packages/react)             | React hooks + query/mutation factories                                         |
| [`@ic-reactor/candid`](./packages/candid)           | Dynamic Candid parsing and runtime reactors                                    |
| [`@ic-reactor/parser`](./packages/parser)           | Local Candid parser (WASM-based)                                               |
| [`@ic-reactor/codegen`](./packages/codegen)         | Shared codegen pipeline used by CLI and Vite plugin                            |
| [`@ic-reactor/cli`](./packages/cli)                 | Generate declarations + typed hooks/reactors                                   |
| [`@ic-reactor/vite-plugin`](./packages/vite-plugin) | Vite plugin for watch-mode hook generation                                     |

What changed, per package, is in [`CHANGELOG.md`](./CHANGELOG.md), including
the changes on `main` that no release carries yet.

## Install

### React apps

```bash
pnpm add @ic-reactor/react @icp-sdk/core @tanstack/react-query
```

### Non-React apps

```bash
pnpm add @ic-reactor/core @icp-sdk/core @tanstack/query-core
```

### Optional packages

```bash
# Internet Identity auth helpers
pnpm add @icp-sdk/auth@^10 # v10 recommended; v8 also supported

# Dynamic Candid support (explorers/dev tools). The example below imports
# ClientManager and QueryClient from these two, which a React install lacks.
pnpm add @ic-reactor/candid @ic-reactor/core @tanstack/query-core
```

> **Install `@icp-sdk/auth@^10` if you use npm.** v10 is the first release whose
> peer is `@icp-sdk/core@^6`, which is what IC Reactor needs, so the set installs
> under a strict `npm install` with no `overrides` block. v8 is still supported
> and still needs that override on npm — see
> [`@ic-reactor/react`](./packages/react/README.md). v9 is not supported: it
> peers `@icp-sdk/core@^5`.

## Quick Start (React)

### 0. Fastest path: `defineReactor`

```ts
// src/reactor.ts
import { defineReactor } from "@ic-reactor/react"
import { idlFactory, type _SERVICE } from "./declarations/my_canister"

export const {
  reactor: backendReactor,
  queryClient,
  clientManager,
  useActorQuery,
  useActorMutation,
  useAuth,
} = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})
```

One call creates the `QueryClient`, `ClientManager`, reactor, and bound hooks —
including `useAuth`, `useAgentState`, `useUserPrincipal`, and
`useIdentityAttributes`. For UI-friendly values (text instead of `bigint` and
`Principal`), `defineDisplayReactor` takes the same options and builds a
`DisplayReactor`; it replaces `defineReactor({ display: true })`, which is
deprecated. Steps 1–3 below show the manual equivalent, for when you need
explicit construction order or the smallest bundle (see
[Bundle Size](./packages/react/README.md#bundle-size)).

### 1. Create a shared client manager and reactor

```ts
// src/reactor.ts
import { ClientManager, Reactor } from "@ic-reactor/react"
import { QueryClient } from "@tanstack/react-query"
import { idlFactory, type _SERVICE } from "./declarations/my_canister"

export const queryClient = new QueryClient()

export const clientManager = new ClientManager({
  queryClient,
})

export const backendReactor = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  name: "backend",
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
})
```

### 2. Create hooks

```ts
// src/hooks.ts
import {
  AuthenticationManager,
  createActorHooks,
  createAuthHooks,
} from "@ic-reactor/react"
import { backendReactor, clientManager } from "./reactor"

export const {
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
} = createActorHooks(backendReactor)

export const authentication = new AuthenticationManager({ clientManager })

export const { useAuth, useUserPrincipal } = createAuthHooks(authentication)
```

### 3. Use in React components

```tsx
// src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./reactor"
import { useActorQuery, useActorMutation, useAuth } from "./hooks"

function Greeting() {
  const { data, isPending, error } = useActorQuery({
    functionName: "greet",
    args: ["World"],
  })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <h1>{data}</h1>
}

function AuthButton() {
  const { login, logout, isAuthenticated, principal } = useAuth()

  return isAuthenticated ? (
    <button onClick={() => logout()}>
      Logout {principal?.toText().slice(0, 8)}...
    </button>
  ) : (
    <button onClick={() => login()}>Login</button>
  )
}

function UpdateProfileButton() {
  const { mutate, isPending } = useActorMutation({
    functionName: "update_profile",
  })

  return (
    <button disabled={isPending} onClick={() => mutate([{ name: "Alice" }])}>
      {isPending ? "Saving..." : "Save"}
    </button>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthButton />
      <Greeting />
      <UpdateProfileButton />
    </QueryClientProvider>
  )
}
```

## Core Usage Patterns

### Pattern A: Generic hooks with `createActorHooks(...)`

Use when component code can pass `functionName` and `args` inline.

- Best for straightforward React integration
- Single typed hook suite per reactor

### Pattern B: Reusable query/mutation factories (recommended for shared use)

Use when the same operation must be used:

- inside React components
- in route loaders/actions
- in services or test helpers

```ts
import { createQuery, createMutation } from "@ic-reactor/react"
import { backendReactor } from "./reactor"

export const getProfile = createQuery(backendReactor, {
  functionName: "get_profile",
})

export const updateProfile = createMutation(backendReactor, {
  functionName: "update_profile",
  invalidateQueries: [getProfile.getQueryKey()],
})
```

Inside React:

```tsx
const { data } = getProfile.useQuery()
const { mutateAsync } = updateProfile.useMutation({
  onSettled: () => toast.success("Profile updated!"),
})
```

Outside React:

```ts
await getProfile.fetch()
const cached = getProfile.getCacheData()
await updateProfile.execute([{ name: "Alice" }])
```

Important: Do not call React hooks (`useActorQuery`, `.useQuery()`, `.useMutation()`) outside React components or custom hooks.

### Pattern C: `DisplayReactor` for UI-friendly values

Use `DisplayReactor` when you want transformed values for UI/forms (for example, `bigint` and `Principal` represented as strings).

```ts
import { DisplayReactor } from "@ic-reactor/react"
```

## Code Generation (CLI and Vite Plugin)

For larger canisters or frequent `.did` changes, prefer generated hooks.

### Vite plugin (recommended for Vite apps)

```ts
// vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    react(),
    icReactor({
      canisters: [{ name: "backend", didFile: "./backend/backend.did" }],
    }),
  ],
})
```

### CLI (explicit generation / non-Vite)

```bash
npx @ic-reactor/cli init
npx @ic-reactor/cli generate
```

Each generated canister directory contains `declarations/`, a managed
`index.generated.ts`, and a stable `index.ts` wrapper. The generated file exports
the reactor plus typed React hooks:

- `use<Canister>Query`, `use<Canister>SuspenseQuery`, `use<Canister>InfiniteQuery`,
  `use<Canister>SuspenseInfiniteQuery`, `use<Canister>Mutation`, `use<Canister>Method`

Set `factories: true` on a canister (with `target: "react"`, the default) to
also generate `index.factories.generated.ts`: a `<method>Query` per query
method (`createQuery`, or `createQueryFactory` when it takes arguments) and a
`<method>Mutation` (`createMutation`) per update or oneway method, used with
`.useQuery()` / `.useMutation()` in components and `.fetch()` / `.execute()`
outside React. The `index.ts` that codegen creates re-exports it. Without
`factories: true`, call the generated reactor directly outside React
(`.fetchQuery()`, `.callMethod()`, `.invalidateQueries()`).

## Dynamic Candid (Explorers and Dev Tools)

```ts
import { CandidDisplayReactor } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

const clientManager = new ClientManager({ queryClient: new QueryClient() })

const reactor = new CandidDisplayReactor({
  name: "icp-ledger",
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
})

await reactor.initialize()

const balance = await reactor.callMethod({
  functionName: "icrc1_balance_of",
  args: [{ owner: "aaaaa-aa" }],
})

console.log(balance)
```

## Reactor vs Standard Actor (Summary)

| Feature                                   | Standard Actor | IC Reactor                                     |
| ----------------------------------------- | -------------- | ---------------------------------------------- |
| Type-safe method calls                    | ✅             | ✅                                             |
| Query caching                             | ❌             | ✅                                             |
| Background refetching                     | ❌             | ✅                                             |
| Typed `Ok`/`Err` handling                 | ❌ (manual)    | ✅                                             |
| Shared auth/identity + cache coordination | ❌             | ✅ (`ClientManager` + `AuthenticationManager`) |
| Display-friendly transforms               | ❌             | ✅ (`DisplayReactor`)                          |

## Examples

| Example                                                           | Description                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`all-in-one-demo`](./examples/all-in-one-demo)                   | End-to-end demo with queries, mutations, suspense, infinite queries |
| [`tanstack-router`](./examples/tanstack-router)                   | Router loaders/actions + generated hooks                            |
| [`query-demo`](./examples/query-demo)                             | Query and mutation factory patterns                                 |
| [`identity-attributes-demo`](./examples/identity-attributes-demo) | Internet Identity OpenID attribute requests                         |
| [`multiple-canister`](./examples/multiple-canister)               | Shared auth across multiple canisters                               |
| [`ckbtc-wallet`](./examples/ckbtc-wallet)                         | More advanced canister integrations                                 |
| [`codegen-in-action`](./examples/codegen-in-action)               | CLI vs Vite plugin codegen comparison                               |
| [`typescript-demo`](./examples/typescript-demo)                   | Core usage without React                                            |
| [`candid-parser`](./examples/candid-parser)                       | Dynamic Candid parsing                                              |

## Documentation

- Docs site: [ic-reactor.b3pay.net/v3](https://ic-reactor.b3pay.net/v3/) (source: [`./docs`](./docs))
- Changelog: [`CHANGELOG.md`](./CHANGELOG.md)
- Package docs:
  - [`@ic-reactor/react`](./packages/react/README.md)
  - [`@ic-reactor/core`](./packages/core/README.md)
  - [`@ic-reactor/candid`](./packages/candid/README.md)
  - [`@ic-reactor/cli`](./packages/cli/README.md)
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

This repository is intentionally structured to work well with AI coding assistants and agents.

### AI context files

For apps that use IC Reactor (published with the docs, shipped in the npm packages, or installed as a skill):

| File                                                         | Purpose                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [`llms.txt`](./llms.txt)                                     | Index of the docs in the llmstxt.org format, served at `https://ic-reactor.b3pay.net/llms.txt`  |
| [`llms-full.txt`](./llms-full.txt)                           | Complete guide with setup choices, snippets and anti-patterns, served at `/llms-full.txt`       |
| `packages/*/llms.txt`                                        | Each package's own guide, shipped in its tarball: `node_modules/@ic-reactor/<package>/llms.txt` |
| [`CHANGELOG.md`](./CHANGELOG.md)                             | Per-package changes with migration hints                                                        |
| [`skill-packages/ic-reactor/`](./skill-packages/ic-reactor/) | Agent skill and Claude Code plugin; install below                                               |

For agents working in this repository:

| File                                                                   | Purpose                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`AGENTS.md`](./AGENTS.md)                                             | Task-to-source routing, verification by change type, AI context file rules |
| [`CLAUDE.md`](./CLAUDE.md)                                             | Claude / Anthropic project context                                         |
| [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) | GitHub Copilot instructions                                                |
| [`.cursorrules`](./.cursorrules)                                       | Cursor IDE rules                                                           |
| [`skill-packages/`](./skill-packages/)                                 | Contributor skills (`ic-reactor-hooks`, `ic-reactor-packages`)             |

### Agent skill: `ic-reactor`

[`skill-packages/ic-reactor/`](./skill-packages/ic-reactor/) is an
[Agent Skill](https://agentskills.io) for apps that use IC Reactor: setup
choices, queries and mutations, cache invalidation, server rendering, sign-in,
errors, token amounts, testing and the mistakes to avoid, with type-checked
examples. It sends the agent to the installed packages' `llms.txt` first, so
it follows the app's version.

In Claude Code, this repository is a plugin marketplace:

```text
/plugin marketplace add B3Pay/ic-reactor
/plugin install ic-reactor@ic-reactor
```

For Codex, Cursor, GitHub Copilot, Gemini CLI and other agents, install it
with the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add B3Pay/ic-reactor --skill ic-reactor
```

Then ask for it by name, or let the agent pick it up:

```text
Use the ic-reactor skill to add a transfer form for my ledger canister, with the balance refreshed after each transfer.
```

The `ic-reactor-hooks` and `ic-reactor-packages` skills in `skill-packages/`
are for agents working on this repository.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development workflow, formatting, release notes, and AI-assisted contribution guidance.

Please also review the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)

---

<div align="center">
  Built for the <a href="https://internetcomputer.org">Internet Computer</a>
</div>
