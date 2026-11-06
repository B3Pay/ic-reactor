import { c, type Schema } from "@meantjs/schema"
import { describe, expect, it } from "vitest"
import { signatureText, typeText } from "./type-text.ts"

const Account = c.rec(() =>
  c.record({ owner: c.principal, subaccount: c.opt(c.blob()) })
)
const TransferArg = c.rec(() =>
  c.record({
    to: Account,
    fee: c.opt(c.nat),
    memo: c.opt(c.blob()),
    from_subaccount: c.opt(c.blob()),
    created_at_time: c.opt(c.nat64),
    amount: c.nat,
  })
)
const TransferError = c.rec(() =>
  c.variant({
    BadFee: c.record({ expected_fee: c.nat }),
    TooOld: c.null,
    GenericError: c.record({ error_code: c.nat, message: c.text }),
  })
)
const TransferResult = c.rec(() => c.variant({ Ok: c.nat, Err: TransferError }))

type List = { head: bigint; tail: List | null }
const List: Schema<List> = c.rec(() =>
  c.record({ head: c.nat, tail: c.opt(List) })
)

describe("typeText", () => {
  it("writes every kind structurally", () => {
    expect(typeText(c.nat)).toBe("nat")
    expect(typeText(c.blob())).toBe("blob")
    expect(typeText(c.vec(c.nat8))).toBe("vec nat8")
    expect(typeText(c.unit())).toBe("record {}")
    expect(typeText(c.opt(c.opt(c.text)))).toBe("opt opt text")
    expect(typeText(c.tuple([c.text, c.nat]))).toBe("record { text; nat }")
    expect(typeText(Account)).toBe(
      "record { owner : principal; subaccount : opt blob }"
    )
    expect(typeText(c.variant({ Ok: c.nat, Pending: c.null }))).toBe(
      "variant { Ok : nat; Pending }"
    )
    expect(typeText(c.func([c.nat], [c.text], "query"))).toBe(
      "func (nat) -> (text) query"
    )
    expect(
      typeText(
        c.service({
          name: c.func([], [c.text], "query"),
          go: c.func([c.nat], [], "update"),
        })
      )
    ).toBe("service { name : () -> (text) query; go : (nat) -> () }")
    expect(typeText(c.service({}))).toBe("service {}")
    expect(typeText(c.reserved)).toBe("reserved")
    expect(typeText(c.empty)).toBe("empty")
  })

  it("quotes names that are not identifiers and numbers unnamed labels", () => {
    expect(
      typeText(
        c.record({ type: c.nat, "a b": c.text, _7_: c.bool, ok_1: c.null })
      )
    ).toBe('record { "type" : nat; "a b" : text; 7 : bool; ok_1 : null }')
    expect(typeText(c.service({ query: c.func([], [], "oneway") }))).toBe(
      'service { "query" : () -> () oneway }'
    )
    expect(typeText(c.record({ "evil\u202e": c.nat }))).toBe(
      'record { "evil\\u{202e}" : nat }'
    )
  })

  it("writes a recursive occurrence as …", () => {
    expect(typeText(List)).toBe("record { head : nat; tail : opt … }")
    type Tree = { tag: "leaf"; value: bigint } | { tag: "node"; value: Tree[] }
    const Tree: Schema<Tree> = c.rec(() =>
      c.variant({ leaf: c.nat, node: c.vec(Tree) })
    )
    expect(typeText(Tree)).toBe("variant { leaf : nat; node : vec … }")
    // A type used twice side by side is not recursion.
    expect(typeText(c.record({ from: Account, to: Account }))).toBe(
      "record { from : record { owner : principal; subaccount : opt blob }; to : record { owner : principal; subaccount : opt blob } }"
    )
  })

  it("cuts deep parts to … to fit maxChars, keeping the outer shape", () => {
    const full = typeText(TransferArg)
    expect(full).toBe(
      "record { to : record { owner : principal; subaccount : opt blob }; fee : opt nat; memo : opt blob; from_subaccount : opt blob; created_at_time : opt nat64; amount : nat }"
    )
    const shallow = typeText(TransferArg, { maxChars: 140 })
    expect(shallow).toBe(
      "record { to : record { … }; fee : opt nat; memo : opt blob; from_subaccount : opt blob; created_at_time : opt nat64; amount : nat }"
    )
    // Not even every top-level field fits: as many as fit, then `…`.
    const cut = typeText(TransferArg, { maxChars: 120 })
    expect(cut).toBe(
      "record { to : record { … }; fee : opt nat; memo : opt blob; from_subaccount : opt blob; created_at_time : opt nat64; … }"
    )
    expect(cut.length).toBeLessThanOrEqual(120)
    expect(typeText(TransferArg, { maxChars: 20 })).toBe("record { … }")
  })

  it("cuts the text itself when even the outer shape is too long", () => {
    const text = typeText(TransferArg, { maxChars: 8 })
    expect(text).toBe("record …")
    expect(text.length).toBe(8)
  })

  it("refuses a maxChars that is not a positive integer", () => {
    expect(() => typeText(c.nat, { maxChars: 0 })).toThrow(TypeError)
    expect(() => typeText(c.nat, { maxChars: 1.5 })).toThrow(TypeError)
  })

  it("stays within maxChars on a type that grows without end", () => {
    // A hand-built schema whose rec makes a fresh node every time: no
    // identity repeats, so only the character budget stops it.
    const endless = (): Schema<unknown> =>
      c.rec(() => c.opt(c.vec(endless()))) as unknown as Schema<unknown>
    const text = typeText(endless(), { maxChars: 60 })
    expect(text.length).toBeLessThanOrEqual(60)
    expect(text.endsWith("…")).toBe(true)
  })

  it("keeps a wide type's cost bounded", () => {
    const fields = Object.fromEntries(
      Array.from({ length: 5000 }, (_, i) => [`field_${i}`, TransferArg])
    )
    const text = typeText(c.record(fields), { maxChars: 100 })
    expect(text.length).toBeLessThanOrEqual(100)
    expect(text.startsWith("record { field_0 : record { … }; ")).toBe(true)
  })
})

