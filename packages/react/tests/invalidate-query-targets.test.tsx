import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, type QueryKey } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, DisplayReactor, Reactor } from "@ic-reactor/core"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"
import {
  createInfiniteQuery,
  createInfiniteQueryFactory,
} from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQueryFactory } from "../src/createSuspenseInfiniteQuery.js"
import { createMutation } from "../src/createMutation.js"
import { useActorMutation } from "../src/hooks/useActorMutation.js"
import { useActorMethod } from "../src/hooks/useActorMethod.js"

/**
 * A mutation's `invalidateQueries` took only query keys. Every key starts with
 * the canister id, so the natural `["get_posts"]` matched nothing (the
 * all-in-one example shipped exactly that), and a query factory, which makes
 * one query per args, had no key for all of its queries: a transfer refreshed
 * one balance by hand, or the page fell back to `refetch()`.
 *
 * An entry can now also be a query object, a query factory, or a
 * `{ functionName, args? }` method of the mutation's reactor, and the four
 * factories carry `getQueryKey()` and `invalidate()` for all of their queries.
 */

interface BlogActor {
  get_post: ActorMethod<[string], string>
  get_posts: ActorMethod<[bigint, bigint], string[]>
  get_count: ActorMethod<[], bigint>
  create_post: ActorMethod<[string], boolean>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_post: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    get_posts: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(IDL.Text)], ["query"]),
    get_count: IDL.Func([], [IDL.Nat], ["query"]),
    create_post: IDL.Func([IDL.Text], [IDL.Bool], []),
  })

const CANISTER = "rrkah-fqaaa-aaaaa-aaaaq-cai"
const OTHER_CANISTER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

let queryClient: QueryClient
let clientManager: ClientManager
let reactor: Reactor<BlogActor>
let count: bigint

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

/** A reactor on its own client whose calls answer from `count`. */
function makeReactor(manager: ClientManager, canisterId = CANISTER) {
  const made = new Reactor<BlogActor>({
    clientManager: manager,
    name: "blog",
    canisterId,
    idlFactory,
  })
  vi.spyOn(made, "callMethod").mockImplementation((async ({
    functionName,
    args,
  }: {
    functionName: string
    args?: unknown[]
  }) => {
    // A real round trip, so a refetch is still running for a while.
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (functionName === "create_post") {
      count++
      return true
    }
    if (functionName === "get_count") return count
    if (functionName === "get_posts") return [`page ${String(args?.[0])}`]
    return `post ${String(args?.[0])} (${count})`
  }) as never)
  return made
}

beforeEach(() => {
  queryClient = newQueryClient()
  clientManager = new ClientManager({
    queryClient,
    agentOptions: { host: "https://icp-api.io" },
  })
  reactor = makeReactor(clientManager)
  count = 0n
})

const isInvalidated = (key: QueryKey, client = queryClient) =>
  client.getQueryState(key)?.isInvalidated

/** Seed an entry, as a settled fetch would. */
const seed = (key: QueryKey, data: unknown, client = queryClient) => {
  client.setQueryData(key, data)
  expect(isInvalidated(key, client)).toBe(false)
}

const seedPages = (key: QueryKey) =>
  seed(key, { pages: [["page 0"]], pageParams: [0n] })

const postsInfiniteConfig = {
  functionName: "get_posts" as const,
  initialPageParam: 0n,
  getNextPageParam: () => null,
}

