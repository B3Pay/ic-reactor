import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { didToDisplayCodec } from "../src/display/index.js"
import { CallError } from "../src/errors/index.js"

/**
 * The display form of a `nat`, `int`, `nat64` or `int64` is its decimal text,
 * and encode turned that text back into a bigint with `BigInt(val)`. But
 * `BigInt("")` is `0n`, and so is `BigInt("   ")`. A blank amount field
 * therefore went out as zero instead of failing. The codecs for the other
 * numeric types already refuse a blank string. The 8 to 32-bit integer codecs
 * accept only integer strings, and the float codecs reject "" by name.
 *
 * Decode never produces "" for these types, so no display value that came
 * from a canister round-trips through this case.
 */

interface TestActor {
  transfer: ActorMethod<[{ to: Principal; amount: bigint }], bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    transfer: IDL.Func(
      [IDL.Record({ to: IDL.Principal, amount: IDL.Nat })],
      [IDL.Nat],
      []
    ),
  })

const TransferArg = IDL.Record({ to: IDL.Principal, amount: IDL.Nat })

const makeDisplay = () =>
  new DisplayReactor<TestActor>({
    clientManager: new ClientManager({ queryClient: new QueryClient() }),
    name: "ledger",
    canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
    idlFactory,
  })

/** `Reactor.executeCall` is protected, so its signature is restated here. */
type ExecuteCall = (methodName: string, arg: Uint8Array) => Promise<Uint8Array>

/** Stubs the update call and records the amount of every transfer sent. */
const recordSentAmounts = (reactor: object) => {
  const amounts: bigint[] = []
  vi.spyOn(
    reactor as unknown as { executeCall: ExecuteCall },
    "executeCall"
  ).mockImplementation(async (_method, arg) => {
    const [sent] = IDL.decode([TransferArg], arg)
    amounts.push((sent as unknown as { amount: bigint }).amount)
    return IDL.encode([IDL.Nat], [1n])
  })
  return amounts
}

describe("DisplayReactor with a blank integer string", () => {
  it("rejects a blank amount instead of sending a transfer of zero", async () => {
    const reactor = makeDisplay()
    const sentAmounts = recordSentAmounts(reactor)

    const error = await reactor
      .callMethod({
        functionName: "transfer",
        args: [{ to: "aaaaa-aa", amount: "" }],
      })
      .then(
        () => undefined,
        (e: unknown) => e
      )

    // Nothing may reach the canister.
    expect(sentAmounts).toEqual([])
    expect(error).toBeInstanceOf(CallError)
    expect((error as Error).message).toMatch(/nat/)
  })

  it("still sends a real amount", async () => {
    // Guards against over-reach.
    const reactor = makeDisplay()
    const sentAmounts = recordSentAmounts(reactor)

    await expect(
      reactor.callMethod({
        functionName: "transfer",
        args: [{ to: "aaaaa-aa", amount: "100" }],
      })
    ).resolves.toBe("1")

    expect(sentAmounts).toEqual([100n])
  })
})

describe("display codec for arbitrary-precision and 64-bit integers", () => {
  const types = [
    ["nat", IDL.Nat],
    ["int", IDL.Int],
    ["nat64", IDL.Nat64],
    ["int64", IDL.Int64],
  ] as const

  it.each(types)("%s rejects an empty or blank string", (_name, type) => {
    const codec = didToDisplayCodec(type)

    expect(() => codec.asCandid("" as never)).toThrow()
    expect(() => codec.asCandid("   " as never)).toThrow()
  })

  it.each(types)("%s rejects a blank string inside opt", (_name, type) => {
    // Some(0) is a different request from None, and from what was typed.
    expect(() =>
      didToDisplayCodec(IDL.Opt(type)).asCandid("" as never)
    ).toThrow()
  })

  it.each(types)("%s still encodes integer strings", (_name, type) => {
    const codec = didToDisplayCodec(type)

    expect(codec.asCandid("0" as never)).toBe(0n)
    expect(codec.asCandid("42" as never)).toBe(42n)
  })

  it("keeps the full range of the wide types", () => {
    expect(didToDisplayCodec(IDL.Nat64).asCandid("18446744073709551615")).toBe(
      18446744073709551615n
    )
    expect(didToDisplayCodec(IDL.Int).asCandid("-500")).toBe(-500n)
    expect(
      didToDisplayCodec(IDL.Nat).asCandid("123456789012345678901234567890")
    ).toBe(123456789012345678901234567890n)
  })
})
