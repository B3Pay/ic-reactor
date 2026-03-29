# IC Reactor Hook Patterns (Repo Reference)

Load this file when you need concrete examples, exact return methods, or repo file pointers.

## Pattern Matrix

| API                         | Inside React          | Outside React                                  | Notes                                                       |
| --------------------------- | --------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `createActorHooks(reactor)` | Yes                   | No                                             | Returns generic hooks that accept `functionName` and `args` |
| `createQuery(...)`          | `.useQuery()`         | `.fetch()`, `.invalidate()`, `.getCacheData()` | Best shared read pattern                                    |
| `createSuspenseQuery(...)`  | `.useSuspenseQuery()` | `.fetch()`, `.invalidate()`, `.getCacheData()` | Suspense-only component usage                               |
| `createInfiniteQuery(...)`  | `.useInfiniteQuery()` | `.fetch()`, `.invalidate()`, `.getCacheData()` | Uses `getArgs(pageParam)`                                   |
| `createMutation(...)`       | `.useMutation()`      | `.execute(args)`                               | Supports `onCanisterError` and invalidation                 |
| `useActorMethod(...)`       | Yes                   | No                                             | Unified query/update hook                                   |
| `reactor.callMethod(...)`   | Indirectly            | Yes                                            | Lowest-level imperative call                                |

## Returned Methods (Important)

### `createActorHooks(reactor)`

Returns:

- `useActorQuery`
- `useActorSuspenseQuery`
- `useActorInfiniteQuery`
- `useActorSuspenseInfiniteQuery`
- `useActorMutation`
- `useActorMethod`

Source: `packages/react/src/createActorHooks.ts`

### `createQuery(...)`

Returns an object with:

- `.useQuery(options?)`
- `.fetch()`
- `.invalidate()`
- `.getQueryKey()`
- `.getCacheData(select?)`

Source: `packages/react/src/createQuery.ts`

### `createSuspenseQuery(...)`

Returns an object with:

- `.useSuspenseQuery(options?)`
- `.fetch()`
- `.invalidate()`
- `.getQueryKey()`
- `.getCacheData(select?)`

Source: `packages/react/src/createSuspenseQuery.ts`

### `createInfiniteQuery(...)`

Returns an object with:

- `.useInfiniteQuery(options?)`
- `.fetch()`
- `.invalidate()`
- `.getQueryKey()`
- `.getCacheData(select?)`

Source: `packages/react/src/createInfiniteQuery.ts`

### `createMutation(...)`

Returns an object with:

- `.useMutation(options?)`
- `.execute(args)`

Source: `packages/react/src/createMutation.ts`

## Inside React: Recommended Patterns

### A. Generic hooks from `createActorHooks`

Use for component-focused code when method names vary:

```tsx
const { useActorQuery, useActorMutation } = createActorHooks(backendReactor)

function Profile({ userId }: { userId: string }) {
  const user = useActorQuery({
    functionName: "get_user",
    args: [userId],
  })

  const save = useActorMutation({
    functionName: "update_user",
  })

  if (user.isPending) return <div>Loading...</div>

  return (
    <button onClick={() => save.mutate([{ id: userId, name: "Alice" }])}>
      Save
    </button>
  )
}
```

### B. Factory objects reused across components

Define once at module scope (repo example: `examples/all-in-one-demo/src/lib/factories.ts`):

```ts
export const getLikes = createQuery(backendReactor, {
  functionName: "get_likes",
  refetchInterval: 3000,
})

export const likeHeart = createMutation(backendReactor, {
  functionName: "like",
})
```

Use in components/custom hooks:

```tsx
const { data: likes = [] } = getLikes.useQuery()
const { mutateAsync } = likeHeart.useMutation({
  onSettled: () => getLikes.invalidate(),
})
```

### C. `useActorMethod` for unified imperative behavior

Use when one component needs a `call()` API and should not care if the method is query or update:

```tsx
const method = useActorMethod({
  reactor: backendReactor,
  functionName: "get_user",
  args: ["user-1"],
})

await method.call()
```

Source: `packages/react/src/hooks/useActorMethod.ts`

## Outside React: Correct Patterns

### A. Prefetch/read in loaders or actions

Use query factory objects:

```ts
const userQuery = createQuery(backendReactor, {
  functionName: "get_user",
  args: ["user-1"],
})

await userQuery.fetch()
const cached = userQuery.getCacheData()
```

This pattern is used by generated hook files in `examples/tanstack-router/src/canisters/ledger/hooks/`.

### B. Imperative mutation execution

Use `.execute(args)`:

```ts
const transfer = createMutation(ledgerReactor, {
  functionName: "icrc1_transfer",
})

const result = await transfer.execute([transferArg])
```

Generated example file:

- `examples/tanstack-router/src/canisters/ledger/hooks/icrc1TransferMutation.ts`

### C. Advanced reactor-level control

Use direct reactor methods when factory wrappers are too narrow:

```ts
await backendReactor.fetchQuery({
  functionName: "get_user",
  args: ["user-1"],
})

const cached = backendReactor.getQueryData({
  functionName: "get_user",
  args: ["user-1"],
})

await backendReactor.invalidateQueries({
  functionName: "get_user",
})

await backendReactor.callMethod({
  functionName: "update_user",
  args: [{ name: "Alice" }],
})
```

Reference: `packages/react/README.md`

## Efficient Hook Creation Strategy

### Prefer generated hooks when:

- the project has multiple canisters or many methods
- `.did` files change often
- you want consistent typed exports and less hand-written boilerplate

Use:

- `@ic-reactor/vite-plugin` for Vite dev workflows (watch + regenerate)
- `@ic-reactor/cli` for explicit generation and non-Vite projects

References:

- `packages/vite-plugin/README.md`
- `packages/cli/README.md`
- `packages/codegen/src/generators/reactor.ts`

### Prefer manual factories when:

- you need app-specific naming and composition
- you want one object usable both in components and outside React
- you want custom invalidation/select logic per operation

## Common Mistakes To Prevent

- Calling React hooks outside React. Use `.fetch()` or `.execute()` instead.
- Recreating factory instances inside components. Define them at module scope.
- Hardcoding invalidation keys manually. Prefer `query.getQueryKey()`.
- Editing generated hook files directly. Regeneration will overwrite them.
- Mixing `DisplayReactor` and `Reactor` expectations. Confirm transformed return and arg types first.

## Useful Repo Files

- `packages/react/src/createActorHooks.ts`
- `packages/react/src/createQuery.ts`
- `packages/react/src/createSuspenseQuery.ts`
- `packages/react/src/createInfiniteQuery.ts`
- `packages/react/src/createMutation.ts`
- `packages/react/src/hooks/useActorMethod.ts`
- `examples/all-in-one-demo/src/lib/factories.ts`
- `examples/all-in-one-demo/src/lib/useHeart.ts`
- `examples/tanstack-router/src/canisters/ledger/hooks/icrc1NameQuery.ts`
- `examples/tanstack-router/src/canisters/ledger/hooks/icrc1TransferMutation.ts`
