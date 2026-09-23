import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"

/**
 * An optional argument whose value displays as an array, a tuple or a vec of
 * arrays, could not be sent from its form. The field schema accepted the
 * value, and the display codec read the one-element array as the canonical
 * `[value]` wrapper, so the call failed in IDL.encode. The root cause is in
 * @ic-reactor/core's optional codec.
 */

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

const CANDID = `
  service : {
    set_limit : (opt record { nat }) -> ();
    set_shares : (opt vec record { principal; nat }) -> ();
    set_matrix : (opt vec vec nat) -> ();
    set_tags : (opt opt vec text) -> ();
    set_range : (opt record { record { float64; nat32 } }) -> ();
  }
`

const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

/** Each method with a form value and the Candid value it stands for. */
const CASES: Array<[string, unknown, IDL.Type, unknown]> = [
  ["set_limit", ["5"], IDL.Opt(IDL.Tuple(IDL.Nat)), [[5n]]],
  [
    "set_shares",
    [[owner.toText(), "100"]],
    IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat))),
    [[[owner, 100n]]],
  ],
  [
    "set_matrix",
    [["1", "2"]],
    IDL.Opt(IDL.Vec(IDL.Vec(IDL.Nat))),
    [[[1n, 2n]]],
  ],
  ["set_tags", ["new"], IDL.Opt(IDL.Opt(IDL.Vec(IDL.Text))), [[["new"]]]],
  [
    "set_range",
    [["1.5", "7"]],
    IDL.Opt(IDL.Tuple(IDL.Tuple(IDL.Float64, IDL.Nat32))),
    [[[1.5, 7]]],
  ],
]

describe("Internet Identity device metadata", () => {
  // DeviceData's `metadata : opt MetadataMap`, as add_tentative_device,
  // replace and update take it. The form holds a map as a list of key-value
  // pairs, so a device with one metadata entry could not be sent.
  const II_CANDID = `
    type MetadataMap = vec record {
      text;
      variant { map : MetadataMap; string : text; bytes : vec nat8 };
    };
    service : {
      update : (record { alias : text; metadata : opt MetadataMap }) -> ();
    }
  `
  const MetadataMap = IDL.Rec()
  MetadataMap.fill(
    IDL.Vec(
      IDL.Tuple(
        IDL.Text,
        IDL.Variant({
          map: MetadataMap,
          string: IDL.Text,
          bytes: IDL.Vec(IDL.Nat8),
        })
      )
    )
  )
  const DeviceData = IDL.Record({
    alias: IDL.Text,
    metadata: IDL.Opt(MetadataMap),
  })

  it("sends a device whose metadata holds one entry", async () => {
    const reactor = new MetadataDisplayReactor({
      name: "internet_identity",
      canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      clientManager: createMockClientManager(),
      candid: II_CANDID,
    })
    await reactor.initialize()

    const args = [
      {
        alias: "laptop",
        metadata: [["usage", { _type: "string", string: "recovery_phrase" }]],
      },
    ]
    expect(reactor.getInputMeta("update")!.schema.safeParse(args).success).toBe(
      true
    )

    const send = vi
      .spyOn(reactor as any, "executeCall")
      .mockResolvedValue(IDL.encode([], []))
    await reactor.callMethod({ functionName: "update", args })

    const [, bytes] = send.mock.calls[0] as [string, Uint8Array]
    expect(IDL.decode([DeviceData], bytes)).toEqual([
      {
        alias: "laptop",
        metadata: [[["usage", { string: "recovery_phrase" }]]],
      },
    ])
  })
})

describe("MetadataDisplayReactor optional arguments holding arrays", () => {
  it.each(CASES)(
    "%s sends the value its form schema accepted",
    async (method, formValue, type, candidValue) => {
      const reactor = new MetadataDisplayReactor({
        name: "settings",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: CANDID,
      })
      await reactor.initialize()

      const meta = reactor.getInputMeta(method)
      if (!meta) throw new Error("metadata missing")
      expect(meta.schema.safeParse([formValue]).success).toBe(true)

      const send = vi
        .spyOn(reactor as any, "executeCall")
        .mockResolvedValue(IDL.encode([], []))
      await reactor.callMethod({ functionName: method, args: [formValue] })

      const [, bytes] = send.mock.calls[0] as [string, Uint8Array]
      expect(IDL.decode([type], bytes)).toEqual(
        IDL.decode([type], IDL.encode([type], [candidValue]))
      )
    }
  )
})
