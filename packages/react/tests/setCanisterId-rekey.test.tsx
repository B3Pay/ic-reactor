import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorQuery } from "../src/hooks/useActorQuery.js"

interface TestActor {
  icrc1_name: ActorMethod<[], string>
}

const LEDGER_A = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const LEDGER_B = "mc6ru-gyaaa-aaaar-qaaaq-cai"

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ icrc1_name: IDL.Func([], [IDL.Text], ["query"]) })

/**
 * `setCanisterId` mutates state inside the reactor while the reactor object
 * itself stays identical, so a key memoized on `[reactor, …]` never recomputed
 * and a mounted hook kept reading the previous canister's entry.
 */
describe("useActorQuery — reactor.setCanisterId", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    reactor = new Reactor<TestActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "ledger",
      canisterId: LEDGER_A,
      idlFactory,
    })
    vi.spyOn(reactor, "callMethod").mockImplementation(
      (async () => `name-of-${reactor.canisterId.toString()}`) as never
    )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("re-keys a mounted hook onto the new canister", async () => {
    const { result, rerender } = renderHook(
      () => useActorQuery({ reactor, functionName: "icrc1_name" }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(`name-of-${LEDGER_A}`)

    act(() => {
      reactor.setCanisterId(LEDGER_B)
    })
    rerender()

    await waitFor(() => expect(result.current.data).toBe(`name-of-${LEDGER_B}`))
  })

  it("keeps the two canisters in separate cache entries", async () => {
    const { result, rerender } = renderHook(
      () => useActorQuery({ reactor, functionName: "icrc1_name" }),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      reactor.setCanisterId(LEDGER_B)
    })
    rerender()
    await waitFor(() => expect(result.current.data).toBe(`name-of-${LEDGER_B}`))

    // The first canister's data must still be under its own key, not overwritten.
    expect(queryClient.getQueryData([LEDGER_A, "icrc1_name"])).toBe(
      `name-of-${LEDGER_A}`
    )
    expect(queryClient.getQueryData([LEDGER_B, "icrc1_name"])).toBe(
      `name-of-${LEDGER_B}`
    )
  })
})
