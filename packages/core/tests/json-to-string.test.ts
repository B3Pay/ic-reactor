/**
 * `jsonToString`: a canister call's result as indented JSON text.
 *
 * It wrote a `bigint` as its digits but left the rest to `JSON.stringify`,
 * which writes a `Principal` as `{"__principal__":"aaaaa-aa"}` and a
 * `Uint8Array` as an object keyed by index, so a raw `Reactor` result printed
 * through it was unreadable. Examples wrote their own replacer instead
 * (custom-provider, ckbtc-wallet, typescript-demo). These tests pin that it now
 * writes a raw result as a `DisplayReactor` shows it, and that everything else
 * is written as before.
 */
import { describe, it, expect } from "vitest"
import { Principal } from "@icp-sdk/core/principal"
import { jsonToString } from "../src/index.js"

describe("jsonToString", () => {
  it("writes a bigint as its digits, indented by two spaces, as before", () => {
    expect(jsonToString(5n)).toBe('"5"')
    expect(jsonToString({ amount: 10n ** 30n, fee: [10_000n] })).toBe(
      JSON.stringify(
        { amount: "1000000000000000000000000000000", fee: ["10000"] },
        null,
        2
      )
    )
  })

  it("writes a JSON value exactly as JSON.stringify does", () => {
    const value = {
      text: "hi",
      n: 1.5,
      nested: [{ ok: true, none: null }, [], {}],
      empty: "",
    }
    expect(jsonToString(value)).toBe(JSON.stringify(value, null, 2))
  })

  it("writes a Principal as its text", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
    expect(jsonToString(owner)).toBe('"ryjl3-tyaaa-aaaaa-aaaba-cai"')
    expect(jsonToString({ owner, list: [owner] })).toBe(
      JSON.stringify(
        {
          owner: "ryjl3-tyaaa-aaaaa-aaaba-cai",
          list: ["ryjl3-tyaaa-aaaaa-aaaba-cai"],
        },
        null,
        2
      )
    )
  })

  it("writes a principal from another copy of the SDK as its text", () => {
    // What `instanceof Principal` misses when two copies are installed.
    const foreign = {
      _isPrincipal: true,
      toText: () => "aaaaa-aa",
      toJSON: () => ({ __principal__: "aaaaa-aa" }),
    }
    expect(jsonToString({ owner: foreign })).toBe(
      JSON.stringify({ owner: "aaaaa-aa" }, null, 2)
    )
    // A record with a field of that name is not a principal.
    expect(jsonToString({ _isPrincipal: true })).toBe(
      JSON.stringify({ _isPrincipal: true }, null, 2)
    )
  })

  it("writes a Uint8Array as lowercase hex, as a DisplayReactor shows a blob", () => {
    expect(jsonToString(new Uint8Array([0, 10, 255]))).toBe('"000aff"')
    expect(jsonToString({ memo: [new Uint8Array([1, 2])] })).toBe(
      JSON.stringify({ memo: ["0102"] }, null, 2)
    )
    expect(jsonToString(new Uint8Array())).toBe('""')
  })

  it("writes any other typed array as an array of its numbers", () => {
    expect(jsonToString(new Uint16Array([1, 65535]))).toBe(
      JSON.stringify([1, 65535], null, 2)
    )
    expect(jsonToString({ v: new Int32Array([-1, 2]) })).toBe(
      JSON.stringify({ v: [-1, 2] }, null, 2)
    )
    expect(jsonToString(new BigInt64Array([-(2n ** 63n), 1n]))).toBe(
      JSON.stringify(["-9223372036854775808", "1"], null, 2)
    )
    expect(jsonToString(new Float64Array([0.5]))).toBe(
      JSON.stringify([0.5], null, 2)
    )
  })

  it("writes a raw ICRC-1 transfer argument as its display form", () => {
    const raw = {
      to: {
        owner: Principal.fromText("aaaaa-aa"),
        subaccount: [new Uint8Array(32).fill(1)],
      },
      amount: 150_000_000n,
      fee: [],
      memo: [new Uint8Array([0xde, 0xad])],
      created_at_time: [1_700_000_000_000_000_000n],
    }
    const display = {
      to: { owner: "aaaaa-aa", subaccount: ["01".repeat(32)] },
      amount: "150000000",
      fee: [],
      memo: ["dead"],
      created_at_time: ["1700000000000000000"],
    }
    expect(jsonToString(raw)).toBe(JSON.stringify(display, null, 2))
  })
})
