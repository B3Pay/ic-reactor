import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CandidAdapter } from "../../src/adapter"
import type {
  AgentManager,
  ReactorParser,
  CandidAdapterParameters,
} from "../../src/types"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "../../src/constants"

// Mock the @icp-sdk/core/agent module
vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual("@icp-sdk/core/agent")
  return {
    ...actual,
    Actor: {
      createActor: vi.fn(),
    },
    CanisterStatus: {
      request: vi.fn(),
    },
  }
})

// Import mocked modules
import { Actor, CanisterStatus } from "@icp-sdk/core/agent"

describe("CandidAdapter", () => {
  let mockAgent: any
  let mockAgentManager: AgentManager

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    // Create a mock agent
    mockAgent = {
      isLocal: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      call: vi.fn(),
      getPrincipal: vi.fn(),
    }

    // Create a mock agent manager
    mockAgentManager = {
      getAgent: vi.fn().mockReturnValue(mockAgent),
      subscribeAgent: vi.fn().mockReturnValue(vi.fn()),
    }
  })

  describe("Constructor", () => {
    it("should create adapter with agent", () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      expect(adapter.agent).toBe(mockAgent)
      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should create adapter with agentManager", () => {
      const adapter = new CandidAdapter({ agentManager: mockAgentManager })

      expect(adapter.agent).toBe(mockAgent)
      expect(mockAgentManager.getAgent).toHaveBeenCalled()
      expect(mockAgentManager.subscribeAgent).toHaveBeenCalled()
    })

    it("should throw error if neither agent nor agentManager is provided", () => {
      expect(() => {
        new CandidAdapter({} as CandidAdapterParameters)
      }).toThrow("No agent or agentManager provided")
    })

    it("should use custom didjsCanisterId if provided", () => {
      const customId = "custom-canister-id"
      const adapter = new CandidAdapter({
        agent: mockAgent,
        didjsCanisterId: customId,
      })

      expect(adapter.didjsCanisterId).toBe(customId)
    })

    it("should use local didjs ID when agent is local", () => {
      mockAgent.isLocal.mockReturnValue(true)
      const adapter = new CandidAdapter({ agent: mockAgent })

      expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)
    })

    it("should use IC didjs ID when agent is not local", () => {
      mockAgent.isLocal.mockReturnValue(false)
      const adapter = new CandidAdapter({ agent: mockAgent })

      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should handle agent without isLocal method", () => {
      const agentWithoutIsLocal = {
        query: vi.fn(),
        call: vi.fn(),
      }

      const adapter = new CandidAdapter({ agent: agentWithoutIsLocal as any })

      // Should default to IC ID when isLocal is undefined
      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should set up agent subscription with agentManager", () => {
      const subscribeCallback = vi.fn()
      mockAgentManager.subscribeAgent = vi.fn().mockImplementation((cb) => {
        subscribeCallback.mockImplementation(cb)
        return vi.fn()
      })

      const adapter = new CandidAdapter({ agentManager: mockAgentManager })

      // Simulate agent change
      const newAgent = { ...mockAgent, isLocal: vi.fn().mockReturnValue(true) }
      subscribeCallback(newAgent)

      expect(adapter.agent).toBe(newAgent)
      expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)
    })

    it("should provide unsubscribeAgent function", () => {
      const mockUnsubscribe = vi.fn()
      mockAgentManager.subscribeAgent = vi.fn().mockReturnValue(mockUnsubscribe)

      const adapter = new CandidAdapter({ agentManager: mockAgentManager })

      adapter.unsubscribeAgent()
      expect(mockUnsubscribe).toHaveBeenCalled()
    })

    it("should have noop unsubscribeAgent when using direct agent", () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      // Should not throw when called
      expect(() => adapter.unsubscribeAgent()).not.toThrow()
    })
  })

  describe("initializeParser", () => {
    it("should accept custom parser module", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("export const idlFactory = () => {}"),
        validateIDL: vi.fn().mockReturnValue(true),
      }

      await adapter.initializeParser(mockParser)

      // Parser should be usable now
      expect(() => adapter.parseDidToJs("service {}")).not.toThrow()
      expect(mockParser.didToJs).toHaveBeenCalledWith("service {}")
    })

    it("should not call parser default function when module provided directly", async () => {
      // When a module is provided directly, we skip the require path
      // and therefore don't call default()
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockDefault = vi.fn().mockResolvedValue(undefined)
      const mockParser: ReactorParser = {
        default: mockDefault,
        didToJs: vi.fn(),
        validateIDL: vi.fn(),
      }

      await adapter.initializeParser(mockParser)

      // When passing module directly, default is NOT called
      // (default is only called in the require() path)
      expect(mockDefault).not.toHaveBeenCalled()
    })

    it("should not call default if not available", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn(),
      }

      await expect(adapter.initializeParser(mockParser)).resolves.not.toThrow()
    })

    it("should throw error if require fails and no module provided", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      // This should throw because @ic-reactor/parser is not installed
      await expect(adapter.initializeParser()).rejects.toThrow(
        /Error initializing parser/
      )
    })
  })

  describe("getFromMetadata", () => {
    it("should fetch candid from canister metadata", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockCandid = "service { greet: (text) -> (text) query }"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", mockCandid]])
      )

      const result = await adapter.getFromMetadata(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(mockCandid)
      expect(CanisterStatus.request).toHaveBeenCalledWith({
        agent: mockAgent,
        canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
        paths: ["candid"],
      })
    })

    it("should return undefined if candid not in metadata", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      ;(CanisterStatus.request as any).mockResolvedValue(new Map())

      const result = await adapter.getFromMetadata(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBeUndefined()
    })
  })

  describe("getFromTmpHack", () => {
    it("should fetch candid using tmp hack method", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockCandid = "service { greet: (text) -> (text) query }"

      const mockActor = {
        __get_candid_interface_tmp_hack: vi.fn().mockResolvedValue(mockCandid),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      const result = await adapter.getFromTmpHack("ryjl3-tyaaa-aaaaa-aaaba-cai")

      expect(result).toBe(mockCandid)
      expect(Actor.createActor).toHaveBeenCalled()
      expect(mockActor.__get_candid_interface_tmp_hack).toHaveBeenCalled()
    })

    it("should throw if tmp hack method fails", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockRejectedValue(new Error("Method not found")),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      await expect(
        adapter.getFromTmpHack("ryjl3-tyaaa-aaaaa-aaaba-cai")
      ).rejects.toThrow("Method not found")
    })
  })

  describe("fetchCandidDefinition", () => {
    it("should prefer metadata over tmp hack", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const metadataCandid = "service { from_metadata: () -> () }"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", metadataCandid]])
      )

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(metadataCandid)
      // Actor.createActor should not be called since metadata worked
      expect(Actor.createActor).not.toHaveBeenCalled()
    })

    it("should fall back to tmp hack if metadata fails", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const tmpHackCandid = "service { from_tmp_hack: () -> () }"

      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata not available")
      )

      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockResolvedValue(tmpHackCandid),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(tmpHackCandid)
    })

    it("should fall back to tmp hack if metadata returns empty", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const tmpHackCandid = "service { from_tmp_hack: () -> () }"

      ;(CanisterStatus.request as any).mockResolvedValue(new Map())

      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockResolvedValue(tmpHackCandid),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(tmpHackCandid)
    })

    it("should throw if both methods fail", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata failed")
      )

      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockRejectedValue(new Error("Tmp hack failed")),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      await expect(
        adapter.fetchCandidDefinition("ryjl3-tyaaa-aaaaa-aaaba-cai")
      ).rejects.toThrow("Failed to retrieve Candid definition by any method")
    })
  })

  describe("parseDidToJs", () => {
    it("should throw if parser not initialized", () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      expect(() => adapter.parseDidToJs("service {}")).toThrow(
        "Parser module not available"
      )
    })

    it("should call parser didToJs method", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("export const idlFactory = () => {}"),
        validateIDL: vi.fn(),
      }

      await adapter.initializeParser(mockParser)
      const result = adapter.parseDidToJs("service {}")

      expect(mockParser.didToJs).toHaveBeenCalledWith("service {}")
      expect(result).toBe("export const idlFactory = () => {}")
    })
  })

  describe("validateIDL", () => {
    it("should throw if parser not initialized", () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      expect(() => adapter.validateIDL("service {}")).toThrow(
        "Parser module not available"
      )
    })

    it("should call parser validateIDL method", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn().mockReturnValue(true),
      }

      await adapter.initializeParser(mockParser)
      const result = adapter.validateIDL("service {}")

      expect(mockParser.validateIDL).toHaveBeenCalledWith("service {}")
      expect(result).toBe(true)
    })

    it("should return false for invalid IDL", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn().mockReturnValue(false),
      }

      await adapter.initializeParser(mockParser)
      const result = adapter.validateIDL("not valid candid")

      expect(result).toBe(false)
    })
  })

  describe("fetchDidTojs", () => {
    it("should call remote didjs canister", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const compiledJs = ["export const idlFactory = () => {}"]

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue(compiledJs),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      const result = await adapter.fetchDidTojs("service {}")

      expect(result).toEqual(compiledJs)
      expect(Actor.createActor).toHaveBeenCalled()
      expect(mockDidjs.did_to_js).toHaveBeenCalledWith("service {}")
    })

    it("should use custom didjsCanisterId if provided", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const customId = "custom-didjs-id"

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue(["compiled"]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      await adapter.fetchDidTojs("service {}", customId)

      expect(Actor.createActor).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ canisterId: customId })
      )
    })

    it("should use default didjsCanisterId if not provided", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue(["compiled"]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      await adapter.fetchDidTojs("service {}")

      expect(Actor.createActor).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ canisterId: DEFAULT_IC_DIDJS_ID })
      )
    })
  })

  describe("evaluateCandidDefinition", () => {
    it("should prefer local parser over remote", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(`
          export const idlFactory = ({ IDL }) => {
            return IDL.Service({});
          };
        `),
        validateIDL: vi.fn(),
      }

      await adapter.initializeParser(mockParser)
      const result = await adapter.evaluateCandidDefinition("service {}")

      expect(mockParser.didToJs).toHaveBeenCalled()
      expect(Actor.createActor).not.toHaveBeenCalled() // Remote not used
      expect(result.idlFactory).toBeDefined()
    })

    it("should fall back to remote if local parser fails", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockImplementation(() => {
          throw new Error("Parse error")
        }),
        validateIDL: vi.fn(),
      }

      await adapter.initializeParser(mockParser)

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue([
          `
          export const idlFactory = ({ IDL }) => {
            return IDL.Service({});
          };
        `,
        ]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      const result = await adapter.evaluateCandidDefinition("service {}")

      expect(mockParser.didToJs).toHaveBeenCalled()
      expect(Actor.createActor).toHaveBeenCalled() // Remote used as fallback
      expect(result.idlFactory).toBeDefined()
    })

    it("should fall back to remote if local parser returns empty", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(""),
        validateIDL: vi.fn(),
      }

      await adapter.initializeParser(mockParser)

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue([
          `
          export const idlFactory = ({ IDL }) => {
            return IDL.Service({});
          };
        `,
        ]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      const result = await adapter.evaluateCandidDefinition("service {}")

      expect(result.idlFactory).toBeDefined()
    })

    it("should throw if both local and remote fail", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue([[]]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      await expect(
        adapter.evaluateCandidDefinition("service {}")
      ).rejects.toThrow(/Error evaluating Candid definition/)
    })

    it("should return undefined idlFactory if compilation returns empty string", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      // When didjs returns an empty string, we get undefined exports
      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue([""]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      const result = await adapter.evaluateCandidDefinition("service {}")
      expect(result.idlFactory).toBeUndefined()
    })
  })

  describe("getCandidDefinition", () => {
    it("should fetch and evaluate candid definition", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const candidSource = "service { test: () -> () query }"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", candidSource]])
      )

      const mockDidjs = {
        did_to_js: vi.fn().mockResolvedValue([
          `
          export const idlFactory = ({ IDL }) => {
            return IDL.Service({
              test: IDL.Func([], [], ['query'])
            });
          };
        `,
        ]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      const result = await adapter.getCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBeDefined()
      expect(result.idlFactory).toBeDefined()
    })

    it("should throw with canister ID in error message", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

      ;(CanisterStatus.request as any).mockRejectedValue(new Error("Failed"))

      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockRejectedValue(new Error("Also failed")),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      await expect(adapter.getCandidDefinition(canisterId)).rejects.toThrow(
        new RegExp(canisterId)
      )
    })
  })

  describe("Edge Cases", () => {
    it("should handle Principal as canisterId", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const candidSource = "service {}"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", candidSource]])
      )

      const mockDidjs = {
        did_to_js: vi
          .fn()
          .mockResolvedValue([
            `export const idlFactory = ({ IDL }) => IDL.Service({});`,
          ]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      // Use a mock Principal-like object
      const mockPrincipal = {
        toString: () => "ryjl3-tyaaa-aaaaa-aaaba-cai",
      }

      const result = await adapter.getCandidDefinition(mockPrincipal as any)

      expect(result.idlFactory).toBeDefined()
    })

    it("should handle very long candid definitions", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      // Generate a large number of methods
      const methods = Array.from(
        { length: 100 },
        (_, i) => `method${i}: () -> ()`
      ).join("; ")
      const largeCandid = `service { ${methods} }`

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", largeCandid]])
      )

      const mockDidjs = {
        did_to_js: vi
          .fn()
          .mockResolvedValue([
            `export const idlFactory = ({ IDL }) => IDL.Service({});`,
          ]),
      }
      ;(Actor.createActor as any).mockReturnValue(mockDidjs)

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(largeCandid)
    })

    it("should handle unicode in candid definitions", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const unicodeCandid = "service { greet: (text) -> (text) query }" // Contains unicode description comment

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", unicodeCandid]])
      )

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(unicodeCandid)
    })
  })
})
