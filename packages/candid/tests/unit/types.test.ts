import { describe, it, expect } from "vitest"
import type {
  CandidClientManager,
  CandidAdapterParameters,
  CandidDefinition,
  ReactorParser,
} from "../../src/types"
import type { HttpAgent } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { IDL } from "@icp-sdk/core/candid"
import type { CanisterId } from "@ic-reactor/core"

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

  describe("CandidClientManager", () => {
    it("should define required properties", () => {
      const mockClientManager: CandidClientManager = {
        agent: {
          query: () => Promise.resolve({}),
          call: () => Promise.resolve({}),
        } as unknown as HttpAgent,
        isLocal: false,
        subscribe: (callback) => () => {},
      }

      expect(mockClientManager.agent).toBeDefined()
      expect(typeof mockClientManager.isLocal).toBe("boolean")
      expect(typeof mockClientManager.subscribe).toBe("function")
    })

    it("should return HttpAgent from agent property", () => {
      const mockAgent = {
        query: () => Promise.resolve({}),
        call: () => Promise.resolve({}),
      } as unknown as HttpAgent

      const mockClientManager: CandidClientManager = {
        agent: mockAgent,
        isLocal: false,
        subscribe: () => () => {},
      }

      expect(mockClientManager.agent).toBe(mockAgent)
    })

    it("should return unsubscribe function from subscribe", () => {
      let subscribed = true
      const mockClientManager: CandidClientManager = {
        agent: {} as HttpAgent,
        isLocal: false,
        subscribe: (callback) => {
          return () => {
            subscribed = false
          }
        },
      }

      const unsubscribe = mockClientManager.subscribe(() => {})
      expect(typeof unsubscribe).toBe("function")

      unsubscribe()
      expect(subscribed).toBe(false)
    })

    it("should have isLocal property", () => {
      const localClientManager: CandidClientManager = {
        agent: {} as HttpAgent,
        isLocal: true,
        subscribe: () => () => {},
      }

      const icClientManager: CandidClientManager = {
        agent: {} as HttpAgent,
        isLocal: false,
        subscribe: () => () => {},
      }

      expect(localClientManager.isLocal).toBe(true)
      expect(icClientManager.isLocal).toBe(false)
    })
  })

  describe("CandidAdapterParameters", () => {
    it("should require clientManager", () => {
      const params: CandidAdapterParameters = {
        clientManager: {
          agent: {} as HttpAgent,
          isLocal: false,
          subscribe: () => () => {},
        },
      }

      expect(params.clientManager).toBeDefined()
    })

    it("should allow optional didjsCanisterId", () => {
      const params: CandidAdapterParameters = {
        clientManager: {
          agent: {} as HttpAgent,
          isLocal: false,
          subscribe: () => () => {},
        },
        didjsCanisterId: "custom-canister-id",
      }

      expect(params.didjsCanisterId).toBe("custom-canister-id")
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
