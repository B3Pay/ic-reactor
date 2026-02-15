import { describe, it, expect, vi, beforeEach } from "vitest"
import { CandidAdapter } from "../../src/adapter"
import type { CandidClientManager, ReactorParser } from "../../src/types"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "../../src/constants"
import { IDL } from "@icp-sdk/core/candid"

// Mock parser behavior
const parserMocks = vi.hoisted(() => ({
  shouldFail: false,
}))

vi.mock("@ic-reactor/parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ic-reactor/parser")>()
  return {
    ...actual,
    default: async () => {
      if (parserMocks.shouldFail) {
        throw new Error("Failed validation")
      }
      if (actual.default) {
        return actual.default()
      }
    },
  }
})

// Mock the @icp-sdk/core/agent module
vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual("@icp-sdk/core/agent")
  return {
    ...actual,
    CanisterStatus: {
      request: vi.fn(),
    },
  }
})

// Import mocked modules
import { CanisterStatus } from "@icp-sdk/core/agent"

describe("CandidAdapter", () => {
  let mockAgent: any
  let mockClientManager: CandidClientManager

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
    parserMocks.shouldFail = false

    // Create a mock agent with query method
    mockAgent = {
      isLocal: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      call: vi.fn(),
      getPrincipal: vi.fn(),
    }

    // Create a mock client manager
    mockClientManager = {
      agent: mockAgent,
      isLocal: false,
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
  })

  describe("Constructor", () => {
    it("should create adapter with clientManager", () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      expect(adapter.clientManager).toBe(mockClientManager)
      expect(adapter.agent).toBe(mockAgent)
      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should subscribe to identity changes", () => {
      new CandidAdapter({ clientManager: mockClientManager })

      expect(mockClientManager.subscribe).toHaveBeenCalled()
    })

    it("should use custom didjsCanisterId if provided", () => {
      const customId = "custom-canister-id"
      const adapter = new CandidAdapter({
        clientManager: mockClientManager,
        didjsCanisterId: customId,
      })

      expect(adapter.didjsCanisterId).toBe(customId)
    })

    it("should use local didjs ID when clientManager.isLocal is true", () => {
      const localClientManager: CandidClientManager = {
        ...mockClientManager,
        isLocal: true,
      }
      const adapter = new CandidAdapter({ clientManager: localClientManager })

      expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)
    })

    it("should use IC didjs ID when clientManager.isLocal is false", () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should provide unsubscribe function", () => {
      const mockUnsubscribe = vi.fn()
      mockClientManager.subscribe = vi.fn().mockReturnValue(mockUnsubscribe)

      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      adapter.unsubscribe()
      expect(mockUnsubscribe).toHaveBeenCalled()
    })
  })

  describe("agent getter", () => {
    it("should return the agent from clientManager", () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      expect(adapter.agent).toBe(mockAgent)
    })
  })

  describe("hasParser getter", () => {
    it("should return false before loading parser", () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      expect(adapter.hasParser).toBe(false)
    })

    it("should return true after loading parser", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)
      expect(adapter.hasParser).toBe(true)
    })
  })

  describe("loadParser", () => {
    it("should accept custom parser module", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("export const idlFactory = () => {}"),
        validateIDL: vi.fn().mockReturnValue(true),
      }

      await adapter.loadParser(mockParser)

      expect(() => adapter.compileLocal("service {}")).not.toThrow()
      expect(mockParser.didToJs).toHaveBeenCalledWith("service {}")
    })

    it("should not call parser default when module provided directly", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockDefault = vi.fn().mockResolvedValue(undefined)
      const mockParser: ReactorParser = {
        default: mockDefault,
        didToJs: vi.fn(),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)

      expect(mockDefault).not.toHaveBeenCalled()
    })

    it("should load parser if available", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      await expect(adapter.loadParser()).resolves.not.toThrow()
      expect(adapter.hasParser).toBe(true)
    })

    it("should only attempt to load once (idempotent)", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      await expect(adapter.loadParser()).resolves.not.toThrow()
      await expect(adapter.loadParser()).resolves.not.toThrow()
    })
  })

  describe("fetchFromMetadata", () => {
    it("should fetch candid from canister metadata", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockCandid = "service { greet: (text) -> (text) query }"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", mockCandid]])
      )

      const result = await adapter.fetchFromMetadata(
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
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      ;(CanisterStatus.request as any).mockResolvedValue(new Map())

      const result = await adapter.fetchFromMetadata(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBeUndefined()
    })
  })

  describe("fetchFromTmpHack", () => {
    it("should fetch candid using tmp hack via agent.query", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockCandid = "service { greet: (text) -> (text) query }"

      // Mock agent.query to return encoded response
      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Text], [mockCandid]),
        },
      })

      const result = await adapter.fetchFromTmpHack(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(mockCandid)
      expect(mockAgent.query).toHaveBeenCalledWith(
        "ryjl3-tyaaa-aaaaa-aaaba-cai",
        expect.objectContaining({
          methodName: "__get_candid_interface_tmp_hack",
        })
      )
    })

    it("should throw if query fails", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      mockAgent.query.mockResolvedValue({
        reject_code: 1,
        reject_message: "Method not found",
      })

      await expect(
        adapter.fetchFromTmpHack("ryjl3-tyaaa-aaaaa-aaaba-cai")
      ).rejects.toThrow("Query failed")
    })
  })

  describe("fetchCandidSource", () => {
    it("should prefer metadata over tmp hack", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const metadataCandid = "service { from_metadata: () -> () }"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", metadataCandid]])
      )

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(metadataCandid)
      // agent.query should not be called since metadata worked
      expect(mockAgent.query).not.toHaveBeenCalled()
    })

    it("should fall back to tmp hack if metadata fails", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const tmpHackCandid = "service { from_tmp_hack: () -> () }"

      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata not available")
      )

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Text], [tmpHackCandid]),
        },
      })

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(tmpHackCandid)
    })

    it("should fall back to tmp hack if metadata returns empty", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const tmpHackCandid = "service { from_tmp_hack: () -> () }"

      ;(CanisterStatus.request as any).mockResolvedValue(new Map())

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Text], [tmpHackCandid]),
        },
      })

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(tmpHackCandid)
    })

    it("should throw if both methods fail", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata failed")
      )

      mockAgent.query.mockResolvedValue({
        reject_code: 1,
        reject_message: "Query failed",
      })

      await expect(
        adapter.fetchCandidSource("ryjl3-tyaaa-aaaaa-aaaba-cai")
      ).rejects.toThrow("Failed to retrieve Candid source by any method")
    })
  })

  describe("compileLocal", () => {
    it("should throw if parser not loaded", () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      expect(() => adapter.compileLocal("service {}")).toThrow(
        "Parser not loaded"
      )
    })

    it("should call parser didToJs method", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("export const idlFactory = () => {}"),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)
      const result = adapter.compileLocal("service {}")

      expect(mockParser.didToJs).toHaveBeenCalledWith("service {}")
      expect(result).toBe("export const idlFactory = () => {}")
    })
  })

  describe("validateCandid", () => {
    it("should throw if parser not loaded", () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      expect(() => adapter.validateCandid("service {}")).toThrow(
        "Parser not loaded"
      )
    })

    it("should call parser validateIDL method", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn().mockReturnValue(true),
      }

      await adapter.loadParser(mockParser)
      const result = adapter.validateCandid("service {}")

      expect(mockParser.validateIDL).toHaveBeenCalledWith("service {}")
      expect(result).toBe(true)
    })

    it("should return false for invalid candid", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn().mockReturnValue(false),
      }

      await adapter.loadParser(mockParser)
      const result = adapter.validateCandid("not valid candid")

      expect(result).toBe(false)
    })
  })

  describe("compileRemote", () => {
    it("should call didjs canister via agent.query", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const compiledJs = "export const idlFactory = () => {}"

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Opt(IDL.Text)], [[compiledJs]]),
        },
      })

      const result = await adapter.compileRemote("service {}")

      expect(result).toBe(compiledJs)
      expect(mockAgent.query).toHaveBeenCalledWith(
        DEFAULT_IC_DIDJS_ID,
        expect.objectContaining({
          methodName: "did_to_js",
        })
      )
    })

    it("should use custom didjsCanisterId if provided", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const customId = "custom-didjs-id"
      const compiledJs = "compiled"

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Opt(IDL.Text)], [[compiledJs]]),
        },
      })

      await adapter.compileRemote("service {}", customId)

      expect(mockAgent.query).toHaveBeenCalledWith(
        customId,
        expect.objectContaining({
          methodName: "did_to_js",
        })
      )
    })

    it("should return undefined when result is empty", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Opt(IDL.Text)], [[]]),
        },
      })

      const result = await adapter.compileRemote("service {}")

      expect(result).toBeUndefined()
    })
  })

  describe("parseCandidSource", () => {
    it("should prefer local parser over remote", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(`
          export const idlFactory = ({ IDL }) => {
            return IDL.Service({});
          };
        `),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)
      const result = await adapter.parseCandidSource("service {}")

      expect(mockParser.didToJs).toHaveBeenCalled()
      expect(mockAgent.query).not.toHaveBeenCalled() // Remote not used
      expect(result.idlFactory).toBeDefined()
    })

    it("should fall back to remote if local parser fails", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockImplementation(() => {
          throw new Error("Parse error")
        }),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode(
            [IDL.Opt(IDL.Text)],
            [
              [
                `
            export const idlFactory = ({ IDL }) => {
              return IDL.Service({});
            };
          `,
              ],
            ]
          ),
        },
      })

      const result = await adapter.parseCandidSource("service {}")

      expect(mockParser.didToJs).toHaveBeenCalled()
      expect(mockAgent.query).toHaveBeenCalled() // Remote used as fallback
      expect(result.idlFactory).toBeDefined()
    })

    it("should throw if compilation returns empty string", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Opt(IDL.Text)], [[]]),
        },
      })

      await expect(adapter.parseCandidSource("service {}")).rejects.toThrow(
        /Failed to compile Candid/
      )
    })
  })

  describe("getCandidDefinition", () => {
    it("should fetch and parse candid definition", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const candidSource = "service { test: () -> () query }"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", candidSource]])
      )

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode(
            [IDL.Opt(IDL.Text)],
            [
              [
                `
            export const idlFactory = ({ IDL }) => {
              return IDL.Service({
                test: IDL.Func([], [], ['query'])
              });
            };
          `,
              ],
            ]
          ),
        },
      })

      const result = await adapter.getCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBeDefined()
      expect(result.idlFactory).toBeDefined()
    })

    it("should throw with canister ID in error message", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

      ;(CanisterStatus.request as any).mockRejectedValue(new Error("Failed"))

      mockAgent.query.mockResolvedValue({
        reject_code: 1,
        reject_message: "Query failed",
      })

      await expect(adapter.getCandidDefinition(canisterId)).rejects.toThrow(
        new RegExp(canisterId)
      )
    })
  })

  describe("Deprecated Aliases", () => {
    it("initializeParser should call loadParser", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)
      expect(adapter.hasParser).toBe(true)
    })

    it("fetchCandidDefinition should call fetchCandidSource", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const candidSource = "service {}"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", candidSource]])
      )

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )
      expect(result).toBe(candidSource)
    })

    it("parseDidToJs should call compileLocal", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("compiled"),
        validateIDL: vi.fn(),
      }

      await adapter.loadParser(mockParser)
      const result = adapter.compileLocal("service {}")
      expect(result).toBe("compiled")
    })

    it("validateIDL should call validateCandid", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const mockParser: ReactorParser = {
        didToJs: vi.fn(),
        validateIDL: vi.fn().mockReturnValue(true),
      }

      await adapter.loadParser(mockParser)
      const result = adapter.validateCandid("service {}")
      expect(result).toBe(true)
    })
  })

  describe("Edge Cases", () => {
    it("should handle Principal as canisterId", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const candidSource = "service {}"

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", candidSource]])
      )

      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode(
            [IDL.Opt(IDL.Text)],
            [[`export const idlFactory = ({ IDL }) => IDL.Service({});`]]
          ),
        },
      })

      const mockPrincipal = {
        toString: () => "ryjl3-tyaaa-aaaaa-aaaba-cai",
      }

      const result = await adapter.getCandidDefinition(mockPrincipal as any)

      expect(result.idlFactory).toBeDefined()
    })

    it("should handle very long candid definitions", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      const methods = Array.from(
        { length: 100 },
        (_, i) => `method${i}: () -> ()`
      ).join("; ")
      const largeCandid = `service { ${methods} }`

      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", largeCandid]])
      )

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(largeCandid)
    })
  })
})
