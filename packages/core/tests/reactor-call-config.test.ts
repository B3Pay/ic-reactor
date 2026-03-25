import { beforeEach, describe, expect, it, vi } from "vitest"
import { ActorMethod, QueryResponseStatus } from "@icp-sdk/core/agent"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client"
import { Reactor } from "../src/reactor"
import type { BaseActor } from "../src/types/reactor"
import * as agentUtils from "../src/utils/agent"

vi.mock("../src/utils/agent", async () => {
  const actual =
    await vi.importActual<typeof import("../src/utils/agent")>(
      "../src/utils/agent"
    )

  return {
    ...actual,
    processUpdateCallResponse: vi.fn(async () =>
      IDL.encode([IDL.Text], ["ok"])
    ),
  }
})

describe("Reactor callConfig overrides", () => {
  type TestActor = BaseActor<{
    readName: ActorMethod<[], string>
    writeName: ActorMethod<[], string>
  }>

  const defaultCanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"
  const overrideCanisterId = "rrkah-fqaaa-aaaaa-aaaaq-cai"

  const testIdlFactory: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
      readName: IDL.Func([], [IDL.Text], ["query"]),
      writeName: IDL.Func([], [IDL.Text], []),
    })

  const createMockQueryResponse = (value: string) => {
    const encoded = IDL.encode([IDL.Text], [value])
    return {
      status: QueryResponseStatus.Replied,
      reply: { arg: encoded },
    }
  }

  let defaultAgent: any
  let overrideAgent: any
  let reactor: Reactor<TestActor>

  beforeEach(() => {
    defaultAgent = {
      rootKey: new Uint8Array([1]),
      getPrincipal: vi.fn(),
      query: vi.fn(),
      call: vi.fn(),
    }

    overrideAgent = {
      rootKey: new Uint8Array([2]),
      getPrincipal: vi.fn(),
      query: vi.fn(),
      call: vi.fn(),
    }

    const clientManager = {
      agent: defaultAgent,
      subscribe: vi.fn(),
      registerCanisterId: vi.fn(),
      initialize: vi.fn(),
      queryClient: new QueryClient(),
    } as unknown as ClientManager

    reactor = new Reactor<TestActor>({
      name: "test-reactor",
      clientManager,
      canisterId: defaultCanisterId,
      idlFactory: testIdlFactory,
    })

    vi.clearAllMocks()
  })

  it("uses callConfig.canisterId and callConfig.agent for query calls", async () => {
    overrideAgent.query.mockResolvedValue(createMockQueryResponse("query-ok"))

    const result = await reactor.callMethod({
      functionName: "readName",
      callConfig: {
        canisterId: overrideCanisterId,
        agent: overrideAgent,
      },
    })

    expect(result).toBe("query-ok")
    expect(defaultAgent.query).not.toHaveBeenCalled()
    expect(overrideAgent.query).toHaveBeenCalledWith(
      Principal.from(overrideCanisterId),
      {
        methodName: "readName",
        arg: IDL.encode([], []),
        effectiveCanisterId: Principal.from(overrideCanisterId),
      }
    )
  })

  it("uses callConfig canisterId, agent, and pollingOptions for update calls", async () => {
    overrideAgent.call.mockResolvedValue({
      requestId: new Uint8Array([1, 2, 3]),
      response: {
        ok: true,
        status: 202,
        statusText: "Accepted",
        body: null,
        headers: [],
      },
    })

    const pollingOptions = {
      preSignReadStateRequest: true,
    }

    const result = await reactor.callMethod({
      functionName: "writeName",
      callConfig: {
        canisterId: overrideCanisterId,
        agent: overrideAgent,
        pollingOptions,
      },
    })

    expect(result).toBe("ok")
    expect(defaultAgent.call).not.toHaveBeenCalled()
    expect(overrideAgent.call).toHaveBeenCalledWith(
      Principal.from(overrideCanisterId),
      {
        methodName: "writeName",
        arg: IDL.encode([], []),
        effectiveCanisterId: Principal.from(overrideCanisterId),
        nonce: undefined,
      }
    )
    expect(agentUtils.processUpdateCallResponse).toHaveBeenCalledWith(
      expect.any(Object),
      Principal.from(overrideCanisterId),
      "writeName",
      overrideAgent,
      pollingOptions
    )
  })
})
