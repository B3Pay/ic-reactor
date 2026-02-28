import { ClientManager, uint8ArrayToHex } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { beforeEach, describe, expect, it } from "vitest"
import { CandidMetadataReactor } from "../../src/candid-metadata-reactor"

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

const SERVICE_CANDID = `
  service : {
    greet : (text, nat) -> (text) query;
    maybe_owner : () -> (opt principal) query;
  }
`

describe("CandidMetadataReactor", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = createMockClientManager()
  })

  it("builds candid-friendly metadata for a method", async () => {
    const reactor = new CandidMetadataReactor({
      name: "simple",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: SERVICE_CANDID,
    })

    await reactor.initialize()

    const metadata = await reactor.buildForMethod("greet")

    expect(metadata.meta.functionName).toBe("greet")
    expect(metadata.meta.argCount).toBe(2)
    expect(metadata.meta.args[0]?.type).toBe("text")
    expect(metadata.meta.args[1]?.type).toBe("number")
    expect(metadata.hydration.status).toBe("empty")
  })

  it("hydrates values from candid argument hex", async () => {
    const reactor = new CandidMetadataReactor({
      name: "simple",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: SERVICE_CANDID,
    })

    await reactor.initialize()

    const encoded = IDL.encode([IDL.Text, IDL.Nat], ["hello", 42n])
    const candidArgsHex = uint8ArrayToHex(new Uint8Array(encoded))

    const metadata = await reactor.buildForMethod("greet", { candidArgsHex })
    expect(metadata.hydration.status).toBe("hydrated")
    if (metadata.hydration.status === "hydrated") {
      expect(metadata.hydration.values).toEqual(["hello", "42"])
    }
  })

  it("builds variable candidates for method args and returns", async () => {
    const reactor = new CandidMetadataReactor({
      name: "simple",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: SERVICE_CANDID,
    })

    await reactor.initialize()

    const candidates = reactor.buildMethodVariableCandidates("greet")
    expect(candidates.some((c) => c.expr === "$greet.arg.0")).toBe(true)
    expect(candidates.some((c) => c.expr === "$greet.arg.1")).toBe(true)
    expect(candidates.some((c) => c.expr === "$greet.ret")).toBe(true)
  })

  it("builds value metadata from a standalone value type", async () => {
    const reactor = new CandidMetadataReactor({
      name: "simple",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: SERVICE_CANDID,
    })

    await reactor.initialize()

    const valueMeta = await reactor.buildForValueType(
      "record { owner : principal; active : bool }"
    )

    expect(valueMeta.meta.functionType).toBe("value")
    expect(valueMeta.meta.argCount).toBe(1)
    expect(valueMeta.meta.args[0]?.type).toBe("record")
  })
})