describe("createMutation invalidateQueries entries", () => {
  it("takes a query object", async () => {
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const postQuery = createQuery(reactor, {
      functionName: "get_post",
      args: ["a"],
    })
    seed(countQuery.getQueryKey(), 0n)
    seed(postQuery.getQueryKey(), "post a")

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [countQuery],
    }).execute(["new"])

    expect(isInvalidated(countQuery.getQueryKey())).toBe(true)
    expect(isInvalidated(postQuery.getQueryKey())).toBe(false)
  })

  it("takes suspense and infinite query objects", async () => {
    const countQuery = createSuspenseQuery(reactor, {
      functionName: "get_count",
    })
    const postsQuery = createInfiniteQuery(reactor, {
      ...postsInfiniteConfig,
      getArgs: (offset): [bigint, bigint] => [offset, 10n],
    })
    seed(countQuery.getQueryKey(), 0n)
    seedPages(postsQuery.getQueryKey())

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [countQuery, postsQuery],
    }).execute(["new"])

    expect(isInvalidated(countQuery.getQueryKey())).toBe(true)
    expect(isInvalidated(postsQuery.getQueryKey())).toBe(true)
  })

  it("takes a query factory, covering every args instance", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    seed(getPost(["a"]).getQueryKey(), "post a")
    seed(getPost(["b"]).getQueryKey(), "post b")
    seed(countQuery.getQueryKey(), 0n)

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [getPost],
    }).execute(["new"])

    expect(isInvalidated(getPost(["a"]).getQueryKey())).toBe(true)
    expect(isInvalidated(getPost(["b"]).getQueryKey())).toBe(true)
    expect(isInvalidated(countQuery.getQueryKey())).toBe(false)
  })

  it("takes a suspense query factory", async () => {
    const getPost = createSuspenseQueryFactory(reactor, {
      functionName: "get_post",
    })
    seed(getPost(["a"]).getQueryKey(), "post a")
    seed(getPost(["b"]).getQueryKey(), "post b")

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [getPost],
    }).execute(["new"])

    expect(isInvalidated(getPost(["a"]).getQueryKey())).toBe(true)
    expect(isInvalidated(getPost(["b"]).getQueryKey())).toBe(true)
  })

  it("takes an infinite query factory, covering every page set", async () => {
    const getPosts = createInfiniteQueryFactory(reactor, postsInfiniteConfig)
    const small = getPosts((offset) => [offset, 5n])
    const large = getPosts((offset) => [offset, 50n])
    seedPages(small.getQueryKey())
    seedPages(large.getQueryKey())
    expect(small.getQueryKey()).not.toEqual(large.getQueryKey())

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [getPosts],
    }).execute(["new"])

    expect(isInvalidated(small.getQueryKey())).toBe(true)
    expect(isInvalidated(large.getQueryKey())).toBe(true)
  })

  it("takes a suspense infinite query factory, per-call keys included", async () => {
    const getPosts = createSuspenseInfiniteQueryFactory(reactor, {
      ...postsInfiniteConfig,
      queryKey: ["feed"],
    })
    const plain = getPosts((offset) => [offset, 5n])
    const scoped = getPosts((offset) => [offset, 5n], { queryKey: ["v2"] })
    seedPages(plain.getQueryKey())
    seedPages(scoped.getQueryKey())

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [getPosts],
    }).execute(["new"])

    expect(isInvalidated(plain.getQueryKey())).toBe(true)
    expect(isInvalidated(scoped.getQueryKey())).toBe(true)
  })

  it("takes a { functionName } descriptor, covering every args and page set", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const posts = createInfiniteQuery(reactor, {
      ...postsInfiniteConfig,
      getArgs: (offset): [bigint, bigint] => [offset, 10n],
    })
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    seed(getPost(["a"]).getQueryKey(), "post a")
    seed(getPost(["b"]).getQueryKey(), "post b")
    seedPages(posts.getQueryKey())
    seed(countQuery.getQueryKey(), 0n)

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [
        { functionName: "get_post" },
        { functionName: "get_posts" },
      ],
    }).execute(["new"])

    expect(isInvalidated(getPost(["a"]).getQueryKey())).toBe(true)
    expect(isInvalidated(getPost(["b"]).getQueryKey())).toBe(true)
    expect(isInvalidated(posts.getQueryKey())).toBe(true)
    expect(isInvalidated(countQuery.getQueryKey())).toBe(false)
  })

  it("takes a descriptor with args, covering only those args", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    seed(getPost(["a"]).getQueryKey(), "post a")
    seed(getPost(["b"]).getQueryKey(), "post b")

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [{ functionName: "get_post", args: ["a"] }],
    }).execute(["new"])

    expect(isInvalidated(getPost(["a"]).getQueryKey())).toBe(true)
    expect(isInvalidated(getPost(["b"]).getQueryKey())).toBe(false)
  })

  it("takes the empty args of a method without parameters as no args", async () => {
    // A query made without args has no args segment, and one made with
    // `args: []` has one; `args: []` in a descriptor names both.
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const countWithArgs = createQuery(reactor, {
      functionName: "get_count",
      args: [],
    })
    expect(countWithArgs.getQueryKey()).not.toEqual(countQuery.getQueryKey())
    seed(countQuery.getQueryKey(), 0n)
    seed(countWithArgs.getQueryKey(), 0n)

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [{ functionName: "get_count", args: [] }],
    }).execute(["new"])

    expect(isInvalidated(countQuery.getQueryKey())).toBe(true)
    expect(isInvalidated(countWithArgs.getQueryKey())).toBe(true)
  })

  it("keys a descriptor with the reactor's transform", async () => {
    const display = new DisplayReactor<BlogActor>({
      clientManager,
      name: "blog",
      canisterId: CANISTER,
      idlFactory,
    })
    vi.spyOn(display, "callMethod").mockResolvedValue(true as never)
    const displayCount = createQuery(display, { functionName: "get_count" })
    seed(displayCount.getQueryKey(), "0")
    // The candid reactor's entry of the same method is a different entry.
    expect(displayCount.getQueryKey()).not.toEqual(
      reactor.generateQueryKey({ functionName: "get_count" })
    )

    await createMutation(display, {
      functionName: "create_post",
      invalidateQueries: [{ functionName: "get_count" }],
    }).execute(["new"])

    expect(isInvalidated(displayCount.getQueryKey())).toBe(true)
  })

  it("builds a descriptor's key when the mutation succeeds, after a setCanisterId", async () => {
    const mutation = createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [{ functionName: "get_count" }],
    })
    reactor.setCanisterId(OTHER_CANISTER)
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    seed(countQuery.getQueryKey(), 0n)
    expect(countQuery.getQueryKey()[0]).toBe(OTHER_CANISTER)

    await mutation.execute(["new"])

    expect(isInvalidated(countQuery.getQueryKey())).toBe(true)
  })

  it("keys a descriptor at the canister the mutation's callConfig sends it to", async () => {
    // The transfer went to OTHER_CANISTER, so that canister's queries are the
    // ones it changed; the reactor's own canister's are left alone.
    const otherCount = reactor.generateQueryKey(
      { functionName: "get_count" },
      { canisterId: OTHER_CANISTER }
    )
    const ownCount = reactor.generateQueryKey({ functionName: "get_count" })
    seed(otherCount, 0n)
    seed(ownCount, 0n)

    await createMutation(reactor, {
      functionName: "create_post",
      callConfig: { canisterId: OTHER_CANISTER },
      invalidateQueries: [{ functionName: "get_count" }],
    }).execute(["new"])

    expect(isInvalidated(otherCount)).toBe(true)
    expect(isInvalidated(ownCount)).toBe(false)
  })

  it("invalidates a query of another reactor in that reactor's own QueryClient", async () => {
    const otherClient = newQueryClient()
    const otherReactor = makeReactor(
      new ClientManager({
        queryClient: otherClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      OTHER_CANISTER
    )
    const otherCount = createQuery(otherReactor, { functionName: "get_count" })
    const getOtherPost = createQueryFactory(otherReactor, {
      functionName: "get_post",
    })
    seed(otherCount.getQueryKey(), 0n, otherClient)
    seed(getOtherPost(["a"]).getQueryKey(), "post a", otherClient)

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [otherCount, getOtherPost],
    }).execute(["new"])

    expect(isInvalidated(otherCount.getQueryKey(), otherClient)).toBe(true)
    expect(isInvalidated(getOtherPost(["a"]).getQueryKey(), otherClient)).toBe(
      true
    )
  })

  it("still takes query keys, and skips undefined entries", async () => {
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    seed(countQuery.getQueryKey(), 0n)
    seed(["unrelated"], "keep")

    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [undefined, countQuery.getQueryKey()],
    }).execute(["new"])

    expect(isInvalidated(countQuery.getQueryKey())).toBe(true)
    expect(isInvalidated(["unrelated"])).toBe(false)
  })

  it("waits for a factory's active queries to refetch before onSuccess", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    // Mounted, so the invalidation refetches it.
    const { result } = renderHook(() => getPost(["a"]).useQuery())
    await waitFor(() => expect(result.current.data).toBe("post a (0)"))

    let seenInOnSuccess: unknown
    await createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [getPost],
      onSuccess: () => {
        seenInOnSuccess = getPost(["a"]).getCacheData()
      },
    }).execute(["new"])

    expect(seenInOnSuccess).toBe("post a (1)")
  })
})

