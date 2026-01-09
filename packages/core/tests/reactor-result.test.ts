import { describe, it, expect, vi, beforeEach } from "vitest"
import { Actor, ActorMethod, QueryResponseStatus } from "@icp-sdk/core/agent"
import { QueryClient } from "@tanstack/query-core"
import { BaseActor } from "../src/types/reactor"
import { IDL } from "@icp-sdk/core/candid"
import { CanisterError, isCanisterError } from "../src/errors"
import { ClientManager } from "../src/client"
import { Reactor } from "../src/reactor"

// Mock Actor module - we still need this for the legacy actor path
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

describe("Reactor autoCodecs with Result Unwrapping", () => {
  // With display transform:
  // 1. Type Transformation: BigInt -> string, Principal -> string, etc.
  // 2. Result Unwrapping: Ok value is extracted, Err throws CanisterError

  type TestActor = BaseActor<{
    successMethod: ActorMethod<[], { Ok: string } | { Err: string }>
    failureMethod: ActorMethod<[], { Ok: string } | { Err: string }>
    plainMethod: ActorMethod<[], string>
    complexOk: ActorMethod<
      [],
      { Ok: { id: string; name: string } } | { Err: string }
    >
  }>

  let mockClientManager: ClientManager
  let mockAgent: any
  const mockCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

  // Create a real IDL factory for testing
  const testIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    const Result = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text })
    const ComplexResult = IDL.Variant({
      Ok: IDL.Record({ id: IDL.Text, name: IDL.Text }),
      Err: IDL.Text,
    })
    return IDL.Service({
      successMethod: IDL.Func([], [Result], ["query"]),
      failureMethod: IDL.Func([], [Result], ["query"]),
      plainMethod: IDL.Func([], [IDL.Text], ["query"]),
      complexOk: IDL.Func([], [ComplexResult], ["query"]),
    })
  }

  // Helper to create mock query responses with proper Candid encoding
  const createMockQueryResponse = (types: IDL.Type[], value: unknown) => {
    const encoded = IDL.encode(types, [value])
    return {
      status: QueryResponseStatus.Replied,
      reply: { arg: encoded },
    }
  }

  // Get the result types from the service
  const service = testIdlFactory({ IDL })
  const getReturnTypes = (methodName: string): IDL.Type[] => {
    const field = service._fields.find(([name]) => name === methodName)
    return field ? field[1].retTypes : []
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

    vi.clearAllMocks()
  })

  it("should transform AND unwrap Ok result when autoCodecs is true", async () => {
    const reactor = new Reactor<TestActor, "display">({
      name: "test-reactor",
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })

    // Mock agent.query to return properly encoded Candid response
    mockAgent.query.mockResolvedValue(
      createMockQueryResponse(getReturnTypes("successMethod"), {
        Ok: "success-value",
      })
    )

    const result = await reactor.callMethod({
      functionName: "successMethod",
    })

    // Expect the extracted Ok value (unwrapped)
    expect(result).toBe("success-value")
  })

  it("should throw CanisterError with typed err when autoCodecs is true", async () => {
    const reactor = new Reactor<TestActor, "display">({
      name: "test-reactor",
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })

    mockAgent.query.mockResolvedValue(
      createMockQueryResponse(getReturnTypes("failureMethod"), {
        Err: "error-message",
      })
    )

    // Expect the method to throw CanisterError
    try {
      await reactor.callMethod({
        functionName: "failureMethod",
      })
      expect.fail("Should have thrown")
    } catch (error) {
      expect(isCanisterError(error)).toBe(true)
      expect((error as CanisterError).err).toBe("error-message")
      expect((error as CanisterError).message).toContain("error-message")
    }
  })

  it("should ALSO unwrap when autoCodecs is false (extractOkResult always runs)", async () => {
    const reactor = new Reactor<TestActor>({
      name: "test-reactor",
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })

    mockAgent.query.mockResolvedValue(
      createMockQueryResponse(getReturnTypes("successMethod"), {
        Ok: "success-value",
      })
    )

    const result = await reactor.callMethod({
      functionName: "successMethod",
    })

    // extractOkResult is now always called, so Result is always unwrapped
    expect(result).toBe("success-value")
  })

  it("should return plain results unchanged when autoCodecs is true", async () => {
    const reactor = new Reactor<TestActor, "display">({
      name: "test-reactor",
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })

    mockAgent.query.mockResolvedValue(
      createMockQueryResponse(getReturnTypes("plainMethod"), "plain-value")
    )

    const result = await reactor.callMethod({
      functionName: "plainMethod",
    })

    expect(result).toBe("plain-value")
  })

  it("should transform AND unwrap complex Ok objects", async () => {
    const reactor = new Reactor<TestActor, "display">({
      name: "test-reactor",
      clientManager: mockClientManager,
      canisterId: mockCanisterId,
      idlFactory: testIdlFactory,
    })

    mockAgent.query.mockResolvedValue(
      createMockQueryResponse(getReturnTypes("complexOk"), {
        Ok: { id: "123", name: "Alice" },
      })
    )

    const result = await reactor.callMethod({
      functionName: "complexOk",
    })

    // Expect the extracted, unwrapped Ok value
    expect(result).toEqual({ id: "123", name: "Alice" })
  })
})
