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
| `reactor.callMethod(...)`   | Indirectly            | Yes                                            | Lowest-level imperative call — still unwraps `Ok`/`Err`     |

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

Returns an object with exactly:

- `.useQuery(options?)`
- `.fetch()`
- `.prefetch()`
- `.invalidate()`
- `.getQueryKey()`
- `.getCacheData(select?)`
- `.setData(updater)`
- `.cancel()`, `.reset()`, `.optimisticUpdate(updater)` (on this entry only)

There is no `.refetch()`. The config takes `callConfig` (`canisterId`, `agent`,
`effectiveCanisterId`) as `useActorQuery` does, for the call and the key:
`createQuery(ledger, { functionName: "icrc1_symbol", callConfig: { canisterId: ckbtcId } })`.

`createQueryFactory(...)` returns a function of the args that gives this
object, and that also has `.getQueryKey()` (the prefix of every instance) and
`.invalidate()`. It takes `skipToken` in place of args, returning an object
with only `.useQuery()`.

Source: `packages/react/src/createQuery.ts`

### `createSuspenseQuery(...)`

Returns an object with exactly:

- `.useSuspenseQuery(options?)`
- `.fetch()`
- `.prefetch()`
- `.invalidate()`
- `.getQueryKey()`
- `.getCacheData(select?)`
- `.setData(updater)`
- `.cancel()`, `.reset()`, `.optimisticUpdate(updater)`

It also takes `callConfig`. `.reset()` makes a mounted suspense hook suspend
again; use it instead of `queryClient.resetQueries(...)`.

Source: `packages/react/src/createSuspenseQuery.ts`

### `createInfiniteQuery(...)`

Returns an object with exactly:

- `.useInfiniteQuery(options?)`
- `.fetch()`
- `.invalidate()`
- `.getQueryKey()`
- `.getCacheData(select?)`
- `.cancel()`, `.reset()`, `.optimisticUpdate(updater)` (the updater gets and
  returns `InfiniteData { pages, pageParams }`)

No `.prefetch()`, `.setData()`, or `.refetch()` — the suspense variant is the
same set with `.useSuspenseInfiniteQuery(options?)` instead.

Source: `packages/react/src/createInfiniteQuery.ts`

### `createMutation(...)`

Returns an object with:

- `.useMutation(options?)`
- `.execute(args)`

Source: `packages/react/src/createMutation.ts`

### Result unwrapping

A method returning `variant { Ok : T; Err : E }` never hands you the raw
variant. The Reactor's default `transformResult` unwraps it, so `data` — and the
value from `.fetch()`, `.execute()`, and `reactor.callMethod()` — is `T`, while
an `Err` is thrown as a `CanisterError` carrying the raw payload on `.err`,
reaching the `error` channel rather than `data`. Do not write
`if ("Ok" in data)`. `callMethod()` is not an escape hatch; the only way to keep
the raw variant is overriding `transformResult` on a `Reactor` subclass.

Source: `packages/core/src/reactor.ts`, `packages/core/src/errors/index.ts`

## Inside React: Recommended Patterns

### A. Generic hooks from `createActorHooks`

Use for component-focused code when method names vary:

```tsx
import { createActorHooks } from "@ic-reactor/react"

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

Define once at module scope in a client-only app (repo example: `examples/all-in-one-demo/src/lib/factories.ts`). In a server-rendered app these belong to a per-request provider instead — see Common Mistakes below:

```ts
import { createMutation, createQuery } from "@ic-reactor/react"

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
  invalidateQueries: [getLikes],
})
```

`invalidateQueries` takes a query object (`[getLikes]`), a query factory (every
args instance) or `{ functionName, args? }` of the mutation's own reactor, and
is awaited before `onSuccess`.

Optimistic update, with a rollback and a refetch once the mutation settles:

```tsx
const { mutate } = likePost.useMutation({
  onMutate: ([postId]) =>
    getPost([postId]).optimisticUpdate((post) => ({
      ...post,
      likes: post.likes + 1n,
    })),
  onError: (_error, _args, update) => update?.rollback(),
  onSettled: (_data, _error, [postId]) => getPost([postId]).invalidate(),
})
```

Here `getPost` is a `createQueryFactory` and `likePost` a `createMutation`.

### C. `useActorMethod` for unified imperative behavior

Use when one component needs a `call()` API and should not care if the method is
query or update. Its `retry`, `retryDelay`, `networkMode` and `meta` apply to an
update's `call()` too, so pass `retry` only for query methods or pass
`reactorUpdateRetry`:

```tsx
import { useActorMethod } from "@ic-reactor/react"

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
import { createQuery } from "@ic-reactor/react"

