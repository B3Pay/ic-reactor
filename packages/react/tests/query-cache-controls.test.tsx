import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, type InfiniteData } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, DisplayReactor, Reactor } from "@ic-reactor/core"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import { createSuspenseQuery } from "../src/createSuspenseQuery.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQuery } from "../src/createSuspenseInfiniteQuery.js"
import { createMutation } from "../src/createMutation.js"

/**
 * Query objects offered fetch, prefetch, invalidate, getQueryKey,
 * getCacheData and setData, so every optimistic update in the docs dropped to
 * the QueryClient for about 40 lines of cancel, snapshot, write and rollback,
 * with `useQueryClient()` (which throws without the optional provider) and an
 * `any` updater, and the all-in-one demo called `queryClient.resetQueries`
 * with the object's own key. Query objects now have cancel(), reset() and
 * optimisticUpdate() on their own cache entry.
 */

interface Post {
  title: string
  likes: bigint
}

interface BlogActor {
  get_post: ActorMethod<[string], Post>
  get_count: ActorMethod<[], bigint>
  get_titles: ActorMethod<[bigint], string[]>
  like_post: ActorMethod<[string], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const Post = IDL.Record({ title: IDL.Text, likes: IDL.Nat })
  return IDL.Service({
    get_post: IDL.Func([IDL.Text], [Post], ["query"]),
    get_count: IDL.Func([], [IDL.Nat], ["query"]),
    get_titles: IDL.Func([IDL.Nat], [IDL.Vec(IDL.Text)], ["query"]),
    like_post: IDL.Func([IDL.Text], [IDL.Nat], []),
  })
}

const CANISTER = "rrkah-fqaaa-aaaaa-aaaaq-cai"

let queryClient: QueryClient
let clientManager: ClientManager
let reactor: Reactor<BlogActor>
/** What the canister answers now. */
let server: { count: bigint; likes: bigint; likeFails: boolean }
/** While set, every call waits for it, so a fetch stays in flight. */
let gate: Promise<void> | undefined
let calls: string[]

const openGate = () => {
  let open!: () => void
  gate = new Promise<void>((resolve) => (open = resolve))
  return () => {
    gate = undefined
    open()
  }
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clientManager = new ClientManager({
    queryClient,
    agentOptions: { host: "https://icp-api.io" },
  })
  reactor = new Reactor<BlogActor>({
    clientManager,
    name: "blog",
    canisterId: CANISTER,
    idlFactory,
  })
  server = { count: 1n, likes: 10n, likeFails: false }
  gate = undefined
  calls = []
  vi.spyOn(reactor, "callMethod").mockImplementation((async ({
    functionName,
    args,
  }: {
    functionName: string
    args?: unknown[]
  }) => {
    calls.push(functionName)
    // Read the answer before waiting, as a canister answers from the state it
    // had when the call arrived.
    const answer =
      functionName === "get_count"
        ? server.count
        : functionName === "get_titles"
          ? [`title at ${String(args?.[0])}`]
          : { title: `post ${String(args?.[0])}`, likes: server.likes }
    await (gate ?? new Promise((resolve) => setTimeout(resolve, 5)))
    if (functionName === "like_post") {
      if (server.likeFails) throw new Error("replica unavailable")
      return ++server.likes
    }
    return answer
  }) as never)
})

const stateOf = (key: readonly unknown[]) => queryClient.getQueryState(key)

describe("cancel()", () => {
  it("cancels the query's fetch in flight and keeps the value it held", async () => {
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const { result } = renderHook(() => countQuery.useQuery())
    await waitFor(() => expect(result.current.data).toBe(1n))

    server.count = 2n
    const release = openGate()
    void countQuery.invalidate()
    await waitFor(() =>
      expect(stateOf(countQuery.getQueryKey())?.fetchStatus).toBe("fetching")
    )

    await countQuery.cancel()
    release()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(stateOf(countQuery.getQueryKey())?.fetchStatus).toBe("idle")
    expect(countQuery.getCacheData()).toBe(1n)
  })

  it("leaves a fetch under a longer key of the same prefix alone", async () => {
    const display = new DisplayReactor<BlogActor>({
      clientManager,
      name: "blog",
      canisterId: CANISTER,
      idlFactory,
    })
    vi.spyOn(display, "callMethod").mockImplementation((async () => {
      await gate
      return "2"
    }) as never)
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const displayCount = createQuery(display, { functionName: "get_count" })
    // The candid key is a prefix of the display one.
    expect(
      displayCount.getQueryKey().slice(0, countQuery.getQueryKey().length)
    ).toEqual(countQuery.getQueryKey())

    const release = openGate()
    const displayFetch = displayCount.fetch()
    await countQuery.cancel()
    release()

    await expect(displayFetch).resolves.toBe("2")
  })
})

