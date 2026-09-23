import { describe, expect, it, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client.js"
import { DisplayReactor } from "../src/display-reactor.js"
import {
  didToDisplayCodec,
  transformArgsWithCodec,
} from "../src/display/index.js"
import { hexToUint8Array, uint8ArrayToHex } from "../src/utils/index.js"

/**
 * A blob's display form is hex, two digits per byte. Hex with an odd number of
 * digits was padded with a leading zero, which shifts every byte by one digit:
 * a 64-digit ICRC-1 subaccount that lost its last digit in a copy became a
 * different 32-byte subaccount, which the ledger accepts, so the transfer went
 * to an account nobody meant. It is refused instead.
 */

// ICRC-1's Account, as icrc1_transfer takes it.
const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})
const TransferArg = IDL.Record({
  to: Account,
  amount: IDL.Nat,
  memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
})

const subaccount =
  "0a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20212223242526272829"
const owner = "ryjl3-tyaaa-aaaaa-aaaba-cai"

const transfer = (hex: string) => ({
  to: { owner, subaccount: hex },
  amount: "100000000",
})

describe("hexToUint8Array", () => {
  it("refuses an odd number of hex digits", () => {
    for (const hex of ["a", "abc", "0xabc", "0X1", subaccount.slice(0, 63)]) {
      expect(() => hexToUint8Array(hex), hex).toThrow(/odd number of hex/)
    }
  })

  it("still reads even-length hex, with or without 0x", () => {
    expect(hexToUint8Array("")).toEqual(new Uint8Array([]))
    expect(hexToUint8Array("0x")).toEqual(new Uint8Array([]))
    expect(hexToUint8Array("0xABcd")).toEqual(new Uint8Array([0xab, 0xcd]))
    expect(hexToUint8Array(subaccount)).toEqual(
      new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 10))
    )
  })
})

describe("a blob argument given as hex", () => {
  const codec = didToDisplayCodec(TransferArg)

  it("sends the subaccount it was given", () => {
    const [arg] = transformArgsWithCodec<[any]>(codec, [transfer(subaccount)])
    expect(uint8ArrayToHex(arg.to.subaccount[0])).toBe(subaccount)
  })

  it("refuses a subaccount with a digit missing instead of shifting it", () => {
    expect(() =>
      transformArgsWithCodec(codec, [transfer(subaccount.slice(0, 63))])
    ).toThrow(/odd number of hex digits/)
  })

  it("sends nothing to the canister for it", async () => {
    const agent = {
      rootKey: new Uint8Array([1]),
      getPrincipal: vi.fn(),
      query: vi.fn(),
      call: vi.fn(),
    }
    const reactor = new DisplayReactor({
      name: "ledger",
      canisterId: owner,
      clientManager: {
        agent,
        subscribe: vi.fn(),
        registerCanisterId: vi.fn(),
        queryClient: new QueryClient(),
      } as unknown as ClientManager,
      idlFactory: ({ IDL }) =>
        IDL.Service({
          icrc1_transfer: IDL.Func([TransferArg], [IDL.Nat], []),
        }),
    })

    await expect(
      reactor.callMethod({
        functionName: "icrc1_transfer" as never,
        args: [transfer(subaccount.slice(0, 63))] as never,
      })
    ).rejects.toThrow(/odd number of hex digits/)
    expect(agent.call).not.toHaveBeenCalled()
    expect(agent.query).not.toHaveBeenCalled()
  })

  it("round-trips every displayed blob, and refuses every odd-length hex (seeded)", () => {
    // mulberry32, seed 20260923
    let s = 20260923
    const next = () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const blob = didToDisplayCodec(IDL.Vec(IDL.Nat8))
    for (let i = 0; i < 200; i++) {
      const bytes = Uint8Array.from({ length: Math.floor(next() * 40) }, () =>
        Math.floor(next() * 256)
      )
      const hex = blob.asDisplay(bytes) as string
      expect(blob.asCandid(hex)).toEqual(bytes)
      const odd = hex + "0123456789abcdef"[Math.floor(next() * 16)]
      expect(() => blob.asCandid(odd), odd).toThrow(/odd number of hex/)
    }
  })
})
