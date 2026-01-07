import { describe, it, expect, vi, beforeEach } from "vitest"
import { CandidAdapter } from "../../src/adapter"
import type { CandidClientManager, ReactorParser } from "../../src/types"
import { importCandidDefinition } from "../../src/utils"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "../../src/constants"
import type { Identity } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"

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

import { CanisterStatus } from "@icp-sdk/core/agent"

/**
 * Integration tests that verify the complete workflows
 */
describe("CandidAdapter Integration", () => {
  let mockAgent: any
  let mockClientManager: CandidClientManager

  beforeEach(() => {
    vi.clearAllMocks()

    mockAgent = {
      isLocal: vi.fn().mockReturnValue(false),
      query: vi.fn(),
      call: vi.fn(),
      getPrincipal: vi.fn(),
    }

    mockClientManager = {
      agent: mockAgent,
      isLocal: false,
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
  })

  describe("Full Workflow: Fetch and Parse Candid", () => {
    it("should complete full workflow with metadata and local parser", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
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
      await adapter.loadParser(mockParser)

      // Execute
      const result = await adapter.getCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      // Verify
      expect(result.idlFactory).toBeDefined()
      expect(typeof result.idlFactory).toBe("function")
      expect(CanisterStatus.request).toHaveBeenCalled()
      expect(mockParser.didToJs).toHaveBeenCalledWith(candidSource)
      // Remote should NOT be called since local parser succeeded
      expect(mockAgent.query).not.toHaveBeenCalled()
    })

    it("should complete full workflow with fallback to tmp hack and remote parser", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
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

      // Mock tmp hack success then didjs compilation
      let queryCount = 0
      mockAgent.query.mockImplementation((canisterId: string, options: any) => {
        queryCount++
        if (options.methodName === "__get_candid_interface_tmp_hack") {
          return Promise.resolve({
            reply: {
              arg: IDL.encode([IDL.Text], [candidSource]),
            },
          })
        } else if (options.methodName === "did_to_js") {
          return Promise.resolve({
            reply: {
              arg: IDL.encode([IDL.Opt(IDL.Text)], [[compiledJs]]),
            },
          })
        }
      })

      // Execute
      const result = await adapter.getCandidDefinition(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      // Verify
      expect(result.idlFactory).toBeDefined()
      expect(CanisterStatus.request).toHaveBeenCalled() // Metadata was tried
      expect(queryCount).toBe(2) // tmp hack + didjs compilation
    })
  })

  describe("ClientManager Integration", () => {
    it("should handle switching between local and IC environments", () => {
      const localClientManager: CandidClientManager = {
        agent: mockAgent,
        isLocal: true,
        subscribe: vi.fn().mockReturnValue(vi.fn()),
      }

      const icClientManager: CandidClientManager = {
        agent: mockAgent,
        isLocal: false,
        subscribe: vi.fn().mockReturnValue(vi.fn()),
      }

      // Start with local client manager
      const adapterLocal = new CandidAdapter({
        clientManager: localClientManager,
      })
      expect(adapterLocal.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)

      // Create new adapter with IC client manager
      const adapterIC = new CandidAdapter({ clientManager: icClientManager })
      expect(adapterIC.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should re-evaluate didjs ID when identity changes", () => {
      let identityCallback: ((identity: Identity) => void) | null = null

      // Start as local
      const clientManager: CandidClientManager = {
        agent: mockAgent,
        isLocal: true,
        subscribe: vi.fn().mockImplementation((callback) => {
          identityCallback = callback
          return vi.fn()
        }),
      }

      // Create adapter with local client manager (no custom didjsCanisterId)
      const adapter = new CandidAdapter({ clientManager })
      expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)

      // Simulate identity change and network switch to IC
      ;(clientManager as any).isLocal = false

      // Trigger identity change callback
      identityCallback!({} as Identity)

      // Should now use IC didjs ID
      expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
    })

    it("should not change custom didjsCanisterId on identity changes", () => {
      let identityCallback: ((identity: Identity) => void) | null = null
      const customId = "my-custom-didjs"

      const clientManager: CandidClientManager = {
        agent: mockAgent,
        isLocal: true,
        subscribe: vi.fn().mockImplementation((callback) => {
          identityCallback = callback
          return vi.fn()
        }),
      }

      // Create adapter with custom didjsCanisterId
      const adapter = new CandidAdapter({
        clientManager,
        didjsCanisterId: customId,
      })
      expect(adapter.didjsCanisterId).toBe(customId)

      // Simulate network switch
      ;(clientManager as any).isLocal = false

      // Trigger identity change
      identityCallback!({} as Identity)

      // Should still use custom ID
      expect(adapter.didjsCanisterId).toBe(customId)
    })
  })

  describe("Parser Scenarios", () => {
    it("should validate and parse complex Candid definitions", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

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

      await adapter.loadParser(mockParser)

      // Validate first
      const isValid = adapter.validateCandid(complexCandid)
      expect(isValid).toBe(true)
      expect(mockParser.validateIDL).toHaveBeenCalledWith(complexCandid)

      // Parse
      const result = adapter.compileLocal(complexCandid)
      expect(result).toBe(expectedJs)
      expect(mockParser.didToJs).toHaveBeenCalledWith(complexCandid)
    })

    it("should handle parser returning empty on invalid Candid", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })

      const mockParser: ReactorParser = {
        didToJs: vi.fn().mockReturnValue(""),
        validateIDL: vi.fn().mockReturnValue(false),
      }

      await adapter.loadParser(mockParser)

      const isValid = adapter.validateCandid("not valid candid at all")
      expect(isValid).toBe(false)

      const result = adapter.compileLocal("not valid candid at all")
      expect(result).toBe("")
    })
  })

  describe("Error Recovery Scenarios", () => {
    it("should recover from metadata failure", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const candidSource = "service { test: () -> () }"

      // Metadata fails
      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Network error")
      )

      // Tmp hack succeeds
      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Text], [candidSource]),
        },
      })

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(candidSource)
    })

    it("should recover from empty metadata", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const candidSource = "service { test: () -> () }"

      // Metadata returns empty
      ;(CanisterStatus.request as any).mockResolvedValue(
        new Map([["candid", ""]])
      )

      // Tmp hack succeeds
      mockAgent.query.mockResolvedValue({
        reply: {
          arg: IDL.encode([IDL.Text], [candidSource]),
        },
      })

      const result = await adapter.fetchCandidSource(
        "ryjl3-tyaaa-aaaaa-aaaba-cai"
      )

      expect(result).toBe(candidSource)
    })

    it("should properly report when all methods fail", async () => {
      const adapter = new CandidAdapter({ clientManager: mockClientManager })
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai"

      // All methods fail
      ;(CanisterStatus.request as any).mockRejectedValue(
        new Error("Metadata failed")
      )

      mockAgent.query.mockResolvedValue({
        reject_code: 1,
        reject_message: "Query failed",
      })

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

      result.idlFactory({ IDL: mockIDL })
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
      const clientManager: CandidClientManager = {
        agent: mockAgent,
        isLocal: false,
        subscribe: vi.fn().mockReturnValue(unsubscribeMock),
      }

      const adapter = new CandidAdapter({ clientManager })

      // Verify subscription was set up
      expect(clientManager.subscribe).toHaveBeenCalled()

      // Cleanup
      adapter.unsubscribe()
      expect(unsubscribeMock).toHaveBeenCalled()

      // Multiple calls should be safe
      expect(() => adapter.unsubscribe()).not.toThrow()
    })

    it("should handle multiple adapter instances independently", async () => {
      const clientManager1: CandidClientManager = {
        agent: mockAgent,
        isLocal: false,
        subscribe: vi.fn().mockReturnValue(vi.fn()),
      }

      const clientManager2: CandidClientManager = {
        agent: mockAgent,
        isLocal: true,
        subscribe: vi.fn().mockReturnValue(vi.fn()),
      }

      const adapter1 = new CandidAdapter({
        clientManager: clientManager1,
        didjsCanisterId: "custom-1",
      })
      const adapter2 = new CandidAdapter({
        clientManager: clientManager2,
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

      await adapter1.loadParser(parser1)
      await adapter2.loadParser(parser2)

      expect(adapter1.compileLocal("test")).toBe("js1")
      expect(adapter2.compileLocal("test")).toBe("js2")
    })
  })
})
