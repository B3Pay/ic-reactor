import { describe, it, expect, beforeAll } from "vitest"
import { CandidReactor } from "../../src/reactor"
import { ActorMethod, HttpAgent } from "@icp-sdk/core/agent"
import { ClientManager } from "@ic-reactor/core"

interface TestActor {
  icrc1_name: ActorMethod<[], string>
  icrc1_symbol: ActorMethod<[], string>
}

describe("CandidReactor E2E", () => {
  let reactor: CandidReactor<TestActor>
  let agent: HttpAgent

  beforeAll(() => {
    agent = HttpAgent.createSync({ host: "https://ic0.app" })
    const clientManager = {
      agent,
      registerCanisterId: () => {},
      subscribe: () => () => {},
      queryClient: {
        invalidateQueries: () => {},
        ensureQueryData: () => {},
        getQueryData: () => {},
      },
    } as unknown as ClientManager

    // ICP Ledger Canister
    reactor = new CandidReactor<TestActor>({
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      clientManager,
    })
  })

  it("should initialize by fetching Candid definition from network", async () => {
    // Before init, service should be empty (dummy service)
    const initialService = reactor.getServiceInterface()
    expect(initialService._fields).toHaveLength(0)

    await reactor.initialize()

    // After init, service should have methods
    const service = reactor.getServiceInterface()
    expect(service._fields.length).toBeGreaterThan(0)
    console.log("✅ Mainnet IDL fetched. Method count:", service._fields.length)
  })

  it("should register a dynamic method and call it using standard Reactor methods", async () => {
    // Register a method dynamically
    await reactor.registerMethod({
      functionName: "icrc1_name",
      candid: "() -> (text) query",
    })

    // Verify it's registered
    expect(reactor.hasMethod("icrc1_name")).toBe(true)

    // Use standard Reactor callMethod
    const name = await reactor.callMethod({
      functionName: "icrc1_name" as any,
    })

    expect(name).toBe("Internet Computer")
    console.log(`✅ Standard callMethod successful: ${name}`)
  })

  it("should fail to register method with wrong signature", async () => {
    await expect(
      reactor.registerMethod({
        functionName: "wrong_method_name",
        candid: "service : { actual_method : () -> (text) query }",
      })
    ).rejects.toThrow('Method "wrong_method_name" not found')
  })

  it("should list all registered method names", async () => {
    const methodNames = reactor.getMethodNames()
    expect(methodNames).toContain("icrc1_name")
    console.log("✅ Registered methods:", methodNames.slice(0, 5), "...")
  })

  it("should perform one-shot dynamic query with queryDynamic", async () => {
    // Use queryDynamic for a one-shot call (registers + calls in one step)
    const symbol = await reactor.queryDynamic<string>({
      functionName: "icrc1_symbol",
      candid: "() -> (text) query",
    })

    expect(symbol).toBe("ICP")
    console.log(`✅ queryDynamic successful: ${symbol}`)
  })
})
