# Query Demo

This example demonstrates the current factory APIs from `@ic-reactor/react`:

- `createSuspenseQuery` for static method wrappers
- `createSuspenseQueryFactory` for runtime args
- `createMutation` for updates and targeted invalidation
- `createAuthHooks` for Internet Identity login state

It talks to the live ICP, ckBTC, and ckETH ledgers through `DisplayReactor`
instances, so the example focuses on reusable query and mutation composition
instead of local canister setup.

## Run It

```bash
cd examples/query-demo
pnpm install
pnpm dev
```

## Key Files

- `src/reactor.ts` creates the shared `ClientManager`, `DisplayReactor`
  instances, query factories, and mutation factories
- `src/App.tsx` shows how to consume those factories inside React components

## Patterns Shown

### Static suspense query

```ts
import { createSuspenseQuery } from "@ic-reactor/react"

export const icpNameQuery = createSuspenseQuery(icpReactor, {
  functionName: "icrc1_name",
})
```

### Dynamic suspense query factory

```ts
import { createSuspenseQueryFactory } from "@ic-reactor/react"

export const getIcpBalance = createSuspenseQueryFactory(icpReactor, {
  functionName: "icrc1_balance_of",
  select: (balance) => formatBalance(balance, "ICP"),
})
```

### Mutation with invalidation

```ts
import { createMutation } from "@ic-reactor/react"

export const icpTransferMutation = createMutation(icpReactor, {
  functionName: "icrc1_transfer",
})
```

```tsx
const balanceQuery = getIcpBalance([account])
const transfer = icpTransferMutation.useMutation({
  invalidateQueries: [balanceQuery.getQueryKey()],
})
```

## Why This Example Matters

- shows the recommended factory naming used in the current package exports
- keeps reusable query objects outside components
- demonstrates `DisplayReactor` for UI-friendly string values
- works well as a reference for loader or service patterns because the same
  factories also expose `.fetch()` and `.execute()`
