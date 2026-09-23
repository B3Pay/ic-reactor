import { describe, it, expect, vi, beforeEach } from "vitest"
import { ActorMethod } from "@icp-sdk/core/agent"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Reactor } from "../src/reactor.js"
import { ClientManager } from "../src/client.js"

/**
 * `fetchQuery` is cache-first, as the Reactor reference and README say: a
 * cached value comes back even when it is stale or was invalidated, and the
 * query client's own `fetchQuery`, given the reactor's query options, is the
 * documented way to get a value the canister returns now.
 */

interface CounterActor {
  count: ActorMethod<[], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ count: IDL.Func([], [IDL.Nat], ["query"]) })

describe("Reactor.fetchQuery is cache-first", () => {
  let reactor: Reactor<CounterActor>
  let counter: bigint

  beforeEach(() => {
    reactor = new Reactor<CounterActor>({
      clientManager: new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "counter",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    counter = 0n
    vi.spyOn(reactor, "callMethod").mockImplementation((async () => {
      counter++
      return counter
    }) as never)
  })

  it("returns the cached value after an invalidation, and ignores staleTime", async () => {
    expect(await reactor.fetchQuery({ functionName: "count" })).toBe(1n)

    reactor.invalidateQueries({ functionName: "count" })

    expect(await reactor.fetchQuery({ functionName: "count" })).toBe(1n)
    expect(
      await reactor.fetchQuery({ functionName: "count" }, { staleTime: 0 })
    ).toBe(1n)
    expect(reactor.callMethod).toHaveBeenCalledTimes(1)
  })

  it("gets a value the canister returns now through the query client's fetchQuery", async () => {
    expect(await reactor.fetchQuery({ functionName: "count" })).toBe(1n)

    const fresh = await reactor.queryClient.fetchQuery({
      ...reactor.getQueryOptions({ functionName: "count" }),
      staleTime: 0,
    })

    expect(fresh).toBe(2n)
    expect(reactor.getQueryData({ functionName: "count" })).toBe(2n)
  })
})
