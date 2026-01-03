import { describe, it, expect, vi, beforeEach } from "vitest"
import { Actor, ActorMethod, QueryResponseStatus } from "@icp-sdk/core/agent"
import { QueryClient } from "@tanstack/query-core"
import { Principal } from "@icp-sdk/core/principal"
import { IDL } from "@icp-sdk/core/candid"
import { BaseActor } from "../src/types/reactor"
import { ClientManager } from "../src/client"
import { Reactor } from "../src/reactor"

// Mock Actor module - still needed for legacy actor initialization path
vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual("@icp-sdk/core/agent")
  return {
    ...actual,
    Actor: {
      createActor: vi.fn(),
      agentOf: vi.fn(),
      canisterIdOf: vi.fn(),
      interfaceOf: vi.fn(),
    },
  }
})

describe("Reactor Constructor", () => {
  let mockClientManager: ClientManager
  const mockCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"
  const mockPrincipal = Principal.fromText(mockCanisterId)

  // Create a real IDL factory for testing
  const mockIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    return IDL.Service({
      testMethod: IDL.Func([], [IDL.Text], ["query"]),
    })
  }

  beforeEach(() => {
    mockClientManager = {
      agent: {
        getPrincipal: vi.fn(),
        query: vi.fn(),
        call: vi.fn(),
      },
      subscribe: vi.fn(),
      registerCanisterId: vi.fn(),
      initialize: vi.fn(),
      queryClient: new QueryClient(),
    } as unknown as ClientManager

    vi.clearAllMocks()
  })

  it("should initialize with provided actor and extract metadata", () => {
    const mockService = mockIdlFactory({ IDL })
    const mockActor = {} as any

    // Mock Actor helper methods for legacy actor path
    ;(Actor.canisterIdOf as any).mockReturnValue(mockPrincipal)
    ;(Actor.interfaceOf as any).mockReturnValue(mockService)

    const reactor = new Reactor({
      clientManager: mockClientManager,
      actor: mockActor,
    })

    expect(reactor.canisterId.toString()).toBe(mockCanisterId)
    expect(reactor.service).toBe(mockService)

    expect(Actor.canisterIdOf).toHaveBeenCalled()
    expect(Actor.interfaceOf).toHaveBeenCalled()
  })

  it("should throw error if actor not provided and missing requirements", () => {
    expect(() => {
      new Reactor({
        clientManager: mockClientManager,
      } as any)
    }).toThrow("Either actor or canisterId and idlFactory are required")
  })

  it("should initialize with idlFactory and canisterId", () => {
    const reactor = new Reactor({
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: mockIdlFactory,
    })

    expect(reactor.canisterId.toString()).toBe(mockCanisterId)
    expect(reactor.service).toBeDefined()
    expect(reactor.service._fields.length).toBeGreaterThan(0)
  })
})

describe("Reactor Method Calls", () => {
  type TestActor = BaseActor<{
    testMethod: ActorMethod<[], string>
  }>

  let mockClientManager: ClientManager
  let reactor: Reactor<TestActor>
  let mockAgent: any
  const mockCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

  // Create a real IDL factory for testing
  const testIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    return IDL.Service({
      testMethod: IDL.Func([], [IDL.Text], ["query"]),
    })
  }

  // Helper to create mock query responses with proper Candid encoding
  const createMockQueryResponse = (value: string) => {
    const encoded = IDL.encode([IDL.Text], [value])
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

    reactor = new Reactor<TestActor>({
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })

    // Spy on fetchQuery
    vi.spyOn(mockClientManager.queryClient, "fetchQuery")
  })

  it("callMethod should NOT use fetchQuery and call agent.query directly", async () => {
    mockAgent.query.mockResolvedValue(createMockQueryResponse("success"))

    const result = await reactor.callMethod({ functionName: "testMethod" })

    expect(mockClientManager.queryClient.fetchQuery).not.toHaveBeenCalled()
    expect(mockAgent.query).toHaveBeenCalled()
    expect(result).toBe("success")
  })
})
