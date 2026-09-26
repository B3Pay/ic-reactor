import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ActorMethod } from "@icp-sdk/core/agent"
import { QueryClient, QueryObserver } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Reactor } from "../src/reactor.js"
import { ClientManager } from "../src/client.js"

/**
 * `Reactor.invalidateQueries` started TanStack Query's invalidation and
 * dropped its promise: the method was declared `void`, so
 * `await reactor.invalidateQueries(...)` in a mutation's `onSuccess` waited
 * for nothing, and the code after it read the cache before the invalidated
 * queries had refetched. A query object's `invalidate()` already returned the
 * promise. The reactor's method now returns it too.
 */

interface CounterActor {
  count: ActorMethod<[], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ count: IDL.Func([], [IDL.Nat], ["query"]) })

describe("Reactor.invalidateQueries returns TanStack Query's promise", () => {
  let queryClient: QueryClient
  let reactor: Reactor<CounterActor>
  let counter: bigint
  let failNext: boolean
  let unsubscribe: (() => void) | undefined

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = new Reactor<CounterActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "counter",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    counter = 1n
    failNext = false
    vi.spyOn(reactor, "callMethod").mockImplementation((async () => {
      // A real round trip, so a refetch is still running for a while.
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (failNext) throw new Error("replica unavailable")
      return counter
    }) as never)
  })

  afterEach(() => unsubscribe?.())

  /** Make the `count` query active, as a mounted `useQuery` does. */
  const observeCount = async () => {
    const observer = new QueryObserver(queryClient, {
      ...reactor.getQueryOptions({ functionName: "count" }),
    })
    unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(1n))
  }

  it("resolves once the active queries it matched have refetched", async () => {
    await observeCount()
    counter = 2n

    await reactor.invalidateQueries({ functionName: "count" })

    expect(reactor.getQueryData({ functionName: "count" })).toBe(2n)
  })

  it("does not reject when the refetch fails", async () => {
    await observeCount()
    failNext = true

    await expect(
      reactor.invalidateQueries({ functionName: "count" })
    ).resolves.toBeUndefined()
    expect(
      queryClient.getQueryState(
        reactor.generateQueryKey({ functionName: "count" })
      )?.status
    ).toBe("error")
  })
})
