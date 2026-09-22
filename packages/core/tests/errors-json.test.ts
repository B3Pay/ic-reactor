import { describe, it, expect, beforeEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { QueryResponseStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import {
  CallError,
  CanisterError,
  ValidationError,
} from "../src/errors/index.js"

/** An ICRC-1 style transfer: every error arm carries a `nat`. */
const TransferError = IDL.Variant({
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  BadFee: IDL.Record({ expected_fee: IDL.Nat }),
})
const TransferResult = IDL.Variant({ Ok: IDL.Nat, Err: TransferError })

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_transfer: IDL.Func([], [TransferResult], ["query"]),
    icrc1_name: IDL.Func([], [IDL.Text], ["query"]),
  })

/**
 * Reactor's errors carry what the canister and the agent reported, and both
 * routinely hold BigInts: every ICRC-1 transfer error has a `nat` in it
 * (`InsufficientFunds { balance }`, `BadFee { expected_fee }`), and a rejected
 * query's cause carries the node signatures' `bigint` timestamps. So
 * `JSON.stringify(error)` — or of anything holding one, like a log record or an
 * API response — threw "Do not know how to serialize a BigInt", typically from
 * inside the very catch block that was handling the error.
 */
describe("JSON serialisation of reactor errors", () => {
  let reactor: Reactor
  let query: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: "https://icp-api.io" },
    })
    query = vi.fn()
    vi.spyOn(clientManager.agent, "query").mockImplementation(query as never)
    reactor = new Reactor({
      clientManager,
      name: "ledger",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })
  })

  it("serialises a canister error whose payload holds a nat", async () => {
    query.mockResolvedValue({
      status: QueryResponseStatus.Replied,
      reply: {
        arg: IDL.encode(
          [TransferResult],
          [{ Err: { InsufficientFunds: { balance: 5n } } }]
        ),
      },
    })

    const error = await reactor
      .callMethod({ functionName: "icrc1_transfer" })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CanisterError)

    const json = JSON.parse(JSON.stringify({ error }))
    expect(json.error).toEqual({
      err: { InsufficientFunds: { balance: "5" } },
      code: "InsufficientFunds",
      name: "CanisterError",
    })
  })

  it("serialises a call error for a rejected query", async () => {
    query.mockResolvedValue({
      status: QueryResponseStatus.Rejected,
      reject_code: 5,
      reject_message: "canister trapped",
      error_code: "IC0503",
      requestId: new Uint8Array(32),
      signatures: [
        {
          timestamp: 1_700_000_000_000_000_000n,
          signature: new Uint8Array(64),
          identity: new Uint8Array(29),
        },
      ],
      httpDetails: { ok: true, status: 200, statusText: "OK", headers: [] },
    })

    const error = await reactor
      .callMethod({ functionName: "icrc1_name" })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CallError)

    const json = JSON.parse(JSON.stringify(error))
    expect(json.name).toBe("CallError")
    expect(JSON.stringify(json)).toContain("1700000000000000000")
  })

  it("serialises exactly as before when nothing needs converting", () => {
    // Guard: the JSON of an error without BigInts is unchanged, byte for byte.
    expect(JSON.stringify(new CanisterError({ NotFound: null }))).toBe(
      '{"err":{"NotFound":null},"code":"NotFound","name":"CanisterError"}'
    )
    expect(
      JSON.stringify(
        new ValidationError("transfer", [{ path: ["to"], message: "bad" }])
      )
    ).toBe(
      '{"issues":[{"path":["to"],"message":"bad"}],"methodName":"transfer","name":"ValidationError"}'
    )
    expect(JSON.stringify(new CallError("failed", { reason: "x" }))).toBe(
      '{"cause":{"reason":"x"},"name":"CallError"}'
    )
  })

  it("converts only the JSON form, not the error itself", () => {
    // `err` is the typed canister value and must keep its BigInt.
    const error = new CanisterError({ BadFee: { expected_fee: 10_000n } })

    expect(JSON.parse(JSON.stringify(error)).err).toEqual({
      BadFee: { expected_fee: "10000" },
    })
    expect(error.err).toEqual({ BadFee: { expected_fee: 10_000n } })
  })
})
