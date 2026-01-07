import { describe, it, expect, beforeAll } from "vitest"
import { CandidAdapter } from "../../src/adapter"
import type { CandidClientManager } from "../../src/types"
import { HttpAgent, Actor } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

/**
 * E2E tests that make real calls to the IC mainnet.
 * These tests verify the CandidAdapter works against live canisters.
 *
 * Known canisters used for testing:
 * - ICP Ledger: ryjl3-tyaaa-aaaaa-aaaba-cai
 * - NNS Governance: rrkah-fqaaa-aaaaa-aaaaq-cai
 * - Internet Identity: rdmx6-jaaaa-aaaaa-aaadq-cai
 */
describe("CandidAdapter E2E", () => {
  let clientManager: CandidClientManager
  let adapter: CandidAdapter

  beforeAll(async () => {
    // Create a real agent pointing to IC mainnet
    const agent = await HttpAgent.create({
      host: "https://ic0.app",
    })

    // Create a minimal client manager
    clientManager = {
      agent,
      isLocal: false,
      subscribe: () => () => {},
    }

    adapter = new CandidAdapter({ clientManager })
  })

  describe("Fetching Candid from live canisters", () => {
    it("should fetch candid source from ICP Ledger canister", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      const candidSource = await adapter.fetchCandidSource(canisterId)

      expect(candidSource).toBeDefined()
      expect(typeof candidSource).toBe("string")
      expect(candidSource.length).toBeGreaterThan(0)

      // ICP Ledger should have these methods
      expect(candidSource).toContain("icrc1_balance_of")
      expect(candidSource).toContain("icrc1_transfer")
      expect(candidSource).toContain("account_balance")

      console.log(
        `✅ ICP Ledger Candid fetched: ${candidSource.length} characters`
      )
    }, 30000) // 30 second timeout for network calls

    it("should fetch candid source from Internet Identity canister", async () => {
      const canisterId = "rdmx6-jaaaa-aaaaa-aaadq-cai" // Internet Identity

      const candidSource = await adapter.fetchCandidSource(canisterId)

      expect(candidSource).toBeDefined()
      expect(typeof candidSource).toBe("string")
      expect(candidSource.length).toBeGreaterThan(0)

      // Internet Identity should have these methods
      expect(candidSource).toContain("prepare_delegation")

      console.log(
        `✅ Internet Identity Candid fetched: ${candidSource.length} characters`
      )
    }, 30000)

    it("should fetch candid from metadata (preferred method)", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      const candidSource = await adapter.fetchFromMetadata(canisterId)

      expect(candidSource).toBeDefined()
      expect(typeof candidSource).toBe("string")
      expect(candidSource!.length).toBeGreaterThan(0)

      console.log(`✅ Metadata fetch successful: ${candidSource!.length} chars`)
    }, 30000)
  })

  describe("Compiling Candid via didjs canister", () => {
    it("should compile simple candid to JavaScript via remote didjs", async () => {
      const simpleCandid = `
        service : {
          greet : (text) -> (text) query;
        }
      `

      const jsCode = await adapter.compileRemote(simpleCandid)

      expect(jsCode).toBeDefined()
      expect(typeof jsCode).toBe("string")
      expect(jsCode!.length).toBeGreaterThan(0)

      // Should contain idlFactory export
      expect(jsCode).toContain("idlFactory")
      expect(jsCode).toContain("IDL.Service")
      expect(jsCode).toContain("greet")

      console.log(`✅ Remote compilation successful`)
      console.log(`   Output preview: ${jsCode!.substring(0, 200)}...`)
    }, 30000)

    it("should compile complex candid with types via remote didjs", async () => {
      const complexCandid = `
        type User = record {
          id : nat64;
          name : text;
          email : opt text;
        };
        
        type Result = variant {
          Ok : User;
          Err : text;
        };
        
        service : {
          create_user : (text) -> (Result);
          get_user : (nat64) -> (Result) query;
          list_users : () -> (vec User) query;
        }
      `

      const jsCode = await adapter.compileRemote(complexCandid)

      expect(jsCode).toBeDefined()
      expect(jsCode!.length).toBeGreaterThan(0)

      // Should contain type definitions
      expect(jsCode).toContain("IDL.Record")
      expect(jsCode).toContain("IDL.Variant")
      expect(jsCode).toContain("IDL.Vec")

      console.log(`✅ Complex candid compiled successfully`)
    }, 30000)
  })

  describe("Full workflow: Fetch and Parse", () => {
    it("should get complete CandidDefinition from ICP Ledger", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      const definition = await adapter.getCandidDefinition(canisterId)

      expect(definition).toBeDefined()
      expect(definition.idlFactory).toBeDefined()
      expect(typeof definition.idlFactory).toBe("function")

      // Call the idlFactory to verify it works
      const mockIDL = {
        Service: (methods: any) => ({ _methods: methods }),
        Func: (...args: any[]) => ({ _args: args }),
        Record: (fields: any) => ({ _fields: fields }),
        Variant: (cases: any) => ({ _cases: cases }),
        Vec: (t: any) => ({ _vec: t }),
        Opt: (t: any) => ({ _opt: t }),
        Nat: { _type: "nat" },
        Nat8: { _type: "nat8" },
        Nat64: { _type: "nat64" },
        Int: { _type: "int" },
        Text: { _type: "text" },
        Bool: { _type: "bool" },
        Principal: { _type: "principal" },
        Null: { _type: "null" },
        Empty: { _type: "empty" },
        Reserved: { _type: "reserved" },
        Tuple: (...args: any[]) => ({ _tuple: args }),
      }

      const service = definition.idlFactory({ IDL: mockIDL as any })
      expect(service).toBeDefined()

      console.log(`✅ Full workflow completed for ICP Ledger`)
      console.log(`   idlFactory is callable: ${typeof definition.idlFactory}`)
      console.log(`   init function: ${definition.init ? "present" : "absent"}`)
    }, 60000) // 60 second timeout for full workflow
  })

  describe("Error handling", () => {
    it("should throw for non-existent canister", async () => {
      const fakeCanisterId = "aaaaa-aa" // Non-existent

      await expect(adapter.fetchCandidSource(fakeCanisterId)).rejects.toThrow()

      console.log(`✅ Error handling works for non-existent canister`)
    }, 30000)
  })

  describe("Performance baseline", () => {
    it("should fetch and parse within reasonable time", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      const startTime = Date.now()
      const definition = await adapter.getCandidDefinition(canisterId)
      const endTime = Date.now()

      const duration = endTime - startTime

      expect(definition.idlFactory).toBeDefined()
      expect(duration).toBeLessThan(30000) // Should complete within 30 seconds

      console.log(`✅ Full fetch & parse completed in ${duration}ms`)
    }, 60000)
  })

  describe("Using Candid to call canister methods", () => {
    it("should call icrc1_balance_of on ICP Ledger", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      // Step 1: Fetch the Candid definition
      const { idlFactory } = await adapter.getCandidDefinition(canisterId)

      // Step 2: Create an actor using the fetched idlFactory
      const ledger = Actor.createActor(idlFactory, {
        agent: clientManager.agent,
        canisterId,
      })

      // Step 3: Call icrc1_balance_of for the anonymous principal
      // Anonymous principal will have 0 balance, but this proves the call works!
      const account = {
        owner: Principal.anonymous(),
        subaccount: [],
      }

      const balance = await (ledger as any).icrc1_balance_of(account)

      expect(balance).toBeDefined()
      expect(typeof balance).toBe("bigint")
      expect(balance).toBeGreaterThanOrEqual(0n)

      console.log(`✅ icrc1_balance_of called successfully!`)
      console.log(`   Balance: ${balance} e8s`)
    }, 60000)

    it("should call icrc1_name and icrc1_symbol on ICP Ledger", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      // Fetch and create actor
      const { idlFactory } = await adapter.getCandidDefinition(canisterId)
      const ledger = Actor.createActor(idlFactory, {
        agent: clientManager.agent,
        canisterId,
      })

      // Call icrc1_name
      const name = await (ledger as any).icrc1_name()
      expect(name).toBe("Internet Computer")

      // Call icrc1_symbol
      const symbol = await (ledger as any).icrc1_symbol()
      expect(symbol).toBe("ICP")

      // Call icrc1_decimals
      const decimals = await (ledger as any).icrc1_decimals()
      expect(decimals).toBe(8)

      console.log(`✅ ICRC-1 metadata retrieved:`)
      console.log(`   Name: ${name}`)
      console.log(`   Symbol: ${symbol}`)
      console.log(`   Decimals: ${decimals}`)
    }, 60000)

    it("should check balance of a known account (DFINITY Foundation)", async () => {
      const canisterId = "ryjl3-tyaaa-aaaaa-aaaba-cai" // ICP Ledger

      // Fetch and create actor
      const { idlFactory } = await adapter.getCandidDefinition(canisterId)
      const ledger = Actor.createActor(idlFactory, {
        agent: clientManager.agent,
        canisterId,
      })

      // DFINITY Foundation's principal (public knowledge)
      // We'll use NNS governance canister as owner - it typically holds ICP
      const nnsGovernance = Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai")

      const account = {
        owner: nnsGovernance,
        subaccount: [],
      }

      const balance = await (ledger as any).icrc1_balance_of(account)

      expect(balance).toBeDefined()
      expect(typeof balance).toBe("bigint")

      // Convert to ICP (8 decimals)
      const icpBalance = Number(balance) / 100_000_000

      console.log(`✅ NNS Governance canister balance:`)
      console.log(`   Raw: ${balance} e8s`)
      console.log(`   ICP: ${icpBalance.toLocaleString()} ICP`)
    }, 60000)
  })
})
