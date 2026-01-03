# IC Reactor

<div align="center">
  <img src="docs/src/assets/logo-dark.svg" alt="IC Reactor Logo" width="120" />
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
- ⚛️ **React Ready** - `useActorQuery` and `useActorMutation` hooks
- 📦 **Result Unwrapping** - Automatic `Ok`/`Err` handling from Candid Result types
- 🏗️ **Multi-Actor Support** - Manage multiple canisters with shared authentication
- 🔐 **Internet Identity** - Seamless authentication integration

## 📦 Packages

| Package                                 | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| [`@ic-reactor/core`](./packages/core)   | Core library with ClientManager, Reactor, and query caching |
| [`@ic-reactor/react`](./packages/react) | React hooks for seamless integration (re-exports core)      |

## 🚀 Quick Start

### Installation

```bash
# For React apps (includes core)
pnpm add @ic-reactor/react @icp-sdk/core @tanstack/react-query

# For non-React apps
pnpm add @ic-reactor/core @icp-sdk/core @tanstack/query-core

# Optional: Internet Identity authentication
pnpm add @icp-sdk/auth
```

### Basic Usage

```typescript
import { ClientManager, Reactor } from '@ic-reactor/react';
import { createActorHooks } from '@ic-reactor/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { idlFactory, type _SERVICE } from './declarations/my_canister';

// Setup
const queryClient = new QueryClient();
const clientManager = new ClientManager({ queryClient, withProcessEnv: true });

const backend = new Reactor<_SERVICE>({
  clientManager,
  idlFactory,
  canisterId: 'rrkah-fqaaa-aaaaa-aaaaq-cai',
});

// Create hooks
const { useActorQuery, useActorMutation } = createActorHooks(backend);

// Wrap your app
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Greeting />
    </QueryClientProvider>
  );
}

// Use in components
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

## 🎯 Why Reactor Instead of Actor?

| Feature                | Standard Actor | Reactor               |
| ---------------------- | -------------- | --------------------- |
| Type-safe method calls | ✅             | ✅                    |
| Query caching          | ❌             | ✅ Built-in           |
| Automatic refetching   | ❌             | ✅ Background updates |
| Result unwrapping      | ❌ Manual      | ✅ Automatic          |
| Error typing           | ❌ Generic     | ✅ `CanisterError<E>` |
| Identity sharing       | ❌ Per-actor   | ✅ Via ClientManager  |

## 📚 Documentation

Visit the [documentation site](./docs) for complete guides:

- [Getting Started](./docs/src/content/docs/quick-start.mdx)
- [Queries Guide](./docs/src/content/docs/guides/queries.mdx)
- [Mutations Guide](./docs/src/content/docs/guides/mutations.mdx)
- [Error Handling](./docs/src/content/docs/error-handling.mdx)
- [Type Safety](./docs/src/content/docs/type-safety.mdx)
- [Examples](./examples/)

### Run Documentation Locally

```bash
cd docs
pnpm install
pnpm dev
```

## 🏃 Examples

| Example                                       | Description                              |
| --------------------------------------------- | ---------------------------------------- |
| [TanStack Router](./examples/tanstack-router) | Full app with routing and authentication |
| [Codec Demo](./examples/codec-demo)           | Type transformation demonstrations       |
| [TypeScript Demo](./examples/typescript-demo) | Pure TypeScript usage                    |

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
