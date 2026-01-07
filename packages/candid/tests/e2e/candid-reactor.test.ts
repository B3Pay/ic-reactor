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

  it("should perform dynamic query using signature", async () => {
    const name = await reactor.queryDynamic({
      functionName: "icrc1_name",
      candid: "() -> (text) query",
    })
    expect(name).toBe("Internet Computer")
    console.log(`✅ Dynamic query successful: ${name}`)
  })

  it("should fail gracefully if dynamic method name doesn't match signature", async () => {
    await expect(
      reactor.queryDynamic({
        functionName: "wrong_method",
        candid: "() -> (text) query",
      })
    ).rejects.toThrow(/Canister has no query method 'wrong_method'/)
  })
})