describe("query factory getQueryKey() and invalidate()", () => {
  it("gives createQueryFactory the method's key prefix", () => {
    const getPost = createQueryFactory(reactor, {
      functionName: "get_post",
      queryKey: ["custom"],
    })
    const prefix = getPost.getQueryKey()

    expect(prefix).toEqual(
      reactor.generateQueryKey({ functionName: "get_post" })
    )
    expect(getPost(["a"]).getQueryKey().slice(0, prefix.length)).toEqual(prefix)
    // Still the memoized query object per args.
    expect(getPost(["a"])).toBe(getPost(["a"]))
  })

  it("follows a setCanisterId", () => {
    const getPost = createSuspenseQueryFactory(reactor, {
      functionName: "get_post",
    })
    reactor.setCanisterId(OTHER_CANISTER)

    expect(getPost.getQueryKey()[0]).toBe(OTHER_CANISTER)
  })

  it("gives an infinite factory the prefix of its config queryKey and callConfig", () => {
    const getPosts = createInfiniteQueryFactory(reactor, {
      ...postsInfiniteConfig,
      queryKey: ["feed"],
      callConfig: { canisterId: OTHER_CANISTER },
    })
    const prefix = getPosts.getQueryKey()
    const instanceKey = getPosts((offset) => [offset, 5n]).getQueryKey()

    expect(prefix[0]).toBe(OTHER_CANISTER)
    expect(prefix).toContain("feed")
    expect(instanceKey.slice(0, prefix.length)).toEqual(prefix)
  })

  it("invalidates every instance with invalidate(), and nothing else", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const getPosts = createSuspenseInfiniteQueryFactory(
      reactor,
      postsInfiniteConfig
    )
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    seed(getPost(["a"]).getQueryKey(), "post a")
    seed(getPost(["b"]).getQueryKey(), "post b")
    seedPages(getPosts((offset) => [offset, 5n]).getQueryKey())
    seed(countQuery.getQueryKey(), 0n)

    await getPost.invalidate()
    await getPosts.invalidate()

    expect(isInvalidated(getPost(["a"]).getQueryKey())).toBe(true)
    expect(isInvalidated(getPost(["b"]).getQueryKey())).toBe(true)
    expect(
      isInvalidated(getPosts((offset) => [offset, 5n]).getQueryKey())
    ).toBe(true)
    expect(isInvalidated(countQuery.getQueryKey())).toBe(false)
  })
})

