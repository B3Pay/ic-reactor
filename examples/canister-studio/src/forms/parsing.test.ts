import { c, type AnySchema } from "@meantjs/schema"
import { encodeArgs } from "@meantjs/schema/codec"
import { describe, expect, it } from "vitest"
import { toHex } from "../lib/hex.ts"
import { subaccountFromNumber, tokenAmountText } from "./convert.ts"
import {
  checkCall,
  draftFromValue,
  draftValues,
  formatBytes,
  initialDraft,
  parseBigInt,
  parseBytes,
  type DraftNote,
} from "./engine.ts"
import { argsToJson, parseArgsJson } from "./json.ts"

const CKBTC = { decimals: 8, symbol: "ckBTC" }

// `type Loop = record { x : Loop }`: no finite value exists.
const Loop: AnySchema = c.rec(() => c.record({ x: Loop }))

/** The values a JSON text loads as, with the notes of what was replaced. */
function load(text: string, args: readonly AnySchema[]) {
  const parsed = parseArgsJson(text, args)
  if (!parsed.ok) throw new Error(parsed.message)
  const notes: DraftNote[] = []
  const drafts = args.map((schema, i) =>
    draftFromValue(schema, parsed.values[i], { notes, path: `$args[${i}]` })
  )
  return { check: checkCall(args, drafts), notes }
}

describe("types with no values below the top", () => {
  it("checks an opt, vec item or arm of one without overflowing the stack", () => {
    const V = c.variant({ a: c.nat, loop: Loop })
    const optLoop = c.record({ o: c.opt(Loop), n: c.nat })

    // A present opt, a vec item and a picked arm, as the UI or a stale
    // draft could hold them.
    const opt = checkCall(
      [optLoop],
      [
        {
          k: "record",
          fields: {
            o: { k: "opt", present: true },
            n: { k: "leaf", text: "1" },
          },
        },
      ]
    )
    expect(opt.issues).toEqual([
      {
        path: "$args[0].o",
        code: "uninhabited_type",
        message: "this type has no values",
      },
    ])
    const vec = checkCall(
      [c.vec(Loop)],
      [{ k: "vec", items: [{ id: 1, draft: { k: "record", fields: {} } }] }]
    )
    expect(vec.issues[0]?.path).toBe("$args[0][0]")
    const arm = checkCall([V], [{ k: "variant", tag: "loop", payloads: {} }])
    expect(arm.issues[0]?.code).toBe("uninhabited_type")
    expect(() => draftValues([Loop], [initialDraft(Loop)])).not.toThrow()
  })

  it("reads JSON for one as the nearest value that exists, and says so", () => {
    const V = c.variant({ a: c.nat, loop: Loop })
    const arm = load('[{"loop": {}}]', [V])
    expect(arm.check.ok).toBe(true)
    expect(arm.check.values).toEqual([{ tag: "a", value: 0n }])
    expect(arm.notes).toEqual([
      {
        path: "$args[0]",
        message: 'the arm "loop" has no values; the default arm is used',
      },
    ])

    const opt = load('[{"o": {}, "n": "1"}]', [
      c.record({ o: c.opt(Loop), n: c.nat }),
    ])
    expect(opt.check.values).toEqual([{ o: null, n: 1n }])
    expect(opt.notes[0]?.message).toBe(
      "this type has no values; left out (null)"
    )

    const vec = load("[[{}]]", [c.vec(Loop)])
    expect(vec.check.values).toEqual([[]])
    expect(vec.notes[0]?.message).toBe(
      "the item type has no values; 1 item left out"
    )
  })
})

describe("blobs as text", () => {
  it("keeps a leading byte order mark, so the same bytes go out", () => {
    const bom = Uint8Array.of(0xef, 0xbb, 0xbf, 0x41)
    const text = formatBytes(bom, "utf8")
    expect(text).toBe("﻿A")
    const back = parseBytes(text ?? "", "utf8")
    expect(typeof back !== "string" && toHex(back)).toBe("efbbbf41")
    expect(formatBytes(Uint8Array.of(0xff), "utf8")).toBeUndefined()
  })
})

