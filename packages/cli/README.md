# @ic-reactor/cli

> 🔧 Generate shadcn-style React hooks for ICP canisters

The `@ic-reactor/cli` generates **customizable, user-owned** React hooks for interacting with Internet Computer canisters. Unlike build-time code generation, you get full control over the generated code.

## Philosophy

Like [shadcn/ui](https://ui.shadcn.com/), this CLI generates code **into your project** rather than hiding it in `node_modules`. This means:

- ✅ **Full control** - Customize hooks to your needs
- ✅ **No magic** - See exactly what's happening
- ✅ **Version controlled** - Hooks are part of your codebase
- ✅ **Framework agnostic** - Works with any React setup

## Installation

```bash
npm install -D @ic-reactor/cli
# or
pnpm add -D @ic-reactor/cli
```

## Quick Start

### 1. Initialize your project

```bash
npx @ic-reactor/cli init
```

This creates:

- `reactor.config.json` - Configuration file
- `src/lib/client.ts` - Client manager (optional)
- `src/canisters/` - Output directory for hooks

### 2. Add hooks for a canister

```bash
npx @ic-reactor/cli add
```

Interactive prompts will guide you through:

1. Selecting a canister
2. Choosing methods to generate hooks for
3. Selecting hook types (Query, Suspense Query, Infinite Query, Mutation)

### 3. Use the hooks

```tsx
import { useGetMessageQuery, getMessageQuery } from "./canisters/backend/hooks"

function MyComponent() {
  // Use the React hook
  const { data, isLoading } = useGetMessageQuery()

  // Or fetch directly (for loaders, etc.)
  await getMessageQuery.fetch()

  // Invalidate cache
  await getMessageQuery.invalidate()
}
```

## Commands

### `init`

Initialize ic-reactor in your project.

```bash
npx @ic-reactor/cli init [options]

Options:
  -y, --yes              Skip prompts and use defaults
  -o, --out-dir <path>   Output directory for generated hooks
```

### `add`

Add hooks for canister methods.

```bash
npx @ic-reactor/cli add [options]

Options:
  -c, --canister <name>      Canister to add hooks for
  -m, --methods <methods...> Specific methods to generate
  -a, --all                  Add hooks for all methods
```

### `list`

List available methods from a canister.

```bash
npx @ic-reactor/cli list [options]

Options:
  -c, --canister <name>   Canister to list methods from
```

### `sync`

Regenerate hooks after DID file changes.

```bash
npx @ic-reactor/cli sync [options]

Options:
  -c, --canister <name>   Canister to sync (default: all)
```

## Configuration

### reactor.config.json

```json
{
  "$schema": "https://raw.githubusercontent.com/B3Pay/ic-reactor/main/packages/cli/schema.json",
  "outDir": "src/canisters",
  "canisters": {
    "backend": {
      "didFile": "./backend.did",
      "clientManagerPath": "../../lib/client",
      "useDisplayReactor": true
    }
  },
  "generatedHooks": {
    "backend": ["get_message", "set_message"]
  }
}
```

### Configuration Options

| Option                               | Description                               |
| ------------------------------------ | ----------------------------------------- |
| `outDir`                             | Directory where hooks are generated       |
| `canisters`                          | Canister configurations                   |
| `canisters.<name>.didFile`           | Path to the `.did` file                   |
| `canisters.<name>.clientManagerPath` | Import path to client manager             |
| `canisters.<name>.useDisplayReactor` | Use DisplayReactor for type transforms    |
| `generatedHooks`                     | Tracks which methods have hooks generated |

## Generated File Structure

```
src/canisters/
├── backend/
│   ├── reactor.ts              # Shared reactor instance
│   └── hooks/
│       ├── index.ts            # Barrel exports
│       ├── getMessageQuery.ts  # Query hook
│       ├── setMessageMutation.ts # Mutation hook
│       └── getPostsInfiniteQuery.ts # Infinite query
```

## Hook Types

### Query (methods without side effects)

```typescript
// For methods WITH arguments - factory pattern
export const getUserQuery = createQueryFactory(reactor, {
  functionName: "get_user",
})

// Usage
const query = getUserQuery([userId])
const { data } = query.useQuery()

// For methods WITHOUT arguments - static instance
export const getConfigQuery = createQuery(reactor, {
  functionName: "get_config",
})

// Usage
const { data } = getConfigQuery.useQuery()
await getConfigQuery.fetch()
```

### Mutation (methods with side effects)

```typescript
export const setMessageMutation = createMutation(reactor, {
  functionName: "set_message",
  invalidateQueries: [getMessageQuery.getQueryKey()],
})

// Usage
const { mutate, isPending } = setMessageMutation.useMutation()
mutate(["Hello, ICP!"])
```

### Infinite Query (paginated data)

```typescript
export const getPostsInfiniteQuery = createInfiniteQuery(reactor, {
  functionName: "get_posts",
  initialPageParam: 0,
  getArgs: (cursor) => [{ cursor, limit: 10 }],
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
})

// Usage
const { data, fetchNextPage, hasNextPage } =
  getPostsInfiniteQuery.useInfiniteQuery()
const allPosts = data?.pages.flatMap((page) => page.items) ?? []
```

## Customization

Since the code is generated into your project, you can:

1. **Modify hook options** - Change staleTime, select transforms, etc.
2. **Add custom logic** - Error handling, optimistic updates
3. **Combine hooks** - Create composite hooks
4. **Type overrides** - Adjust TypeScript types

Example customization:

```typescript
// getMessageQuery.ts (generated, then customized)
export const getMessageQuery = createQuery(reactor, {
  functionName: "get_message",
  staleTime: 30 * 1000, // Custom: 30 seconds
  select: (data) => data.message.toUpperCase(), // Custom transform
})
```

## Requirements

- Node.js 18+
- @ic-reactor/react 3.x
- React 18+

## License

MIT
