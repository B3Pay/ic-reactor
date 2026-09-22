import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"

/**
 * The infinite-query hooks fold `getArgs(initialPageParam)` into the cache key
 * (#236), and `getKeyArgs` is how a caller keeps the cursor out of it. The
 * factories applied `getKeyArgs`; the hooks ignored it, although the bound
 * hooks' config type (`InfiniteQueryConfig`) accepts it and documents it.
 *
 * A hook's config is rebuilt every render, so an `initialPageParam` such as
 * `Date.now()` — the docs' own bi-directional timeline example — put a new
 * cursor, and so a new key, into every render. Each render mounted a fresh
 * query, fetched its first page, re-rendered and moved on again: the list
 * never settled, and the canister was called in a tight loop.
 */

interface TimelineActor {
  get_timeline: ActorMethod<
    [{ around: bigint; limit: number }],
    { items: string[]; oldest: bigint }
  >
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_timeline: IDL.Func(
      [IDL.Record({ around: IDL.Nat64, limit: IDL.Nat32 })],
      [IDL.Record({ items: IDL.Vec(IDL.Text), oldest: IDL.Nat64 })],
      ["query"]
    ),
  })

describe("infinite-query hooks apply getKeyArgs", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TimelineActor>
  let callMethod: ReturnType<typeof vi.spyOn>
  /** Stands in for `Date.now()`: a different cursor on every render. */
  let clock: bigint

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = new Reactor<TimelineActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "timeline",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    clock = 1_000n
    callMethod = vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      args,
    }: {
      args: [{ around: bigint }]
    }) => ({
      items: [`around ${args[0].around}`],
      oldest: args[0].around - 10n,
    })) as never)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>{children}</Suspense>
    </QueryClientProvider>
  )

  type TimelineArgs = [{ around: bigint; limit: number }]

  const timeline = () => ({
    functionName: "get_timeline" as const,
    getArgs: (around: bigint): TimelineArgs => [{ around, limit: 20 }],
    initialPageParam: clock++,
    // Everything except the cursor identifies the list.
    getKeyArgs: ([{ limit }]: TimelineArgs) => [{ limit }],
    getNextPageParam: (page: { oldest: bigint }) => page.oldest,
  })

  it("settles useActorInfiniteQuery when initialPageParam changes every render", async () => {
    const { useActorInfiniteQuery } = createActorHooks(reactor)
    const { result, rerender } = renderHook(
      () => useActorInfiniteQuery(timeline()),
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toHaveLength(1)

    rerender()

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.data?.pages).toHaveLength(1)
    expect(callMethod).toHaveBeenCalledTimes(1)
  })

  it("settles useActorSuspenseInfiniteQuery when initialPageParam changes every render", async () => {
    const { useActorSuspenseInfiniteQuery } = createActorHooks(reactor)
    const { result, rerender } = renderHook(
      () => useActorSuspenseInfiniteQuery(timeline()),
      { wrapper }
    )

    await waitFor(() => expect(result.current?.isSuccess).toBe(true))

    rerender()

    expect(result.current.data.pages).toHaveLength(1)
    expect(callMethod).toHaveBeenCalledTimes(1)
  })

  it("shares its cache entry with a factory given the same getKeyArgs", async () => {
    // Same config through both call paths, so a loader, an invalidation or
    // getCacheData on the factory reaches what the hook renders.
    const { useActorInfiniteQuery } = createActorHooks(reactor)
    const { result } = renderHook(() => useActorInfiniteQuery(timeline()), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const factory = createInfiniteQuery(reactor, timeline())

    expect(factory.getCacheData()?.pages).toEqual(result.current.data?.pages)
  })

  it("still keys lists with different arguments apart", async () => {
    const { useActorInfiniteQuery } = createActorHooks(reactor)
    const list = (limit: number) =>
      useActorInfiniteQuery({
        functionName: "get_timeline",
        getArgs: (around: bigint) => [{ around, limit }],
        initialPageParam: 500n,
        getKeyArgs: ([args]) => [{ limit: args.limit }],
        getNextPageParam: (page) => page.oldest,
      })

    const small = renderHook(() => list(5), { wrapper })
    const large = renderHook(() => list(50), { wrapper })
    await waitFor(() => expect(small.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(large.result.current.isSuccess).toBe(true))

    expect(callMethod).toHaveBeenCalledTimes(2)
    expect(
      queryClient.getQueryCache().findAll({
        queryKey: reactor.generateQueryKey({ functionName: "get_timeline" }),
      })
    ).toHaveLength(2)
  })
})