describe("numbers as typed", () => {
  it("takes separators only between groups of three, never as a decimal comma", () => {
    expect(parseBigInt("1,000,000")).toBe(1_000_000n)
    expect(parseBigInt("1 000 000")).toBe(1_000_000n)
    expect(parseBigInt("1_000_000")).toBe(1_000_000n)
    expect(parseBigInt("-12,345")).toBe(-12_345n)
    expect(parseBigInt("0x5f5e100")).toBe(100_000_000n)
    for (const text of ["1,5", "12,34,5", "1 5", "1,0000", "1,000 000"])
      expect(typeof parseBigInt(text)).toBe("string")
    expect(checkCall([c.nat16], [{ k: "leaf", text: "1,5" }]).ok).toBe(false)
    expect(checkCall([c.nat16], [{ k: "leaf", text: "1,000" }]).values).toEqual(
      [1000]
    )
    expect(subaccountFromNumber("1,5").ok).toBe(false)
  })

  it("refuses a float that overflows, and hex, rather than sending another number", () => {
    const float = (text: string) =>
      checkCall([c.float64], [{ k: "leaf", text }])
    expect(float("1e400").issues[0]?.message).toMatch(/too large/)
    expect(float("0x1A").issues[0]?.message).toBe("enter a number")
    expect(float("0b11").ok).toBe(false)
    expect(float("1e3").values).toEqual([1000])
    expect(float(".5").values).toEqual([0.5])
    expect(float("-Infinity").values).toEqual([-Infinity])
  })

  it("shows raw base units as the amount they are, whatever their spelling", () => {
    expect(tokenAmountText("1,000,000", CKBTC)).toBe("0.01")
    expect(tokenAmountText("0x5f5e100", CKBTC)).toBe("1")
    expect(tokenAmountText("1,5", CKBTC)).toBeUndefined()
  })
})

describe("JSON export and import", () => {
  it("keeps NaN, ±Infinity and -0 through a round trip, byte for byte", () => {
    const args = [c.float64, c.float64, c.float64, c.float64, c.float32]
    const values = [NaN, Infinity, -Infinity, -0, -0]
    const json = argsToJson(values)
    expect(JSON.parse(json)).toEqual([
      "NaN",
      "Infinity",
      "-Infinity",
      "-0",
      "-0",
    ])
    const { check } = load(json, args)
    expect(check.ok).toBe(true)
    const sent = encodeArgs(args, values)
    expect(check.bytes && toHex(check.bytes)).toBe(sent.ok && toHex(sent.bytes))
  })

  it("keeps -0 when a float comes back from history", () => {
    const draft = draftFromValue(c.float64, -0)
    expect(draft).toEqual({ k: "leaf", text: "-0" })
    expect(Object.is(checkCall([c.float64], [draft]).values?.[0], -0)).toBe(
      true
    )
  })

  it("notes every value it could not use as given", () => {
    const Op = c.variant({
      Approve: c.record({ amount: c.nat }),
      Transfer: c.record({ amount: c.nat }),
    })
    expect(load('{"Tranfser": {"amount": "5"}}', [Op]).notes).toEqual([
      {
        path: "$args[0]",
        message: 'unknown variant tag "Tranfser"; the default arm is used',
      },
    ])
    const record = c.record({ amount: c.nat, to: c.text, memo: c.opt(c.nat) })
    expect(load('{"amout": "500", "to": "x"}', [record]).notes).toEqual([
      { path: "$args[0].amount", message: "missing; set to the default" },
      {
        path: "$args[0].amout",
        message: "not a field of this record; ignored",
      },
    ])
    expect(load('[{"a": 1}, true]', [c.vec(c.nat), c.bool]).notes).toEqual([
      {
        path: "$args[0]",
        message: "expected a list (an array); left empty",
      },
    ])
    // The form's own export loads back without a note.
    const value = { amount: 5n, to: "x", memo: null }
    expect(load(argsToJson([value]), [record])).toMatchObject({
      notes: [],
      check: { values: [value] },
    })
  })

  it("reads a lone vec's bare list as that list, not as the argument list", () => {
    expect(load('["abc"]', [c.vec(c.text)]).check.values).toEqual([["abc"]])
    expect(load('[["abc"]]', [c.vec(c.text)]).check.values).toEqual([["abc"]])
    expect(load("[5]", [c.opt(c.nat)]).check.values).toEqual([5n])
  })

  it("reads agent-js opts of opts: [] is none, [[]] is some none", () => {
    const args = [c.opt(c.opt(c.nat))]
    expect(load("[[]]", args).check.values).toEqual([null])
    expect(load("[[[]]]", args).check.values).toEqual([{ some: null }])
    expect(load("[[[5]]]", args).check.values).toEqual([{ some: 5n }])
    expect(load('[{"some": null}]', args).check.values).toEqual([
      { some: null },
    ])
  })
})
