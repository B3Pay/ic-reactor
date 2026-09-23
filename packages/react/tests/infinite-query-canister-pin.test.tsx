import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod, CallConfig } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQuery } from "../src/createSuspenseInfiniteQuery.js"

/**
 * An infinite query's key is rooted at the canister the reactor held when the
 * query was set up, but its query function reached `callMethod`, which reads
 * `reactor.canisterId` again whenever it runs. After `setCanisterId`, a retry
 * or a refetch by an observer that had not re-rendered fetched the new
 * canister's pages and cached them under the old canister's key: switching
 * back showed token B's history as token A's (#558). `Reactor.getQueryOptions`
 * pins its query function the same way (#509).
 */

interface HistoryActor {
  get_history: ActorMethod<[{ start: bigint }], { entries: string[] }>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_history: IDL.Func(
      [IDL.Record({ start: IDL.Nat })],
      [IDL.Record({ entries: IDL.Vec(IDL.Text) })],
      ["query"]
    ),
  })

const TOKEN_A = "rrkah-fqaaa-aaaaa-aaaaq-cai"
const TOKEN_B = "ryjl3-tyaaa-aaaaa-aaaba-cai"

describe("infinite queries fetch from the canister their key names", () => {
  let queryClient: QueryClient
  let reactor: Reactor<HistoryActor>
  /** The canister each call went to, as `callMethod` would resolve it. */
  let fetchedFrom: string[]

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = new Reactor<HistoryActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "ledger",
      canisterId: TOKEN_A,
      idlFactory,
    })
    fetchedFrom = []
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      callConfig,
    }: {
      callConfig?: CallConfig
    }) => {
      // What the real `callMethod` does: an explicit canister, or the
      // reactor's current one.
      const canister = callConfig?.canisterId
        ? String(callConfig.canisterId)
        : reactor.canisterId.toString()
      fetchedFrom.push(canister)
      return { entries: [`history of ${canister}`] }
    }) as never)
  })

  const history = {
    functionName: "get_history" as const,
    initialPageParam: 0n,
    getArgs: (start: bigint) => [{ start }] as [{ start: bigint }],
    getNextPageParam: () => undefined,
  }

  it("createInfiniteQuery: a refetch after setCanisterId stays on the key's canister", async () => {
    const list = createInfiniteQuery(reactor, history)
    await list.fetch()
    const keyForA = list.getQueryKey()

    reactor.setCanisterId(TOKEN_B)
    await queryClient.refetchQueries({ queryKey: keyForA })

    expect(fetchedFrom).toEqual([TOKEN_A, TOKEN_A])
    expect(queryClient.getQueryData(keyForA)).toMatchObject({
      pages: [{ entries: [`history of ${TOKEN_A}`] }],
    })
  })

  it("createSuspenseInfiniteQuery: a refetch after setCanisterId stays on the key's canister", async () => {
    const list = createSuspenseInfiniteQuery(reactor, history)
    await list.fetch()
    const keyForA = list.getQueryKey()

    reactor.setCanisterId(TOKEN_B)
    await queryClient.refetchQueries({ queryKey: keyForA })

    expect(fetchedFrom).toEqual([TOKEN_A, TOKEN_A])
  })

  it("useActorInfiniteQuery: an observer that has not re-rendered refetches its own canister", async () => {
    const { useActorInfiniteQuery } = createActorHooks(reactor)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useActorInfiniteQuery(history), {
      wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const keyForA = queryClient
      .getQueryCache()
      .getAll()
      .find((query) => query.queryKey[0] === TOKEN_A)!.queryKey

    // No re-render: the mounted observer still holds the query function from
    // the render that built the key for canister A.
    reactor.setCanisterId(TOKEN_B)
    await queryClient.refetchQueries({ queryKey: keyForA })

    expect(fetchedFrom).toEqual([TOKEN_A, TOKEN_A])
  })

  it("keeps an explicit callConfig canister", async () => {
    const list = createInfiniteQuery(reactor, {
      ...history,
      callConfig: { canisterId: TOKEN_B },
    })
    await list.fetch()

    expect(fetchedFrom).toEqual([TOKEN_B])
  })
})
