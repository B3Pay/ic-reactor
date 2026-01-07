import { describe, it, expect, expectTypeOf } from "vitest"
import type {
  CanisterId,
  AgentManager,
  CandidAdapterParameters,
  CandidDefinition,
  ReactorParser,
} from "../../src/types"
import type { HttpAgent } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { IDL } from "@icp-sdk/core/candid"

describe("Types", () => {
  describe("CanisterId", () => {
    it("should accept string type", () => {
      const canisterId: CanisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"
      expect(typeof canisterId).toBe("string")
    })

    it("should accept Principal-like type", () => {
      // Mock Principal for testing
      const mockPrincipal = {
        toString: () => "ryjl3-tyaaa-aaaaa-aaaba-cai",
        toUint8Array: () => new Uint8Array(),
        toText: () => "ryjl3-tyaaa-aaaaa-aaaba-cai",
      } as unknown as Principal

      const canisterId: CanisterId = mockPrincipal
      expect(canisterId).toBeDefined()
    })
  })

  describe("AgentManager", () => {
    it("should define required methods", () => {
      const mockAgentManager: AgentManager = {
        getAgent: () =>
          ({
            query: () => Promise.resolve({}),
            call: () => Promise.resolve({}),
          }) as unknown as HttpAgent,
        subscribeAgent: (callback) => {
          // Return unsubscribe function
          return () => {}
        },
      }

      expect(typeof mockAgentManager.getAgent).toBe("function")
      expect(typeof mockAgentManager.subscribeAgent).toBe("function")
    })

    it("should return HttpAgent from getAgent", () => {
      const mockAgent = {
        query: () => Promise.resolve({}),
        call: () => Promise.resolve({}),
      } as unknown as HttpAgent

      const mockAgentManager: AgentManager = {
        getAgent: () => mockAgent,
        subscribeAgent: () => () => {},
      }

      const agent = mockAgentManager.getAgent()
      expect(agent).toBe(mockAgent)
    })

    it("should return unsubscribe function from subscribeAgent", () => {
      let subscribed = true
      const mockAgentManager: AgentManager = {
        getAgent: () => ({}) as HttpAgent,
        subscribeAgent: (callback) => {
          return () => {
            subscribed = false
          }
        },
      }

      const unsubscribe = mockAgentManager.subscribeAgent(() => {})
      expect(typeof unsubscribe).toBe("function")

      unsubscribe()
      expect(subscribed).toBe(false)
    })
  })

  describe("CandidAdapterParameters", () => {
    it("should allow agent only", () => {
      const params: CandidAdapterParameters = {
        agent: {} as HttpAgent,
      }

      expect(params.agent).toBeDefined()
      expect(params.agentManager).toBeUndefined()
    })

    it("should allow agentManager only", () => {
      const params: CandidAdapterParameters = {
        agentManager: {
          getAgent: () => ({}) as HttpAgent,
          subscribeAgent: () => () => {},
        },
      }

      expect(params.agentManager).toBeDefined()
      expect(params.agent).toBeUndefined()
    })

    it("should allow optional didjsCanisterId", () => {
      const params: CandidAdapterParameters = {
        agent: {} as HttpAgent,
        didjsCanisterId: "custom-canister-id",
      }

      expect(params.didjsCanisterId).toBe("custom-canister-id")
    })

    it("should allow all parameters", () => {
      const params: CandidAdapterParameters = {
        agent: {} as HttpAgent,
        agentManager: {
          getAgent: () => ({}) as HttpAgent,
          subscribeAgent: () => () => {},
        },
        didjsCanisterId: "custom-id",
      }

      expect(params.agent).toBeDefined()
      expect(params.agentManager).toBeDefined()
      expect(params.didjsCanisterId).toBeDefined()
    })
  })

  describe("CandidDefinition", () => {
    it("should have required idlFactory", () => {
      const mockIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
        return IDL.Service({})
      }

      const definition: CandidDefinition = {
        idlFactory: mockIdlFactory,
      }

      expect(typeof definition.idlFactory).toBe("function")
    })

    it("should have optional init", () => {
      const mockIdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
        return IDL.Service({})
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockInit = (args: { IDL: any }) => {
        return [args.IDL.Text]
      }

      const definition: CandidDefinition = {
        idlFactory: mockIdlFactory,
        init: mockInit,
      }

      expect(definition.init).toBeDefined()
      expect(typeof definition.init).toBe("function")
    })

    it("should allow undefined init", () => {
      const definition: CandidDefinition = {
        idlFactory: ({ IDL }) => IDL.Service({}),
      }

      expect(definition.init).toBeUndefined()
    })
  })

  describe("ReactorParser", () => {
    it("should have required didToJs method", () => {
      const parser: ReactorParser = {
        didToJs: (source: string) => `export const idlFactory = () => {}`,
        validateIDL: (source: string) => true,
      }

      expect(typeof parser.didToJs).toBe("function")
      expect(parser.didToJs("service {}")).toContain("idlFactory")
    })

    it("should have required validateIDL method", () => {
      const parser: ReactorParser = {
        didToJs: (source: string) => "",
        validateIDL: (source: string) => true,
      }

      expect(typeof parser.validateIDL).toBe("function")
      expect(parser.validateIDL("service {}")).toBe(true)
    })

    it("should have optional default method", () => {
      const parser: ReactorParser = {
        default: async () => {},
        didToJs: (source: string) => "",
        validateIDL: (source: string) => true,
      }

      expect(typeof parser.default).toBe("function")
    })

    it("should allow undefined default method", () => {
      const parser: ReactorParser = {
        didToJs: (source: string) => "",
        validateIDL: (source: string) => true,
      }

      expect(parser.default).toBeUndefined()
    })
  })
})
