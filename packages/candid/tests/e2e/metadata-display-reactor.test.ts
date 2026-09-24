import { describe, it, expect, beforeAll } from "vitest"
import { ClientManager } from "@ic-reactor/core"
import { ActorMethod, ActorSubclass, HttpAgent } from "@icp-sdk/core/agent"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"

type TestActor = ActorSubclass<{
  icrc1_name: ActorMethod<[], string>
  icrc1_symbol: ActorMethod<[], string>
  icrc1_fee: ActorMethod<[], bigint>
}>

// These tests call the ICP ledger on mainnet through a boundary node, and a
// slow or dropped response is not a failure of this package, so they retry
// like the other files here. The Candid is fetched inside the tests, not in
// beforeAll: Vitest retries a failed test but never a failed hook, so one slow
// response in the hook failed every test in the describe (#716).
describe("MetadataDisplayReactor E2E", { retry: 2 }, () => {
  let reactor: MetadataDisplayReactor<TestActor>
  let initialized: Promise<void> | undefined

  /** Fetch the Candid once; a failed fetch is forgotten so a retry refetches. */
  function ready(): Promise<void> {
    initialized ??= reactor.initialize().catch((error: unknown) => {
      initialized = undefined
      throw error
    })
    return initialized
  }

  beforeAll(() => {
    const agent = HttpAgent.createSync({ host: "https://ic0.app" })
    const clientManager = {
      agent,
      registerCanisterId: () => {},
      subscribe: () => () => {},
      queryClient: {
        invalidateQueries: () => Promise.resolve(),
        ensureQueryData: () => Promise.resolve(undefined),
        getQueryData: () => undefined,
      },
    } as unknown as ClientManager

    // ICP Ledger Canister
    reactor = new MetadataDisplayReactor<TestActor>({
      name: "icp-ledger",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      clientManager,
    })
  })

  it("should initialize from mainnet and generate metadata", async () => {
    await ready()

    // Verify methods are loaded
    const methodNames = reactor.getMethodNames()
    expect(methodNames.length).toBeGreaterThan(0)
    console.log("✅ Mainnet methods loaded:", methodNames.length)

    // Verify metadata is generated
    expect(reactor.getAllInputMeta()).not.toBeNull()
    expect(reactor.getAllOutputMeta()).not.toBeNull()
  }, 30_000)

  it("should have correct metadata for icrc1_name", async () => {
    await ready()

    const argMeta = reactor.getInputMeta("icrc1_name")
    expect(argMeta).toBeDefined()
    expect(argMeta!.args).toHaveLength(0)
    expect(argMeta!.functionType).toBe("query")

    const resultMeta = reactor.getOutputMeta("icrc1_name")
    expect(resultMeta).toBeDefined()
    expect(resultMeta!.returns).toHaveLength(1)
    expect(resultMeta!.returns[0].type).toBe("text")
  }, 30_000)

  it("should call method and return transformed result", async () => {
    await ready()

    const result = await reactor.callMethod({
      functionName: "icrc1_name",
    })
    expect(result.results[0].value).toBe("Internet Computer")
  }, 30_000)

  it("should call method with metadata using callDynamicWithMeta", async () => {
    await ready()

    await reactor.registerMethod({
      functionName: "icrc1_symbol",
      candid: "() -> (text) query",
    })

    const { result, meta } = await reactor.callDynamicWithMeta({
      functionName: "icrc1_symbol",
      candid: "() -> (text) query",
    })

    expect((result as any).results[0].value).toBe("ICP")
    expect(meta).toBeDefined()
    expect(meta.returns).toHaveLength(1)
    expect(meta.returns[0].type).toBe("text")
    console.log(
      "✅ callDynamicWithMeta result:",
      (result as any).results[0].value
    )
  }, 30_000)

  it("should return balance as string (display transformation)", async () => {
    await ready()

    const fee = await reactor.callDynamic({
      functionName: "icrc1_fee",
      candid: "() -> (nat) query",
    })
    console.log(
      "✅ icrc1_fee result:",
      JSON.stringify(fee, (_, v) => (typeof v === "bigint" ? `${v}n` : v), 2)
    )

    // Fee should be transformed to string (display format)
    expect(typeof (fee as any).results[0].value).toBe("string")
    console.log("✅ icrc1_fee (string):", (fee as any).results[0].value)
  }, 30_000)
})
