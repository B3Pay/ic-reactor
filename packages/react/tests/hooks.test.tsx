import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import React from "react"
import { createActorHooks, createAuthHooks } from "../src"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"

// Mock dependencies
vi.mock("@ic-reactor/core", async () => {
  const actual = await vi.importActual("@ic-reactor/core")
  return {
    ...actual,
    Reactor: vi.fn().mockImplementation(function (this: any, config: any) {
      this.clientManager = config.clientManager
      this.getQueryOptions = vi.fn().mockReturnValue({
        queryKey: ["test", "greet"],
        queryFn: vi.fn().mockResolvedValue("Hello, World!"),
      })
      this.callMethod = vi.fn().mockResolvedValue("Hello, World!")
    }),
  }
})

type TestActor = {
  greet: ActorMethod<[], string>
  updateGreet: ActorMethod<[string], string>
}

describe("hooks", () => {
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({ queryClient })

  const reactor = new Reactor<TestActor>({
    clientManager,
    canisterId: "test-canister",
    idlFactory: ({ IDL }: any) =>
      IDL.Service({
        greet: IDL.Func([], [IDL.Text], ["query"]),
        updateGreet: IDL.Func([IDL.Text], [IDL.Text], ["update"]),
      }),
  })

  // getHooks logic
  const { useActorQuery, useActorMutation } = createActorHooks(reactor)
  const { useAuth, useUserPrincipal } = createAuthHooks(clientManager)

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it("should initialize hooks", () => {
    expect(useActorQuery).toBeDefined()
    expect(useActorMutation).toBeDefined()
    expect(useAuth).toBeDefined()
    expect(useUserPrincipal).toBeDefined()
  })

  it("should provide auth hook functionality", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.login).toBeDefined()
    expect(result.current.logout).toBeDefined()
    expect(result.current.authenticate).toBeDefined()
  })

  it("should provide actor specific hooks", () => {
    expect(useActorQuery).toBeDefined()
    expect(useActorMutation).toBeDefined()
  })

  it("should execute useActorQuery correctly", async () => {
    const { result } = renderHook(
      () =>
        useActorQuery({
          functionName: "greet",
          select: (data: string) => data.length,
        }),
      {
        wrapper,
      }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // expect(result.current.data).toBe("Hello, World!")
    expect(result.current.data).toBe(13)
  })

  it("should execute useActorMutation correctly", async () => {
    const { result } = renderHook(
      () => useActorMutation({ functionName: "updateGreet" }),
      {
        wrapper,
      }
    )

    await result.current.mutateAsync(["Hello, World!"])

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
      expect(result.current.data).toBe("Hello, World!")
    })
  })
})
