# IC Reactor

<div align="center">
  <img src="docs/src/assets/icon.svg" alt="IC Reactor Logo" width="240" />
  <br><br>
  <strong>The modern, type-safe library for building Internet Computer applications</strong>
  <br><br>
  
  [![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
</div>

---

IC Reactor provides seamless integration between your applications and Internet Computer canisters with **full TypeScript support**, **intelligent caching** powered by TanStack Query, and **first-class React integration**.

## ✨ Features

- 🔒 **End-to-End Type Safety** - From Candid to your components
- ⚡ **TanStack Query Integration** - Automatic caching, background refetching, optimistic updates
- 🔄 **Auto Transformations** - BigInt to string, Principal to text, and more with DisplayReactor
- ⚛️ **React Ready** - `useActorQuery`, `useActorInfiniteQuery`, `useActorMutation` and more
- 📦 **Result Unwrapping** - Automatic `Ok`/`Err` handling from Candid Result types
- 🏗️ **Multi-Actor Support** - Manage multiple canisters with shared authentication
- 🔐 **Internet Identity** - Seamless authentication integration
- 🔍 **Dynamic Candid** - Runtime Candid parsing for building explorers and dev tools

## 📦 Packages

| Package                                             | Description                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`@ic-reactor/core`](./packages/core)               | Core library with ClientManager, Reactor, DisplayReactor, and query caching      |
| [`@ic-reactor/react`](./packages/react)             | React hooks for seamless integration (`useActorQuery`, `useActorMutation`, etc.) |
| [`@ic-reactor/candid`](./packages/candid)           | Dynamic Candid fetching, parsing, and `CandidReactor` / `CandidDisplayReactor`   |
| [`@ic-reactor/parser`](./packages/parser)           | Local WASM-based Candid parser (offline, fast compilation)                       |
| [`@ic-reactor/codegen`](./packages/codegen)         | Shared code generation utilities for IC Reactor                                  |
| [`@ic-reactor/cli`](./packages/cli)                 | CLI tool to generate shadcn-style React hooks (`npx @ic-reactor/cli`)            |
| [`@ic-reactor/vite-plugin`](./packages/vite-plugin) | Vite plugin for zero-config, automatic hook generation                           |

## 🔧 CLI & Tools

### Vite Plugin (`@ic-reactor/vite-plugin`)

The recommended way for Vite projects. Automatic, zero-config code generation that reacts to `.did` file changes instantly.

```typescript
// vite.config.ts
import { icReactorPlugin } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactorPlugin({
      canisters: [{ name: "backend", didFile: "./backend.did" }],
    }),
  ],
})
```

### CLI (`@ic-reactor/cli`)

Generate declarations and reactors manually for other frameworks or custom setups.

```bash
# Initialize configuration
npx @ic-reactor/cli init

# Regenerate declarations and reactors
npx @ic-reactor/cli sync
```

## 🚀 Quick Start

### Installation

```bash
# For React apps
pnpm add @ic-reactor/react @icp-sdk/core @tanstack/react-query

# For non-React apps
pnpm add @ic-reactor/core @icp-sdk/core @tanstack/query-core

# For dynamic Candid (optional)
pnpm add @ic-reactor/candid @ic-reactor/parser

# For Internet Identity authentication (optional)
pnpm add @icp-sdk/auth
```

### Basic Usage

```typescript
import { ClientManager, Reactor, createActorHooks, createAuthHooks } from '@ic-reactor/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { idlFactory, type _SERVICE } from './declarations/my_canister';

// 1. Setup ClientManager (handles Identity and Agent)
const queryClient = new QueryClient();
const clientManager = new ClientManager({ queryClient, withProcessEnv: true });

// 2. Setup Reactor (handles Canister interaction)
const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId: 'rrkah-fqaaa-aaaaa-aaaaq-cai',
});

// 3. Create Hooks
const { useActorQuery, useActorMutation } = createActorHooks(backend);
const { useAuth, useUserPrincipal } = createAuthHooks(clientManager);

// 4. Use in components
function LoginButton() {
  const { login, logout, isAuthenticated, principal } = useAuth();

  return isAuthenticated ? (
    <button onClick={() => logout()}>Logout {principal?.toText()}</button>
  ) : (
    <button onClick={() => login()}>Login with Internet Identity</button>
  );
}

function Greeting() {
  const { data, isPending, error } = useActorQuery({
    functionName: 'greet',
    args: ['World'],
  });

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <h1>{data}</h1>;
}
```

### Dynamic Candid (for Explorers & Dev Tools)

```typescript
import { CandidDisplayReactor } from "@ic-reactor/candid"
import { ClientManager } from "@ic-reactor/core"

const clientManager = new ClientManager()

// Create a reactor for ANY canister - no pre-generated types needed!
const reactor = new CandidDisplayReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai", // ICP Ledger
  clientManager,
})

// Initialize from network (fetches Candid automatically)
await reactor.initialize()

// Call methods with display-friendly types (bigint → string)
const balance = await reactor.callMethod({
  functionName: "icrc1_balance_of",
  args: [{ owner: "aaaaa-aa" }], // Principal as string!
})

console.log(balance) // "1000000" (string, ready for UI display)
```

## 🎯 Why Reactor Instead of Actor?

| Feature                 | Standard Actor | Reactor               |
| ----------------------- | -------------- | --------------------- |
| Type-safe method calls  | ✅             | ✅                    |
| Query caching           | ❌             | ✅ Built-in           |
| Automatic refetching    | ❌             | ✅ Background updates |
| Result unwrapping       | ❌ Manual      | ✅ Automatic          |
| Error typing            | ❌ Generic     | ✅ `CanisterError<E>` |
| Identity sharing        | ❌ Per-actor   | ✅ Via ClientManager  |
| Display transformations | ❌             | ✅ DisplayReactor     |

## 🏃 Examples

| Example                                           | Description                                            |
| ------------------------------------------------- | ------------------------------------------------------ |
| [Candid Parser](./examples/candid-parser)         | Dynamic canister calls with runtime Candid parsing     |
| [TanStack Router](./examples/tanstack-router)     | Full app with routing and authentication               |
| [Codec Demo](./examples/codec-demo)               | Type transformation demonstrations                     |
| [TypeScript Demo](./examples/typescript-demo)     | Pure TypeScript usage (no React)                       |
| [Codegen in Action](./examples/codegen-in-action) | Compare shared codegen output from CLI and Vite plugin |

### Run Documentation Locally

```bash
cd docs
pnpm install
pnpm dev
```

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run E2E tests
pnpm test-e2e
```

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to submit PRs, run the project locally, and formatting rules. Please also review our [Code of Conduct](./CODE_OF_CONDUCT.md).

## 🤖 AI/LLM Integration

This project is AI-friendly with:

- **`/llms.txt`** in documentation for structured API overview
- Clear, scannable documentation structure
- Complete, copy-pasteable code examples
- Semantic HTML and heading hierarchy

## 📄 License

MIT © [Behrad Deylami](https://github.com/b3hr4d)

---

<div align="center">
  Built for the <a href="https://internetcomputer.org">Internet Computer</a> 🌐
</div>
