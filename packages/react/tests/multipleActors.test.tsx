import { describe, it, expect, vi } from "vitest"
import { createActorHooks } from "../src"
import { ClientManager, DisplayReactor, Reactor } from "@ic-reactor/core"
import { renderHook, waitFor } from "@testing-library/react"
import { Actor, ActorMethod } from "@icp-sdk/core/agent"
import { QueryClientProvider, QueryClient } from "@tanstack/react-query"
import React from "react"

// Mock IDL factory
const idlFactory = ({ IDL }: any) => {
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })
}

// Define Actor Interface
interface MyActor {
  greet: ActorMethod<[string], string>
}

vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual<typeof import("@icp-sdk/core/agent")>(
    "@icp-sdk/core/agent"
  )
  return {
    ...actual,
    Actor: class extends actual.Actor {
      static createActor = vi.fn()
      static canisterIdOf = vi
        .fn()
        .mockReturnValue({ toString: () => "test-canister" })
      static agentOf = vi.fn().mockReturnValue({
        replaceIdentity: vi.fn(),
      })
    },
  }
})

describe("createReactor with multiple actors", () => {
  // Setup mock implementation
  const mockActor = {
    greet: vi.fn().mockResolvedValue("Hello, test"),
  }

  ;(Actor.createActor as any).mockReturnValue(mockActor)

  // Prevent ClientManager from trying to connect to network
  vi.spyOn(ClientManager.prototype, "initializeAgent").mockResolvedValue()

  it("should initialize multiple actors and allow access via getActor", async () => {
    const queryClient = new QueryClient()
    const clientManager = new ClientManager({ queryClient })

    const actor1 = new Reactor<MyActor>({
      clientManager,
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
      name: "actor1",
    })

    const actor2 = new DisplayReactor<MyActor>({
      clientManager,
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
      name: "actor2",
    })

    // Spy on callMethod to return mocked data
    vi.spyOn(actor1, "callMethod").mockResolvedValue("Hello, test")
    vi.spyOn(actor2, "callMethod").mockResolvedValue("Hello, test 2")

    const { useActorQuery: useActorQuery1 } = createActorHooks(actor1)
    const { useActorQuery: useActorQuery2 } = createActorHooks(actor2)

    const { result } = renderHook(
      () => useActorQuery1({ functionName: "greet", args: ["test"] }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    )
    await waitFor(() => expect(result.current.data).toBe("Hello, test"))

    expect(useActorQuery1).toBeDefined()

    const { result: result2 } = renderHook(
      () => useActorQuery2({ functionName: "greet", args: ["test"] }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    )
    await waitFor(() => expect(result2.current.data).toBe("Hello, test 2"))

    expect(useActorQuery2).toBeDefined()
  })
})