const userQuery = createQuery(backendReactor, {
  functionName: "get_user",
  args: ["user-1"],
})

await userQuery.fetch()
const cached = userQuery.getCacheData()
```

The factory modules in `examples/tanstack-router/src/canisters/ledger/hooks/` use this pattern. They are hand-maintained, because that example builds its reactor by hand. `ic-reactor generate` and the Vite plugin write `index.generated.ts` (the reactor plus six bound hooks), and with `factories: true` also `index.factories.generated.ts`: a `createQuery` / `createQueryFactory` object per query method and a `createMutation` per update method (see `examples/codegen-in-action/`). The non-suspense modules there (`icrc1NameQuery`, `icrc1TransferMutation`, ...) match what `factories: true` generates; codegen does not generate the suspense factories.

### B. Imperative mutation execution

Use `.execute(args)`:

```ts
import { createMutation } from "@ic-reactor/react"

const transfer = createMutation(ledgerReactor, {
  functionName: "icrc1_transfer",
})

const result = await transfer.execute([transferArg])
```

Example file (hand-maintained; `factories: true` generates the same object):

- `examples/tanstack-router/src/canisters/ledger/hooks/icrc1TransferMutation.ts`

`execute()` runs in the QueryClient's MutationCache, so a `mutations.retry`
default applies to it. For an update, set `retry: reactorUpdateRetry` (retries
only SysTransient) or `false` on the factory, never a number.

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

// Resolves once the active matching queries have refetched
await backendReactor.invalidateQueries({
  functionName: "get_user",
})

await backendReactor.callMethod({
  functionName: "update_user",
  args: [{ id: "user-1", name: "Alice" }],
})

// Another canister of the same interface: a memoized sibling reactor
const otherBackend = backendReactor.forCanister(otherCanisterId)
```

Any other fetch through the QueryClient (`queryClient.fetchInfiniteQuery`,
`ensureQueryData`) goes inside `clientManager.fetchAcrossIdentitySwitch(() => ...)`,
so a sign-in or sign-out mid-fetch runs it again instead of returning the
previous principal's data.

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
- `packages/codegen/src/generators/factories.ts` (`factories: true`)

### Prefer manual factories when:

- you need app-specific naming and composition
- you want one object usable both in components and outside React
- you want custom invalidation/select logic per operation

## Common Mistakes To Prevent

- Calling React hooks outside React. Use `.fetch()` or `.execute()` instead.
- Recreating factory instances on every render. Define them at module scope —
  except in server-rendered apps, where the reactor and its factories belong to
  the factory of `createReactorProvider`, read with its `useReactor` hook (see
  `examples/nextjs/src/service/provider.tsx`); there the mistake is the
  module-scope singleton. Call `createReactorProvider` itself at module scope.
- Hardcoding invalidation keys manually (`["get_posts"]` matches nothing: keys
  start with the canister id). Pass the query object, factory or
  `{ functionName }` to `invalidateQueries`.
- Using a query hook or query factory for a state-changing update method: it
  runs again on every refetch. Use a mutation.
- Giving an update mutation a numeric `retry` instead of `reactorUpdateRetry`.
- `args: [userId!]` or a placeholder for args not known yet. Pass `skipToken`,
  and never call `refetch()` on the skipped query.
- Retargeting a shared reactor with `setCanisterId` for several tokens, or
  adding the canister id to `queryKey`. Use `reactor.forCanister(canisterId)`.
- Hand-rolled `cancelQueries` / `setQueryData` snapshots with `(old: any)` for
  optimistic updates. Use `optimisticUpdate()`.
- `Number(x) / 10 ** decimals` or `parseFloat` token math, and a `try` around
  `Principal.fromText` to validate input. Use `formatTokenAmount` /
  `parseTokenAmount` and `isPrincipalText`.
- Hand-written per-method factory modules in a codegen project. Use
  `factories: true`, and override one factory from `index.ts`.
- Stubbing a `Reactor` in tests. Use `installFakeReplica` from
  `@ic-reactor/react/testing`.
- Editing generated hook files directly. Regeneration will overwrite them.
- Mixing `DisplayReactor` and `Reactor` expectations. Confirm transformed return and arg types first.

## Useful Repo Files

- `packages/react/src/createReactorProvider.ts`
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
