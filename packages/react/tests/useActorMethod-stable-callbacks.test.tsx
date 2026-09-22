import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React, { useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { useActorMethod } from "../src/hooks/useActorMethod.js"

/**
 * `call`, `refetch` and `reset` were rebuilt on every render: their
 * `useCallback` deps held the whole query and mutation result objects, which
 * TanStack Query hands back fresh each render. An effect that lists one of
 * them — which `react-hooks/exhaustive-deps` requires as soon as the effect
 * calls it — therefore re-ran after every render its own call caused. For an
 * update method that is an unbounded loop of state-changing canister calls.
 *
 * TanStack's own `refetch`, `mutate` and `reset` keep one identity for the
 * life of the component, and these now do too.
 */

interface CounterActor {
  get_count: ActorMethod<[], bigint>
  increment: ActorMethod<[], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_count: IDL.Func([], [IDL.Nat], ["query"]),
    increment: IDL.Func([], [IDL.Nat], []),
  })

/** Let pending fetches, renders and effects run for a while. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

describe("useActorMethod keeps call, refetch and reset stable", () => {
  let queryClient: QueryClient
  let reactor: Reactor<CounterActor>
  let callMethod: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
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
    let count = 0n
    callMethod = vi
      .spyOn(reactor, "callMethod")
      .mockImplementation((async ({
        functionName,
      }: {
        functionName: string
      }) => (functionName === "increment" ? ++count : count)) as never)
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("runs an update once from an effect that depends on call", async () => {
    const { result } = renderHook(
      () => {
        const method = useActorMethod({ reactor, functionName: "increment" })
        const { call } = method
        useEffect(() => {
          void call([])
        }, [call])
        return method
      },
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await settle()

    expect(callMethod).toHaveBeenCalledTimes(1)
    expect(result.current.data).toBe(1n)
  })

  it("refetches a query once from an effect that depends on refetch", async () => {
    const { result } = renderHook(
      () => {
        const method = useActorMethod({ reactor, functionName: "get_count" })
        const { refetch } = method
        useEffect(() => {
          void refetch()
        }, [refetch])
        return method
      },
      { wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await settle()

    // The mount fetch and the effect's refetch share one request.
    expect(callMethod).toHaveBeenCalledTimes(1)
  })

  it("returns the same functions after a rerender", async () => {
    for (const functionName of ["get_count", "increment"] as const) {
      const { result, rerender, unmount } = renderHook(
        () => useActorMethod({ reactor, functionName }),
        { wrapper }
      )
      await settle()
      const before = result.current

      rerender()

      expect(result.current.call).toBe(before.call)
      expect(result.current.refetch).toBe(before.refetch)
      expect(result.current.reset).toBe(before.reset)
      unmount()
    }
  })

  it("still calls with the latest props through a kept function", async () => {
    // Stability must not freeze the config: a `call` captured on the first
    // render has to reach the method named by the latest one.
    const { result, rerender } = renderHook(
      ({ functionName }: { functionName: "get_count" | "increment" }) =>
        useActorMethod({ reactor, functionName }),
      { wrapper, initialProps: { functionName: "get_count" } }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const firstCall = result.current.call

    rerender({ functionName: "increment" })
    await firstCall([])

    expect(callMethod).toHaveBeenLastCalledWith(
      expect.objectContaining({ functionName: "increment" })
    )
  })
})
