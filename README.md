# IC Reactor

<div align="center">
  <img src="docs/src/assets/icon.svg" alt="IC Reactor Logo" width="240" />
  <br><br>
  <strong>Type-safe Internet Computer integration for TypeScript and React</strong>
  <br><br>

[![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

</div>

---

IC Reactor v4 is a monorepo of libraries for building Internet Computer (ICP) apps with:

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
- shared auth/agent management via `ClientManager`
- reusable query/mutation objects that work both inside and outside React

## Package Overview

| Package                                             | Purpose                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`@ic-reactor/core`](./packages/core)               | Core runtime (`ClientManager`, `Reactor`, `DisplayReactor`, cache integration)     |
| [`@ic-reactor/react`](./packages/react)             | React hooks, query/mutation factories, Internet Identity auth, identity attributes |
| [`@ic-reactor/candid`](./packages/candid)           | Dynamic Candid adapter, reactors, display reactors, and metadata reactors          |
| [`@ic-reactor/parser`](./packages/parser)           | Local Candid parser (WASM-based)                                                   |
| [`@ic-reactor/codegen`](./packages/codegen)         | Shared codegen pipeline used by CLI and Vite plugin                                |
| [`@ic-reactor/cli`](./packages/cli)                 | Generate declarations + typed hooks/reactors                                       |
| [`@ic-reactor/vite-plugin`](./packages/vite-plugin) | Vite plugin for watch-mode hook generation                                         |

Release posture:

- This branch is the next major release line and should be presented as **IC Reactor v4**.
- Package manifests still show the pre-release versions until release automation performs the final version bump.
- Current manifest lanes are runtime `3.6.0`, code generation tooling `0.11.1`, and parser `0.4.6`.

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
# Internet Identity auth helpers for React apps
pnpm add @ic-reactor/react @icp-sdk/auth @icp-sdk/core

# Dynamic Candid support (explorers/dev tools)
pnpm add @ic-reactor/candid @ic-reactor/parser
```

## Quick Start (React)

### 1. Define a reactor and bound hooks

For most React apps, `defineReactor` is the smallest setup path. It creates the
`QueryClient`, `ClientManager`, reactor, and bound hooks in one call.

```ts
// src/reactor.ts
import { defineReactor, AuthenticationManager } from "@ic-reactor/react"
import { idlFactory, type _SERVICE } from "./declarations/my_canister"

export const {
  reactor: backendReactor,
  queryClient,
  clientManager,
  useActorQuery,
  useActorMutation,
  useActorSuspenseQuery,
  useActorInfiniteQuery,
  useActorMethod,
} = defineReactor<_SERVICE>({
  name: "backend",
  idlFactory,
  canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
  display: true,
})

export const authentication = new AuthenticationManager({ clientManager })
```

### 2. Create auth hooks

```ts
// src/hooks.ts
import { createAuthHooks } from "@ic-reactor/react"
import { authentication } from "./reactor"

export const { useAuth, useUserPrincipal, useAgentState } =
  createAuthHooks(authentication)
```

### 3. Use in React components

```tsx
// src/App.tsx
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient, useActorQuery, useActorMutation } from "./reactor"
import { useAuth } from "./hooks"

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
    <button
      disabled={isPending}
      onClick={() => mutate([{ name: "Alice", bio: "Hello IC" }])}
    >
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

Generated query/mutation files typically expose both:

- React methods (`.useQuery()`, `.useMutation()`)
- imperative methods (`.fetch()`, `.execute()`, `.invalidate()`)

## Dynamic Candid (Explorers and Dev Tools)

