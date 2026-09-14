import { ClientManager, uint8ArrayToHex } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { beforeEach, describe, expect, it } from "vitest"
import { MetadataReactor } from "../../src/metadata-reactor.js"

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
    const reactor = new MetadataReactor({
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
    const reactor = new MetadataReactor({
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

  it("hydrates integer vectors that decode to typed arrays", async () => {
    // IDL.decode gives vec nat64 as a BigUint64Array and vec int8 as an
    // Int8Array. Hydration read only arrays and returned [] for both.
    const reactor = new MetadataReactor({
      name: "ids",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: "service : { list : (vec nat64, vec int8) -> () }",
    })
    await reactor.initialize()

    const encoded = IDL.encode(
      [IDL.Vec(IDL.Nat64), IDL.Vec(IDL.Int8)],
      [
        [1n, 2n],
        [-1, 5],
      ]
    )
    const metadata = await reactor.buildForMethod("list", {
      candidArgsHex: uint8ArrayToHex(new Uint8Array(encoded)),
    })

    expect(metadata.hydration).toEqual({
      status: "hydrated",
      values: [
        ["1", "2"],
        ["-1", "5"],
      ],
    })
  })

  it("hydrates a recursive argument into form values", async () => {
    // Internet Identity's MetadataMapV2. NNS governance's ManageNeuron is
    // recursive too, and for such an argument the whole field is a recursive
    // node. Its hydrated value used to be the raw decoded Candid, which the
    // argument's own schema rejects.
    const reactor = new MetadataReactor({
      name: "ii",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: `
        type MetadataMapV2 = vec record {
          text;
          variant { map : MetadataMapV2; string : text; bytes : vec nat8 };
        };
        service : {
          metadata_replace : (MetadataMapV2) -> ();
        }
      `,
    })

    await reactor.initialize()

    const MetadataMapV2 = IDL.Rec()
    MetadataMapV2.fill(
      IDL.Vec(
        IDL.Tuple(
          IDL.Text,
          IDL.Variant({
            map: MetadataMapV2,
            string: IDL.Text,
            bytes: IDL.Vec(IDL.Nat8),
          })
        )
      )
    )
    const encoded = IDL.encode(
      [MetadataMapV2],
      [
        [
          ["origin", { string: "https://example.org" }],
          ["usage", { map: [["count", { bytes: new Uint8Array([1, 2]) }]] }],
        ],
      ]
    )
    const candidArgsHex = uint8ArrayToHex(new Uint8Array(encoded))

    const metadata = await reactor.buildForMethod("metadata_replace", {
      candidArgsHex,
    })
    expect(metadata.hydration).toEqual({
      status: "hydrated",
      values: [
        [
          ["origin", { _type: "string", string: "https://example.org" }],
          [
            "usage",
            {
              _type: "map",
              map: [["count", { _type: "bytes", bytes: "0102" }]],
            },
          ],
        ],
      ],
    })
    if (metadata.hydration.status !== "hydrated") return
    expect(
      metadata.meta.schema.safeParse(metadata.hydration.values).success
    ).toBe(true)
  })

  it("builds variable candidates for method args and returns", async () => {
    const reactor = new MetadataReactor({
      name: "simple",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: SERVICE_CANDID,
    })

    await reactor.initialize()

    const candidates = reactor.buildMethodVariableCandidates("greet")
    expect(candidates.some((c) => c.expr === "$greet")).toBe(true)
  })

  it("builds value metadata from a standalone value type", async () => {
    const reactor = new MetadataReactor({
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
