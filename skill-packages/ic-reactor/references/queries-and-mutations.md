# Queries, Mutations and the Cache

The examples use the setup from `setup.md`: `backend`, `useActorQuery` and
`useActorMutation` from `./reactor`, a `defineDisplayReactor`, so the
backend's arguments and results are display values; and `ledger` from
`./ledger`, a raw `Reactor` of an ICRC-1 ledger (`bigint`, `Principal`).

## Hooks in a component

```tsx
// src/ProfileCard.tsx
import { skipToken } from "@ic-reactor/react"
import { useActorMutation, useActorQuery } from "./reactor"

export function ProfileCard({ userId }: { userId?: string }) {
  const { data, isPending, error } = useActorQuery({
    functionName: "get_profile",
    // No call until the id exists; never `[userId!]`
    args: userId ? [userId] : skipToken,
  })
  const rename = useActorMutation({
    functionName: "update_profile",
    // Refetch every get_profile query of this canister once it succeeds
    invalidateQueries: [{ functionName: "get_profile" }],
    // The canister returned Err: err.code is the variant name
    onCanisterError: (err) => alert(`Not saved: ${err.code}`),
  })

  if (!userId) return <p>Sign in first</p>
  if (isPending) return <p>Loading…</p>
  if (error) return <p>{error.message}</p>
  return (
    <button
      disabled={rename.isPending}
      onClick={() => rename.mutate([{ name: "Ada" }])}
    >
      {data.name}: {data.likes} likes
    </button>
  )
}
```

`data` is the `Ok` payload of a `Result`; an `Err` is a `CanisterError` in
`error`. Keep `enabled` for conditions that are not about missing args, and
never call `refetch()` on a skipped query.

## Reusable query and mutation objects

Define them once (module scope in a client-only app, inside the
`createReactorProvider` factory in a server-rendered one), then use the same
object in components, loaders, actions and tests.

```ts
// src/queries.ts
import {
  createMutation,
  createQuery,
  createQueryFactory,
} from "@ic-reactor/react"
import { backend } from "./reactor"

export const postsQuery = createQuery(backend, { functionName: "get_posts" })
export const getPost = createQueryFactory(backend, { functionName: "get_post" })

export const createPost = createMutation(backend, {
  functionName: "create_post",
  // Awaited before onSuccess: a query object and a method of this reactor
  invalidateQueries: [postsQuery, { functionName: "get_posts_count" }],
})
export const likePost = createMutation(backend, { functionName: "like_post" })
```

| Need                           | Use                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------- |
| A query method without args    | `createQuery` (or `createSuspenseQuery`)                                     |
| A query method whose args vary | `createQueryFactory` (or `createSuspenseQueryFactory`), called with the args |
| Paginated reads                | `createInfiniteQuery`, `createSuspenseInfiniteQuery` (and their factories)   |
| An update method               | `createMutation`                                                             |

Inside React: `postsQuery.useQuery()`, `getPost([id]).useQuery()`,
`createPost.useMutation(options)`. Outside React:

```ts
import { createPost, getPost, postsQuery } from "./queries"

export function postLoader(postId: string) {
  // Cached and deduplicated; refetches as the new principal after a sign-in
  return getPost([postId]).fetch()
}

export function createPostAction(title: string) {
  // Resolves with the Ok payload after invalidateQueries ran; an Err rejects
  // with a CanisterError
  return createPost.execute([title])
}

export function refreshPosts() {
  return postsQuery.invalidate() // resolves once mounted queries refetched
}
```

A query object also has `.prefetch()`, `.getCacheData()`, `.setData()`,
`.getQueryKey()`, `.cancel()`, `.reset()` and `.optimisticUpdate()`. A query
factory has `getQueryKey()` (the prefix of all its queries) and
`invalidate()`. With args not known yet, call the factory with `skipToken`:
`getPost(postId ? [postId] : skipToken).useQuery()` (that object has only
`useQuery()`).

## Paginated reads