```ts
import { CandidDisplayReactor } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"

const clientManager = new ClientManager()

const reactor = new CandidDisplayReactor({
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

| Feature                                   | Standard Actor | IC Reactor            |
| ----------------------------------------- | -------------- | --------------------- |
| Type-safe method calls                    | ✅             | ✅                    |
| Query caching                             | ❌             | ✅                    |
| Background refetching                     | ❌             | ✅                    |
| Typed `Ok`/`Err` handling                 | ❌ (manual)    | ✅                    |
| Shared auth/identity + cache coordination | ❌             | ✅ (`ClientManager`)  |
| Display-friendly transforms               | ❌             | ✅ (`DisplayReactor`) |

## Examples

| Example                                                                               | Description                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`all-in-one-demo`](./examples/all-in-one-demo)                                       | End-to-end demo with queries, mutations, suspense, infinite queries |
| [`candid-parser`](./examples/candid-parser)                                           | Dynamic Candid parsing                                              |
| [`ckbtc-wallet`](./examples/ckbtc-wallet)                                             | More advanced canister integrations                                 |
| [`codec-demo`](./examples/codec-demo)                                                 | Display codec transforms                                            |
| [`codegen-in-action`](./examples/codegen-in-action)                                   | CLI vs Vite plugin codegen comparison                               |
| [`custom-provider`](./examples/custom-provider)                                       | Custom authentication provider                                      |
| [`icp-reactor-demo`](./examples/icp-reactor-demo)                                     | ICP SDK canister-env integration                                    |
| [`identity-attributes-demo`](./examples/identity-attributes-demo)                     | Internet Identity OpenID attribute requests                         |
| [`metadata-reactor-capabilities-demo`](./examples/metadata-reactor-capabilities-demo) | Metadata reactor capabilities                                       |
| [`metadata-reactor-demo`](./examples/metadata-reactor-demo)                           | Metadata reactor usage                                              |
| [`multiple-canister`](./examples/multiple-canister)                                   | Shared auth across multiple canisters                               |
| [`nextjs`](./examples/nextjs)                                                         | Next.js integration                                                 |
| [`nextjs-app-router`](./examples/nextjs-app-router)                                   | Next.js App Router integration                                      |
| [`query-demo`](./examples/query-demo)                                                 | Query and mutation factory patterns                                 |
| [`result-types-demo`](./examples/result-types-demo)                                   | Typed `Ok`/`Err` result handling                                    |
| [`suspense-infinite-query-demo`](./examples/suspense-infinite-query-demo)             | Suspense and infinite query patterns                                |
| [`tanstack-form-demo`](./examples/tanstack-form-demo)                                 | TanStack Form integration                                           |
| [`tanstack-router`](./examples/tanstack-router)                                       | Router loaders/actions + generated hooks                            |
| [`typescript-demo`](./examples/typescript-demo)                                       | Core usage without React                                            |
| [`vite-environment-variables`](./examples/vite-environment-variables)                 | Vite canister environment variables                                 |
| [`vite-plugin-demo`](./examples/vite-plugin-demo)                                     | Vite plugin code generation                                         |

## Documentation

- Docs site source: [`./docs`](./docs)
- Package docs:
  - [`@ic-reactor/react`](./packages/react/README.md)
  - [`@ic-reactor/core`](./packages/core/README.md)
  - [`@ic-reactor/candid`](./packages/candid/README.md)
  - [`@ic-reactor/parser`](./packages/parser/README.md)
  - [`@ic-reactor/codegen`](./packages/codegen/README.md)
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

# Run e2e tests
pnpm test-e2e

# Build docs
pnpm docs:build
```

## AI and Agent Integration

This repository is intentionally structured to work well with AI coding assistants and agents.

### AI context files

| File                                                                   | Purpose                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`llms.txt`](./llms.txt)                                               | Compact package/task routing manifest for LLMs                |
| [`llms-full.txt`](./llms-full.txt)                                     | Longer copy-paste guide with setup patterns and API choices   |
| [`CLAUDE.md`](./CLAUDE.md)                                             | Claude / Anthropic project context                            |
| [`AGENTS.md`](./AGENTS.md)                                             | OpenAI Codex agent instructions                               |
| [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) | GitHub Copilot instructions                                   |
| [`.cursorrules`](./.cursorrules)                                       | Cursor IDE rules                                              |
| [`skill-packages/`](./skill-packages/)                                 | Local skill packages for hooks and package-boundary reasoning |

### Skills

This repo includes two local skills:

- [`ic-reactor-hooks`](./skill-packages/ic-reactor-hooks/) for React hook factories, generated hooks, cache invalidation, and inside-vs-outside React usage.
- [`ic-reactor-packages`](./skill-packages/ic-reactor-packages/) for package ownership, generated-file boundaries, exports, and verification workflow.

The `ic-reactor-hooks` skill is also available externally:

- **In-repo**: [`skill-packages/ic-reactor-hooks/`](./skill-packages/ic-reactor-hooks/) — used by agents working directly in this repository
- **External**: [`B3Pay/ic-reactor-skills`](https://github.com/B3Pay/ic-reactor-skills) — standalone installable skill for use in any ICP project

The in-repo skill is the source of truth for this repository and includes multi-agent metadata for OpenAI Codex, Claude, and GitHub Copilot.

Use it when asking an agent to:

- create/refactor `createActorHooks(...)` integrations
- build reusable `createQuery` / `createMutation` modules
- explain inside-React vs outside-React usage (`fetch`, `execute`, `invalidate`)
- choose between manual hooks and generated hooks (CLI / Vite plugin)

Use `ic-reactor-packages` when asking an agent to:

- decide which package owns a behavior
- update exports, package metadata, or docs consistently
- avoid editing generated output by hand
- choose focused verification commands for a package-level change

Example prompt:

```text
Use $ic-reactor-hooks to create a reusable query/mutation factory pair for my canister and show usage both inside a React component and in a route loader.
```

Example install (for external projects):

```bash
npx skills add B3Pay/ic-reactor-skills --full-depth --skill ic-reactor-hooks
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development workflow, formatting, release notes, and AI-assisted contribution guidance.

Please also review the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT © [Behrad Deylami](https://github.com/b3hr4d)

---

<div align="center">
  Built for the <a href="https://internetcomputer.org">Internet Computer</a>
</div>
