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
> DX3. Until the rewrite of `@ic-reactor/core` and `@ic-reactor/react` lands,
> the usage below is the 3.x API these packages still carry. The released 3.x
> line lives on `main` (security fixes only until 4.0 GA) and is documented at
> [ic-reactor.b3pay.net/v3](https://ic-reactor.b3pay.net/v3/).

IC Reactor is a monorepo of libraries for building Internet Computer (ICP) apps with:

- end-to-end TypeScript types
- TanStack Query-powered caching and refetching
- React hook factories (`useActorQuery`, `useActorMutation`, etc.)
- display-friendly transforms (`DisplayReactor`)

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
| [`@ic-reactor/vite-plugin`](./packages/vite-plugin) | Local `ic_env` cookie and `/api` proxy for `vite dev`                          |

`@ic-reactor/parser`, `@ic-reactor/codegen` and `@ic-reactor/cli` are not part
of ic-reactor 4: `candid-core-cli gen` generates the canister module instead.
`@ic-reactor/candid` stays at 3.x, published from `main`. None of the four is
in this branch's tree.

What changed, per package, is in [`CHANGELOG.md`](./CHANGELOG.md).

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
  const { login, logout, isAuthenticated, isAuthenticating, principal } =
    useAuth()

  // True until the stored session has been restored: without this check a
  // reload shows "Login" to a user who is signed in
  if (isAuthenticating) return <button disabled>Checking session…</button>
  return isAuthenticated ? (
    <button onClick={() => void logout()}>
      Logout {principal?.toText().slice(0, 8)}...
    </button>
  ) : (
    <button onClick={() => void login()}>Login</button>
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
  invalidateQueries: [getProfile],
})
```

Inside React:

```tsx
function ProfileEditor() {
  const { data } = getProfile.useQuery()
  const { mutateAsync } = updateProfile.useMutation({
    onSuccess: () => toast.success("Profile updated!"),
  })
  // ...
}
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
