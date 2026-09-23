import { ClientManager, didToDisplayCodec } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * The examples on the MetadataReactor docs page
 * (docs/src/content/docs/packages/candid/metadatareactor.mdx), run as written
 * against a mocked canister reply. The page used to pass `callMethod`'s
 * result to `resolve()`, which threw `Option "functionType" not found`, and
 * sent the display-typed form defaults to the candid-native `callMethod`,
 * which failed in `IDL.encode`.
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

// The ICRC-1 methods the page uses, as the ICP ledger declares them.
const LEDGER_CANDID = `
  type Account = record { owner : principal; subaccount : opt blob };
  type TransferArg = record {
    to : Account;
    fee : opt nat;
    memo : opt blob;
    from_subaccount : opt blob;
    created_at_time : opt nat64;
    amount : nat;
  };
  type TransferError = variant {
    BadFee : record { expected_fee : nat };
    InsufficientFunds : record { balance : nat };
    TooOld;
    GenericError : record { error_code : nat; message : text };
  };
  service : {
    icrc1_balance_of : (Account) -> (nat) query;
    icrc1_transfer : (TransferArg) -> (variant { Ok : nat; Err : TransferError });
  }
`

async function createReactor() {
  const reactor = new MetadataReactor({
    name: "ledger",
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    clientManager: createMockClientManager(),
    candid: LEDGER_CANDID,
  })
  await reactor.initialize()
  return reactor
}

/** The reactor's two protected transport methods. */
type Transport = Record<
  "executeCall" | "executeQuery",
  (methodName: string, arg: Uint8Array) => Promise<Uint8Array>
>

/**
 * Answer every call to `method` with `value`, and collect the decoded
 * arguments each call sent.
 */
function replyWith(reactor: MetadataReactor, method: string, value: unknown) {
  const func = reactor.getServiceInterface().fieldsAsObject()[method]
  const sent: unknown[][] = []
  const reply = async (_methodName: string, arg: Uint8Array) => {
    sent.push(IDL.decode(func.argTypes, arg))
    return IDL.encode(func.retTypes, [value])
  }
  const transport = reactor as unknown as Transport
  vi.spyOn(transport, "executeCall").mockImplementation(reply)
  vi.spyOn(transport, "executeQuery").mockImplementation(reply)
  return sent
}

describe("MetadataReactor docs examples", () => {
  it("Output Metadata: callMethod returns the resolved result, resolve() takes its raw value", async () => {
    const reactor = await createReactor()
    replyWith(reactor, "icrc1_transfer", { Ok: 42n })

    const transferOutput = reactor.getOutputMeta("icrc1_transfer")
    const result = await reactor.callMethod({
      functionName: "icrc1_transfer",
      args: [
        {
          to: { owner: Principal.fromText("aaaaa-aa"), subaccount: [] },
          fee: [],
          memo: [],
          from_subaccount: [],
          created_at_time: [],
          amount: 1n,
        },
      ],
    })
    const resolved = transferOutput?.resolve(result.raw)

    expect(result.raw).toEqual({ Ok: 42n })
    expect(result.results[0]).toMatchObject({
      selected: "Ok",
      selectedValue: { value: "42" },
    })
    expect(resolved?.results[0]).toMatchObject({
      selected: "Ok",
      selectedValue: { value: "42" },
    })
  })

  it("Hydration from Candid Args Hex: the example hex hydrates", async () => {
    const reactor = await createReactor()

    const built = await reactor.buildForMethod("icrc1_balance_of", {
      candidArgsHex: "4449444c036d7b6e006c02b3b0dac30368ad86ca8305010102010000",
    })

    expect(built.meta.defaults).toEqual([{ owner: "", subaccount: null }])
    expect(built.hydration).toEqual({
      status: "hydrated",
      values: [{ owner: "aaaaa-aa", subaccount: null }],
    })
  })

  it("Practical Pattern: form values are validated, converted to Candid and sent", async () => {
    const reactor = await createReactor()
    const sent = replyWith(reactor, "icrc1_transfer", { Ok: 7n })

    const methodName = "icrc1_transfer"
    const inputMeta = reactor.getInputMeta(methodName)
    if (!inputMeta) throw new Error("Method metadata missing")

    // The defaults are placeholders, which the schema rejects.
    expect(inputMeta.schema.safeParse(inputMeta.defaults).success).toBe(false)

    const formValues = [
      {
        to: { owner: "aaaaa-aa", subaccount: null },
        amount: "100000",
        fee: null,
        memo: null,
        from_subaccount: null,
        created_at_time: null,
      },
    ]
    const values = inputMeta.schema.parse(formValues)

    const func = reactor.getServiceInterface().fieldsAsObject()[methodName]
    const args = didToDisplayCodec(IDL.Tuple(...func.argTypes)).asCandid(values)

    const result = await reactor.callMethod({ functionName: methodName, args })
    const rendered = result.results

    expect(sent).toEqual([
      [
        {
          to: { owner: Principal.fromText("aaaaa-aa"), subaccount: [] },
          amount: 100000n,
          fee: [],
          memo: [],
          from_subaccount: [],
          created_at_time: [],
        },
      ],
    ])
    expect(rendered[0]).toMatchObject({
      selected: "Ok",
      selectedValue: { value: "7" },
    })
  })
})
