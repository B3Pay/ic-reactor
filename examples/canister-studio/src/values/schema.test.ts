import { c, serviceMethods } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import { actor as minterActor } from "../canisters/ckbtc_minter.ts"
import { actor as icrc1Actor } from "../canisters/icrc1.ts"
import { isAmountMethod, isAmountName, isNanosTimestamp } from "./hints.ts"
import {
  childPath,
  displayLabel,
  orderedFields,
  replySchemas,
  resolve,
} from "./schema.ts"

const icrc1 = serviceMethods(icrc1Actor)
const minter = serviceMethods(minterActor)

describe("replySchemas", () => {
  it("names the shape of what a call resolves with", () => {
    expect(replySchemas({ results: [] }).kind).toBe("none")
    expect(replySchemas({ results: [c.nat, c.text] }).kind).toBe("many")
    const name = icrc1.get("icrc1_name")
    expect(name && replySchemas(name)).toEqual({
      kind: "one",
      schema: name?.results[0],
    })
  })

  it("picks the Ok and Err arms of a result variant", () => {
    const transfer = icrc1.get("icrc1_transfer")
    if (!transfer) throw new Error("icrc1_transfer")
    const shape = replySchemas(transfer)
    if (shape.kind !== "result") throw new Error(shape.kind)
    expect([shape.okTag, shape.errTag]).toEqual(["Ok", "Err"])
    expect(resolve(shape.ok)).toMatchObject({
      kind: "primitive",
      primitive: "nat",
    })
    expect(resolve(shape.err).kind).toBe("variant")

    const lower = replySchemas({
      results: [c.variant({ ok: c.null, err: c.text })],
    })
    expect(lower.kind === "result" && [lower.okTag, lower.errTag]).toEqual([
      "ok",
      "err",
    ])
  })

  it("leaves other variants (and mixed spellings) as one value", () => {
    expect(
      replySchemas({ results: [c.variant({ Ok: c.nat, err: c.text })] }).kind
    ).toBe("one")
    const retrieve = minter.get("retrieve_btc")
    expect(retrieve && replySchemas(retrieve).kind).toBe("result")
  })
})

describe("record display helpers", () => {
  it("orders required fields first, each group in schema order", () => {
    const node = resolve(
      c.record({
        fee: c.opt(c.nat),
        to: c.principal,
        memo: c.opt(c.blob()),
        amount: c.nat,
      })
    )
    if (node.kind !== "record") throw new Error(node.kind)
    expect(orderedFields(node).map(([key]) => key)).toEqual([
      "to",
      "amount",
      "fee",
      "memo",
    ])
  })

  it("labels unnamed fields by number and builds codec paths", () => {
    expect(displayLabel("_7_")).toBe("#7")
    expect(displayLabel("_07_")).toBe("_07_")
    expect(displayLabel("owner")).toBe("owner")
    expect(childPath("$", "owner")).toBe("$.owner")
    expect(childPath("$", "has space")).toBe('$["has space"]')
    expect(childPath("$.a", 3)).toBe("$.a[3]")
  })
})

describe("display hints", () => {
  it("knows token amounts by their last word", () => {
    for (const name of [
      "amount",
      "minter_fee",
      "expected_allowance",
      "icrc1:fee",
      "e8s",
      "balance",
      "total_supply",
    ]) {
      expect(isAmountName(name), name).toBe(true)
    }
    for (const name of [
      "fee_collector_block",
      "decimals",
      "block_index",
      "icrc1:decimals",
    ]) {
      expect(isAmountName(name), name).toBe(false)
    }
    expect(isAmountMethod("icrc1_balance_of")).toBe(true)
    expect(isAmountMethod("icrc1_total_supply")).toBe(true)
    expect(isAmountMethod("get_deposit_fee")).toBe(true)
    expect(isAmountMethod("icrc1_transfer")).toBe(false)
    expect(isAmountMethod("icrc1_decimals")).toBe(false)
  })

  it("knows IC timestamps by name and range", () => {
    const now = 1_760_000_000_000_000_000n
    expect(isNanosTimestamp("created_at_time", now)).toBe(true)
    expect(isNanosTimestamp("timestamp_nanos", now)).toBe(true)
    expect(isNanosTimestamp("expires_at", now)).toBe(true)
    expect(isNanosTimestamp("created_at_time", 1_760_000_000n)).toBe(false)
    expect(isNanosTimestamp("amount", now)).toBe(false)
  })
})
