import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"

/**
 * For an update method, `useActorMethod` ran `onSuccess` first and then
 * started the invalidation of `invalidateQueries` without waiting for it
 * (#564). `onSuccess` read the cache as it was before the update, and `call()`
 * resolved, and `isPending` went false, while the invalidated queries were
 * still refetching. `useActorMutation` and `createMutation` wait for the
 * invalidation and then run `onSuccess`.
 */

interface WalletActor {
  get_balance: ActorMethod<[], number>
  transfer: ActorMethod<[number], boolean>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_balance: IDL.Func([], [IDL.Nat32], ["query"]),
    transfer: IDL.Func([IDL.Nat32], [IDL.Bool], []),
  })

describe("useActorMethod waits for invalidation before onSuccess", () => {
  let queryClient: QueryClient
  let reactor: Reactor<WalletActor>
  let balanceKey: readonly unknown[]
  let failBalance: boolean

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    reactor = new Reactor<WalletActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "wallet",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    balanceKey = reactor.generateQueryKey({ functionName: "get_balance" })
    failBalance = false
    let balance = 100
    vi.spyOn(reactor, "callMethod").mockImplementation((async ({
      functionName,
      args,
    }: {
      functionName: string
      args?: [number]
    }) => {
      if (functionName === "transfer") {
        balance -= args?.[0] ?? 0
        return true
      }
      // A real round trip, so a refetch is still running for a while.
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (failBalance) throw new Error("replica unavailable")
      return balance
    }) as never)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  const renderWallet = (onSuccess?: (data: boolean) => void) =>
    renderHook(
      () => ({
        balance: useActorMethod({ reactor, functionName: "get_balance" }),
        transfer: useActorMethod({
          reactor,
          functionName: "transfer",
          invalidateQueries: [balanceKey],
          onSuccess,
        }),
      }),
      { wrapper }
    )

  it("runs onSuccess once the invalidated queries have refetched", async () => {
    const balanceInOnSuccess: unknown[] = []
    const { result } = renderWallet(() =>
      balanceInOnSuccess.push(queryClient.getQueryData(balanceKey))
    )
    await waitFor(() => expect(result.current.balance.data).toBe(100))

    await act(async () => {
      await result.current.transfer.call([10])
    })

    expect(balanceInOnSuccess).toEqual([90])
  })

  it("resolves call() once the invalidated queries have refetched", async () => {
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.balance.data).toBe(100))

    let balanceWhenCallResolved: unknown
    await act(async () => {
      await result.current.transfer.call([10])
      balanceWhenCallResolved = queryClient.getQueryData(balanceKey)
    })

    expect(balanceWhenCallResolved).toBe(90)
  })

  it("still reports the update when a refetch it started fails", async () => {
    // The update has committed on the canister, so a failed refetch must not
    // turn it into a failure. `invalidateQueries` does not reject for one.
    const onSuccess = vi.fn()
    const { result } = renderWallet(onSuccess)
    await waitFor(() => expect(result.current.balance.data).toBe(100))
    failBalance = true

    let called: unknown
    await act(async () => {
      called = await result.current.transfer.call([10])
    })

    expect(called).toBe(true)
    expect(onSuccess.mock.calls).toEqual([[true]])
    await waitFor(() => expect(result.current.balance.isError).toBe(true))
  })
})