```ts
import { createInfiniteQuery } from "@ic-reactor/react"
import { backend } from "./reactor"

// list_posts : (record { offset : nat; limit : nat })
//   -> (record { posts : vec Post; next : opt nat }) query
export const postPages = createInfiniteQuery(backend, {
  functionName: "list_posts",
  initialPageParam: "0", // a DisplayReactor takes a nat as text
  getArgs: (offset) => [{ offset, limit: "20" }] as const,
  getNextPageParam: (lastPage) => lastPage.next, // undefined: no next page
})

// In a component:
//   const { data, fetchNextPage, hasNextPage } = postPages.useInfiniteQuery()
//   const posts = data?.pages.flatMap((page) => page.posts) ?? []
// In a loader: await postPages.fetch()
```

Keep `as const` on what `getArgs` returns: without it the args are inferred
as an array, not the method's argument tuple, and the call does not
type-check. `useActorInfiniteQuery` takes the same fields.

## Optimistic updates

```tsx
import { getPost, likePost } from "./queries"

export function LikeButton({ postId }: { postId: string }) {
  const { data: post } = getPost([postId]).useQuery()
  const like = likePost.useMutation({
    // Show the new count at once; undo it if the call fails
    onMutate: ([id]) =>
      getPost([id]).optimisticUpdate((cached) => ({
        ...cached,
        likes: (BigInt(cached.likes) + 1n).toString(),
      })),
    onError: (_error, _args, update) => update?.rollback(),
    onSettled: (_data, _error, [id]) => getPost([id]).invalidate(),
  })
  return (
    <button onClick={() => like.mutate([postId])}>
      {post?.title}: {post?.likes}
    </button>
  )
}
```

The updater gets the cached value (before `select`) and is skipped when
nothing is cached. `rollback()` does nothing after a sign-in or sign-out. Do
not hand-roll `cancelQueries` / `setQueryData` snapshots, and use
`reactor.queryClient` rather than `useQueryClient()` when you need the client.

## Several canisters of one interface

`reactor.forCanister(canisterId)` returns a memoized sibling reactor on the
same `ClientManager`, whose calls and query keys use its own canister. The
same id always returns the same object.

```tsx
import { useMemo } from "react"
import {
  createActorHooks,
  formatTokenAmount,
  type ReactorArgsOf,
} from "@ic-reactor/react"
import { ledger } from "./ledger"

type Account = ReactorArgsOf<typeof ledger, "icrc1_balance_of">[0]

export function Balance({
  tokenId,
  account,
}: {
  tokenId: string
  account: Account
}) {
  const token = useMemo(
    () => createActorHooks(ledger.forCanister(tokenId)),
    [tokenId]
  )
  const { data: balance } = token.useActorQuery({
    functionName: "icrc1_balance_of",
    args: [account],
  })
  const { data: decimals } = token.useActorQuery({
    functionName: "icrc1_decimals",
  })
  if (balance === undefined || decimals === undefined) return null
  return (
    <span>
      {formatTokenAmount(balance, decimals, { maxFractionDigits: 4 })}
    </span>
  )
}
```

For a single query of another canister, pass `callConfig: { canisterId }`
instead. Never retarget a shared reactor with `setCanisterId`, and never add
the canister id to a `queryKey`: it is already the first segment.

## Token transfers

```ts
import { isPrincipalText, parseTokenAmount } from "@ic-reactor/react"
import { Principal } from "@icp-sdk/core/principal"
import { ledger } from "./ledger"

export async function send(to: string, text: string, decimals: number) {
  if (!isPrincipalText(to.trim())) throw new Error("Not a principal")
  const amount = parseTokenAmount(text, decimals) // "0.29", 8 -> 29000000n
  return ledger.callMethod({
    functionName: "icrc1_transfer",
    args: [
      {
        to: { owner: Principal.fromText(to.trim()), subaccount: [] },
        amount,
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
      },
    ],
  })
}
```

`ledger` here is a raw `Reactor`, so it takes a `bigint` and a `Principal`.
A `DisplayReactor` takes `amount.toString()` and the principal text.
`parseTokenAmount` throws a `TypeError` for text that is not digits with at
most one `.`, and a `RangeError` for more fraction digits than the token has
or a negative amount.
`formatTokenAmount(value, decimals, options?)` truncates past
`maxFractionDigits` unless `roundingMode: "halfExpand"`.

Docs: https://ic-reactor.b3pay.net/v3/framework/queries.md,
https://ic-reactor.b3pay.net/v3/framework/mutations.md,
https://ic-reactor.b3pay.net/v3/framework/query-caching.md,
https://ic-reactor.b3pay.net/v3/reference/Utilities.md
