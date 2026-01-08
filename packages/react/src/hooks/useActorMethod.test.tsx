import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useActorMethod } from "./useActorMethod"
import { ActorMethod } from "@icp-sdk/core/agent"

const idlFactory = ({ IDL }: any) => {
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    transfer: IDL.Func(
      [IDL.Record({ to: IDL.Text, amount: IDL.Nat })],
      [IDL.Bool],
      []
    ),
  })
}

interface TestActor {
  greet: ActorMethod<[string], string>
  transfer: ActorMethod<[{ to: string; amount: bigint }], boolean>
}

describe("useActorMethod", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    clientManager = new ClientManager({
      queryClient,
    })

    reactor = new Reactor<TestActor>({
      clientManager,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
      name: "test",
    })

    // Mock reactor.callMethod instead of the entire agent stack
    vi.spyOn(reactor, "callMethod").mockImplementation(
      async ({ functionName, args }: any): Promise<any> => {
        if (functionName === "greet") {
          return `Hello, ${args[0]}!`
        }
        if (functionName === "transfer") {
          return true
        }
        return null
      }
    )
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("should detect query method and auto-fetch", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["world"],
        }),
      { wrapper }
    )

    expect(result.current.isQuery).toBe(true)
    expect(result.current.functionType).toBe("query")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("Hello, world!")
    expect(reactor.callMethod).toHaveBeenCalled()
  })

  it("should detect update method and not auto-fetch", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    expect(result.current.isQuery).toBe(false)
    expect(result.current.functionType).toBe("update")
    expect(result.current.isPending).toBe(false)
    expect(reactor.callMethod).not.toHaveBeenCalled()
  })

  it("should call update method when 'call' is invoked", async () => {
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
        }),
      { wrapper }
    )

    const transferArgs = { to: "alice", amount: 100n }
    await result.current.call([transferArgs])

    expect(reactor.callMethod).toHaveBeenCalled()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(true)
  })

  it("should call onSuccess callback", async () => {
    const onSuccess = vi.fn()

    renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "greet",
          args: ["admin"],
          onSuccess,
        }),
      { wrapper }
    )

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Hello, admin!"))
  })

  it("should invalidate queries on successful mutation", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const queryKey = ["test-key"]
    const { result } = renderHook(
      () =>
        useActorMethod({
          reactor,
          functionName: "transfer",
          invalidateQueries: [queryKey],
        }),
      { wrapper }
    )

    await result.current.call([{ to: "bob", amount: 50n }])

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey })
  })
})