describe("reset()", () => {
  it("clears the entry, and a mounted hook fetches it again", async () => {
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const { result } = renderHook(() => countQuery.useQuery())
    await waitFor(() => expect(result.current.data).toBe(1n))

    server.count = 2n
    await act(() => countQuery.reset())

    await waitFor(() => expect(result.current.data).toBe(2n))
  })

  it("shows the Suspense fallback again for a suspense query", async () => {
    const countQuery = createSuspenseQuery(reactor, {
      functionName: "get_count",
    })
    function Count() {
      const { data } = countQuery.useSuspenseQuery()
      return <span>count {data.toString()}</span>
    }
    render(
      <Suspense fallback={<span>loading</span>}>
        <Count />
      </Suspense>
    )
    await screen.findByText("count 1")

    server.count = 2n
    const release = openGate()
    let reset: Promise<void> = Promise.resolve()
    act(() => {
      reset = countQuery.reset()
    })

    await screen.findByText("loading")
    release()
    await act(() => reset)
    await screen.findByText("count 2")
  })

  it("resets only its own entry, not a longer key of the same prefix", async () => {
    const display = new DisplayReactor<BlogActor>({
      clientManager,
      name: "blog",
      canisterId: CANISTER,
      idlFactory,
    })
    const countQuery = createQuery(reactor, { functionName: "get_count" })
    const displayCount = createQuery(display, { functionName: "get_count" })
    countQuery.setData(1n)
    displayCount.setData("1")

    await countQuery.reset()

    expect(countQuery.getCacheData()).toBeUndefined()
    expect(displayCount.getCacheData()).toBe("1")
  })
})

describe("optimisticUpdate()", () => {
  it("writes the updater's value and rolls it back with its timestamp", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const postQuery = getPost(["a"])
    await postQuery.fetch()
    const fetchedAt = stateOf(postQuery.getQueryKey())?.dataUpdatedAt
    await new Promise((resolve) => setTimeout(resolve, 5))

    const update = await postQuery.optimisticUpdate((post) => ({
      ...post,
      likes: post.likes + 1n,
    }))
    expect(postQuery.getCacheData()).toEqual({ title: "post a", likes: 11n })

    update.rollback()
    expect(postQuery.getCacheData()).toEqual({ title: "post a", likes: 10n })
    expect(stateOf(postQuery.getQueryKey())?.dataUpdatedAt).toBe(fetchedAt)
  })

  it("cancels a fetch in flight so its older answer cannot land on top", async () => {
    const postQuery = createQuery(reactor, {
      functionName: "get_post",
      args: ["a"],
    })
    const { result } = renderHook(() => postQuery.useQuery())
    await waitFor(() => expect(result.current.data?.likes).toBe(10n))

    // A refetch that the canister answers from before the like.
    const release = openGate()
    void postQuery.invalidate()
    await waitFor(() =>
      expect(stateOf(postQuery.getQueryKey())?.fetchStatus).toBe("fetching")
    )

    await postQuery.optimisticUpdate((post) => ({ ...post, likes: 11n }))
    release()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(result.current.data?.likes).toBe(11n)
  })

  it("does nothing when nothing is cached yet", async () => {
    const postQuery = createQuery(reactor, {
      functionName: "get_post",
      args: ["a"],
    })
    const updater = vi.fn((post: Post) => post)

    const update = await postQuery.optimisticUpdate(updater)
    update.rollback()

    expect(updater).not.toHaveBeenCalled()
    expect(postQuery.getCacheData()).toBeUndefined()
    expect(stateOf(postQuery.getQueryKey())).toBeUndefined()
  })

  it("shows the value while the mutation runs and rolls back when it fails", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    await getPost(["a"]).fetch()
    server.likeFails = true
    const seen: (bigint | undefined)[] = []

    const likePost = createMutation(reactor, {
      functionName: "like_post",
      onMutate: ([postId]) =>
        getPost([postId]).optimisticUpdate((post) => ({
          ...post,
          likes: post.likes + 1n,
        })),
      onError: (_error, _args, update) => {
        seen.push(getPost(["a"]).getCacheData()?.likes)
        update?.rollback()
      },
    })

    await expect(likePost.execute(["a"])).rejects.toThrow()

    expect(seen).toEqual([11n])
    expect(getPost(["a"]).getCacheData()?.likes).toBe(10n)
  })

  it("keeps the value when the mutation succeeds", async () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    await getPost(["a"]).fetch()

    const likePost = createMutation(reactor, {
      functionName: "like_post",
      onMutate: ([postId]) =>
        getPost([postId]).optimisticUpdate((post) => ({
          ...post,
          likes: post.likes + 1n,
        })),
      onError: (_error, _args, update) => update?.rollback(),
    })
    await likePost.execute(["a"])

    expect(getPost(["a"]).getCacheData()?.likes).toBe(11n)
  })

  it("updates an infinite query's pages", async () => {
    const titles = createInfiniteQuery(reactor, {
      functionName: "get_titles",
      initialPageParam: 0n,
      getArgs: (page): [bigint] => [page],
      getNextPageParam: () => null,
    })
    await titles.fetch()

    const update = await titles.optimisticUpdate((data) => ({
      ...data,
      pages: [["draft"], ...data.pages],
      pageParams: [-1n, ...data.pageParams],
    }))
    expect(titles.getCacheData()?.pages).toEqual([["draft"], ["title at 0"]])

    update.rollback()
    expect(titles.getCacheData()?.pages).toEqual([["title at 0"]])
  })

  it("updates a suspense infinite query's pages", async () => {
    const titles = createSuspenseInfiniteQuery(reactor, {
      functionName: "get_titles",
      initialPageParam: 0n,
      getArgs: (page): [bigint] => [page],
      getNextPageParam: () => null,
    })
    await titles.fetch()

    await titles.optimisticUpdate((data): InfiniteData<string[], bigint> => ({
      ...data,
      pages: data.pages.map((page) => page.map((t) => t.toUpperCase())),
    }))

    expect(titles.getCacheData()?.pages).toEqual([["TITLE AT 0"]])
    await titles.reset()
    expect(titles.getCacheData()).toBeUndefined()
  })
})