describe("the hooks' invalidateQueries entries", () => {
  it("useActorMutation takes a query factory and a descriptor", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const countKey = reactor.generateQueryKey({ functionName: "get_count" })
    seed(getPost(["a"]).getQueryKey(), "post a")
    seed(countKey, 0n)

    const { result } = renderHook(() =>
      useActorMutation({
        reactor,
        functionName: "create_post",
        invalidateQueries: [getPost, { functionName: "get_count" }],
      })
    )
    await act(() => result.current.mutateAsync(["new"]))

    expect(isInvalidated(getPost(["a"]).getQueryKey())).toBe(true)
    expect(isInvalidated(countKey)).toBe(true)
  })

  it("useActorMethod takes a query object and a descriptor for an update", async () => {
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const postKey = reactor.generateQueryKey({
      functionName: "get_post",
      args: ["a"],
    })
    seed(countQuery.getQueryKey(), 0n)
    seed(postKey, "post a")

    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "create_post",
        invalidateQueries: [countQuery, { functionName: "get_post" }],
      })
    )
    await act(() => result.current.call(["new"]))

    expect(isInvalidated(countQuery.getQueryKey())).toBe(true)
    expect(isInvalidated(postKey)).toBe(true)
  })

  it("the hooks key a descriptor at the canister their callConfig names", async () => {
    const otherCount = reactor.generateQueryKey(
      { functionName: "get_count" },
      { canisterId: OTHER_CANISTER }
    )
    const ownCount = reactor.generateQueryKey({ functionName: "get_count" })
    seed(otherCount, 0n)
    seed(ownCount, 0n)
    const callConfig = { canisterId: OTHER_CANISTER }
    const invalidateQueries = [{ functionName: "get_count" as const }]

    const mutation = renderHook(() =>
      useActorMutation({
        reactor,
        functionName: "create_post",
        callConfig,
        invalidateQueries,
      })
    )
    await act(() => mutation.result.current.mutateAsync(["new"]))
    expect(isInvalidated(otherCount)).toBe(true)
    expect(isInvalidated(ownCount)).toBe(false)

    seed(otherCount, 0n)
    const method = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "create_post",
        callConfig,
        invalidateQueries,
      })
    )
    await act(() => method.result.current.call(["new"]))
    expect(isInvalidated(otherCount)).toBe(true)
    expect(isInvalidated(ownCount)).toBe(false)
  })

  it("useActorMethod skips an undefined entry instead of invalidating every query", async () => {
    seed(["unrelated"], "keep")
    const maybeQuery = undefined as
      | ReturnType<typeof createQuery<BlogActor, "candid", "get_count">>
      | undefined

    const { result } = renderHook(() =>
      useActorMethod({
        reactor,
        functionName: "create_post",
        invalidateQueries: [maybeQuery],
      })
    )
    await act(() => result.current.call(["new"]))

    expect(isInvalidated(["unrelated"])).toBe(false)
  })
})