describe("signatureText", () => {
  it("writes arguments, results and the mode", () => {
    expect(signatureText({ args: [], results: [c.nat], mode: "query" })).toBe(
      "() -> (nat) query"
    )
    expect(
      signatureText({
        args: [c.nat, c.opt(c.text)],
        results: [],
        mode: "update",
      })
    ).toBe("(nat, opt text) -> ()")
    expect(
      signatureText({ args: [], results: [], mode: "composite_query" })
    ).toBe("() -> () composite_query")
    expect(signatureText({ args: [c.text], results: [], mode: "oneway" })).toBe(
      "(text) -> () oneway"
    )
  })

  it("writes icrc1_transfer, cutting nested groups to fit", () => {
    const method = {
      args: [TransferArg],
      results: [TransferResult],
      mode: "update" as const,
    }
    expect(signatureText(method)).toBe(
      "(record { to : record { owner : principal; subaccount : opt blob }; fee : opt nat; memo : opt blob; from_subaccount : opt blob; created_at_time : opt nat64; amount : nat }) -> (variant { Ok : nat; Err : variant { BadFee : record { expected_fee : nat }; TooOld; GenericError : record { error_code : nat; message : text } } })"
    )
    expect(signatureText(method, { maxChars: 260 })).toBe(
      "(record { to : record { … }; fee : opt nat; memo : opt blob; from_subaccount : opt blob; created_at_time : opt nat64; amount : nat }) -> (variant { Ok : nat; Err : variant { … } })"
    )
    const cut = signatureText(method, { maxChars: 120 })
    expect(cut).toBe(
      "(record { to : record { … }; fee : opt nat; memo : opt blob; … }) -> (variant { Ok : nat; Err : variant { … } })"
    )
    expect(cut.length).toBeLessThanOrEqual(120)
    expect(signatureText(method, { maxChars: 40 })).toBe(
      "(record { … }) -> (variant { … })"
    )
  })
})
