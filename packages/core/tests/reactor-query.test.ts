import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  ActorMethod,
  Actor,
  ActorSubclass,
  QueryResponseStatus,
} from "@icp-sdk/core/agent"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Reactor } from "../src/reactor"
import { ClientManager } from "../src/client"

type MockActor = ActorSubclass<{
  echo: ActorMethod<[string], string>
  test: ActorMethod<[bigint], void>
}>

describe("Reactor.getQueryOptions", () => {
  let reactor: Reactor<MockActor>
  let mockClientManager: ClientManager
  let mockAgent: any
  const mockCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

  // Create a real IDL factory for testing
  const testIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    return IDL.Service({
      echo: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
      test: IDL.Func([IDL.Int], [], ["query"]),
    })
  }

  // Get the service for encoding
  const service = testIdlFactory({ IDL })

  // Helper to create mock query responses with proper Candid encoding
  const createMockQueryResponse = (types: IDL.Type[], values: unknown[]) => {
    const encoded = IDL.encode(types, values)
    return {
      status: QueryResponseStatus.Replied,
      reply: { arg: encoded },
    }
  }

  beforeEach(() => {
    mockAgent = {
      getPrincipal: vi.fn(),
      query: vi.fn(),
      call: vi.fn(),
    }

    mockClientManager = {
      agent: mockAgent,
      subscribe: vi.fn(),
      registerCanisterId: vi.fn(),
      initialize: vi.fn(),
      queryClient: new QueryClient(),
    } as unknown as ClientManager

    reactor = new Reactor<MockActor>({
      name: "mock-reactor",
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })
  })

  it("should return correct query options", async () => {
    const options = reactor.getQueryOptions({
      functionName: "echo",
      args: ["argument"],
    })

    expect(options.queryKey).toEqual([mockCanisterId, "echo", '["argument"]'])
    expect(options.queryFn).toBeDefined()

    // Mock the agent.query response
    mockAgent.query.mockResolvedValue(
      createMockQueryResponse([IDL.Text], ["response"])
    )

    // Execute queryFn
    if (typeof options.queryFn !== "function") {
      throw new Error("Query function is not defined")
    }

    const result = await options.queryFn({} as any)
    expect(result).toBe("response")
    expect(mockAgent.query).toHaveBeenCalled()
  })

  it("should handle bigint args in queryKey", () => {
    const options = reactor.getQueryOptions({
      functionName: "test",
      args: [123n],
    })

    expect(options.queryKey).toEqual([mockCanisterId, "test", '["123"]'])
  })
})
