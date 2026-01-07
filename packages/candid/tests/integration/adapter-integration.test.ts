import { describe, it, expect, vi, beforeEach } from "vitest"
import { CandidAdapter } from "../../src/adapter"
import type { ReactorParser } from "../../src/types"
import { importCandidDefinition } from "../../src/utils"
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

import { Actor, CanisterStatus, HttpAgent } from "@icp-sdk/core/agent"

/**
 * Integration tests that verify the complete workflows
 */
describe("CandidAdapter Integration", () => {
  let mockAgent: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockAgent = {
      isLocal: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      call: vi.fn(),
      getPrincipal: vi.fn(),
    }
  })

  describe("Full Workflow: Fetch and Parse Candid", () => {
    it("should complete full workflow with metadata and local parser", async () => {
      // Setup
      const adapter = new CandidAdapter({ agent: mockAgent })
      const candidSource = `service { greet: (text) -> (text) query }`

      // Mock metadata retrieval
      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", candidSource]])
      )

      // Mock local parser
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(`
          export const idlFactory = ({ IDL }) => {
            return IDL.Service({
              greet: IDL.Func([IDL.Text], [IDL.Text], ['query'])
            });
          };
        `),
        validateIDL: vi.fn().mockReturnValue(true),
      }
      await adapter.initializeParser(mockParser)

      // Execute
      const result = await adapter.getCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      // Verify
      expect(result.idlFactory).toBeDefined()
      expect(typeof result.idlFactory).toBe("function")
      expect(CanisterStatus.request).toHaveBeenCalled()
      expect(mockParser.didToJs).toHaveBeenCalledWith(candidSource)
      // Remote didjs should NOT be called since local parser succeeded
      expect(Actor.createActor).not.toHaveBeenCalled()
    })

    it("should complete full workflow with fallback to tmp hack and remote parser", async () => {
      // Setup
      const adapter = new CandidAdapter({ agent: mockAgent })
      const candidSource = `service { ping: () -> () query }`
      const compiledJs = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            ping: IDL.Func([], [], ['query'])
          });
        };
      `

      // Mock metadata failure
      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata not available")
      )

      // Mock tmp hack success
      const mockTmpHackActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockResolvedValue(candidSource),
      }

      // Mock didjs remote compilation
      const mockDidjsActor = {
        did_to_js: vi.fn().mockResolvedValue([compiledJs]),
      }

      // Setup Actor.createActor to return different actors based on call
      let callCount = 0
      ;(Actor.createActor as any).mockImplementation(() => {
        callCount++
        if (callCount === 1) return mockTmpHackActor
        return mockDidjsActor
      })

      // Execute
      const result = await adapter.getCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      // Verify
      expect(result.idlFactory).toBeDefined()
      expect(CanisterStatus.request).toHaveBeenCalled() // Metadata was tried
      expect(
        mockTmpHackActor.__get_candid_interface_tmp_hack
      ).toHaveBeenCalled() // Fallback to tmp hack
      expect(mockDidjsActor.did_to_js).toHaveBeenCalledWith(candidSource) // Remote compilation
    })
  })

  describe("Agent Switching Scenarios", () => {
    it("should handle switching between local and IC agents", () => {
      const localAgent = {
        isLocal: vi.fn().mockReturnValue(true),
        query: vi.fn(),
        call: vi.fn(),
        getPrincipal: vi.fn(),
      } as unknown as HttpAgent

      const icAgent = {
        isLocal: vi.fn().mockReturnValue(false),
        query: vi.fn(),
        call: vi.fn(),
        getPrincipal: vi.fn(),
      } as unknown as HttpAgent

      // Start with local agent
      const adapter = new CandidAdapter({ agent: localAgent })
      expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)

      // Create new adapter with IC agent
      const adapter2 = new CandidAdapter({ agent: icAgent })
      expect(adapter2.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should update didjs ID when agent changes via manager", () => {
      let agentCallback: ((agent: HttpAgent) => void) | null = null

      const localAgent = {
        isLocal: vi.fn().mockReturnValue(true),
        query: vi.fn(),
      } as unknown as HttpAgent

      const icAgent = {
        isLocal: vi.fn().mockReturnValue(false),
        query: vi.fn(),
      } as unknown as HttpAgent

      const mockAgentManager = {
        getAgent: vi.fn().mockReturnValue(localAgent),
        subscribeAgent: vi.fn().mockImplementation((callback) => {
          agentCallback = callback
          return vi.fn()
        }),
      }

      // Create adapter with local agent
      const adapter = new CandidAdapter({ agentManager: mockAgentManager })
      expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)

      // Simulate agent change to IC
      agentCallback!(icAgent)

      expect(adapter.agent).toBe(icAgent)
      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })
  })

  describe("Parser Scenarios", () => {
    it("should validate and parse complex Candid definitions", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      const complexCandid = `
        type User = record {
          id: nat64;
          name: text;
          email: opt text;
          created_at: int;
        };
        
        type UserResult = variant {
          Ok: User;
          Err: text;
        };
        
        service : {
          create_user: (text) -> (UserResult);
          get_user: (nat64) -> (UserResult) query;
          list_users: () -> (vec User) query;
          delete_user: (nat64) -> (UserResult);
        }
      `

      const expectedJs = `
        export const idlFactory = ({ IDL }) => {
          const User = IDL.Record({
            id: IDL.Nat64,
            name: IDL.Text,
            email: IDL.Opt(IDL.Text),
            created_at: IDL.Int
          });
          const UserResult = IDL.Variant({
            Ok: User,
            Err: IDL.Text
          });
          return IDL.Service({
            create_user: IDL.Func([IDL.Text], [UserResult], []),
            get_user: IDL.Func([IDL.Nat64], [UserResult], ['query']),
            list_users: IDL.Func([], [IDL.Vec(User)], ['query']),
            delete_user: IDL.Func([IDL.Nat64], [UserResult], [])
          });
        };
      `

      // Mock parser
      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(expectedJs),
        validateIDL: vi.fn().mockReturnValue(true),
      }

      await adapter.initializeParser(mockParser)

      // Validate first
      const isValid = adapter.validateIDL(complexCandid)
      expect(isValid).toBe(true)
      expect(mockParser.validateIDL).toHaveBeenCalledWith(complexCandid)

      // Parse
      const result = adapter.parseDidToJs(complexCandid)
      expect(result).toBe(expectedJs)
      expect(mockParser.didToJs).toHaveBeenCalledWith(complexCandid)
    })

    it("should handle parser returning empty on invalid Candid", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })

      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(""),
        validateIDL: vi.fn().mockReturnValue(false),
      }

      await adapter.initializeParser(mockParser)

      const isValid = adapter.validateIDL("not valid candid at all")
      expect(isValid).toBe(false)

      const result = adapter.parseDidToJs("not valid candid at all")
      expect(result).toBe("")
    })
  })

  describe("Error Recovery Scenarios", () => {
    it("should recover from metadata failure", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const candidSource = "service { test: () -> () }"

      // First call fails (metadata)
      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Network error")
      )

      // Second call succeeds (tmp hack)
      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockResolvedValue(candidSource),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(candidSource)
    })

    it("should recover from empty metadata", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const candidSource = "service { test: () -> () }"

      // Metadata returns empty
      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", ""]])
      )

      // Tmp hack succeeds
      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockResolvedValue(candidSource),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      const result = await adapter.fetchCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(candidSource)
    })

    it("should properly report when all methods fail", async () => {
      const adapter = new CandidAdapter({ agent: mockAgent })
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

      // All methods fail
      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata failed")
      )

      const mockActor = {
        __get_candid_interface_tmp_hack: vi
          .fn()
          .mockRejectedValue(new Error("Tmp hack failed")),
      }
      ;(Actor.createActor as any).mockReturnValue(mockActor)

      await expect(adapter.getCandidDefinition(canisterId)).rejects.toThrow(
        /Error fetching canister/
      )
    })
  })

  describe("Dynamic Import Scenarios", () => {
    it("should successfully import and use idlFactory", async () => {
      const candidJs = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            multiply: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Nat], ['query'])
          });
        };
      `

      const result = await importCandidDefinition(candidJs)

      expect(result.idlFactory).toBeDefined()
      expect(typeof result.idlFactory).toBe("function")

      // Actually call the factory to verify it works
      const mockIDL: any = {
        Service: vi.fn().mockReturnValue({ _fields: [] }),
        Func: vi.fn().mockReturnValue({}),
        Nat: {},
      }

      const service = result.idlFactory({ IDL: mockIDL })
      expect(mockIDL.Service).toHaveBeenCalled()
    })

    it("should handle init function for canisters with init args", async () => {
      const candidJsWithInit = `
        export const idlFactory = ({ IDL }) => {
          return IDL.Service({
            greet: IDL.Func([IDL.Text], [IDL.Text], ['query'])
          });
        };
        export const init = ({ IDL }) => {
          return [IDL.Text, IDL.Nat];
        };
      `

      const result = await importCandidDefinition(candidJsWithInit)

      expect(result.idlFactory).toBeDefined()
      expect(result.init).toBeDefined()
      expect(typeof result.init).toBe("function")

      // Verify init returns expected types
      const mockIDL: any = {
        Text: "text",
        Nat: "nat",
      }

      const initArgs = result.init!({ IDL: mockIDL })
      expect(Array.isArray(initArgs)).toBe(true)
      expect(initArgs).toEqual(["text", "nat"])
    })
  })

  describe("Memory and Cleanup", () => {
    it("should properly cleanup subscriptions", () => {
      const unsubscribeMock = vi.fn()
      const mockAgentManager = {
        getAgent: vi.fn().mockReturnValue(mockAgent),
        subscribeAgent: vi.fn().mockReturnValue(unsubscribeMock),
      }

      const adapter = new CandidAdapter({ agentManager: mockAgentManager })

      // Verify subscription was set up
      expect(mockAgentManager.subscribeAgent).toHaveBeenCalled()

      // Cleanup
      adapter.unsubscribeAgent()
      expect(unsubscribeMock).toHaveBeenCalled()

      // Multiple calls should be safe
      expect(() => adapter.unsubscribeAgent()).not.toThrow()
    })

    it("should handle multiple adapter instances independently", async () => {
      const adapter1 = new CandidAdapter({
        agent: mockAgent,
        didjsCanisterId: "custom-1",
      })
      const adapter2 = new CandidAdapter({
        agent: mockAgent,
        didjsCanisterId: "custom-2",
      })

      expect(adapter1.didjsCanisterId).toBe("custom-1")
      expect(adapter2.didjsCanisterId).toBe("custom-2")

      // Initialize parsers independently
      const parser1: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("js1"),
        validateIDL: vi.fn(),
      }
      const parser2: ReactorParser = {
        didToJs: vi.fn().mockReturnValue("js2"),
        validateIDL: vi.fn(),
      }

      await adapter1.initializeParser(parser1)
      await adapter2.initializeParser(parser2)

      expect(adapter1.parseDidToJs("test")).toBe("js1")
      expect(adapter2.parseDidToJs("test")).toBe("js2")
    })
  })
})
