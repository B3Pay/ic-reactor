import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { VisitResultField } from "./index"
import { bytesToHex } from "@noble/hashes/utils"
import { sha256 } from "@noble/hashes/sha2"

describe("VisitResultField (rich)", () => {
  const v = new VisitResultField()

  it("maps text values and detects format by value and label", () => {
    const t = IDL.Text
    const ctx1 = { label: "website", value: "https://example.com" }
    const r1 = t.accept(v, ctx1) as any
    expect(r1.type).toBe("text")
    expect(r1.textFormat).toBe("url")

    const ctx2 = { label: "email", value: "behrad@example.com" }
    const r2 = t.accept(v, ctx2) as any
    expect(r2.type).toBe("text")
    expect(r2.textFormat).toBe("email")
  })

  it("handles blobs: string -> small blob, Uint8Array -> large blob with hash", () => {
    const blobType = IDL.Vec(IDL.Nat8)

    // string blob
    const sctx = { label: "blobHex", value: "deadbeef" }
    const small = blobType.accept(v, sctx) as any
    expect(small.type).toBe("blob")
    expect(small.displayHint).toBe("hex")
    expect(small.value).toBe("deadbeef")

    // large blob (Uint8Array)
    const bytes = new Uint8Array([1, 2, 3, 4])
    const bctx = { label: "data", value: bytes }
    const large = blobType.accept(v, bctx) as any
    expect(large.type).toBe("blob-large")
    expect(large.value.length).toBe(bytes.length)
    // hash is a 64-char hex string (sha256)
    expect(large.value.hash).toMatch(/^[0-9a-f]{64}$/)
    // value preserved as bytes
    expect(large.value.value).toBeInstanceOf(Uint8Array)
  })

  it("treats vectors of non-blob types as vectors with per-item fields", () => {
    const vecText = IDL.Vec(IDL.Text)
    const ctx = { label: "list", value: ["a", "b", "c"] }
    const res = vecText.accept(v, ctx) as any
    expect(res.type).toBe("vector")
    expect(res.items).toHaveLength(3)
    expect(res.items![1].type).toBe("text")
    expect(res.items![1].value).toBe("b")
  })

  it("supports opt types (present and null)", () => {
    const opt = IDL.Opt(IDL.Text)
    const present = opt.accept(v, { label: "opt", value: "hi" }) as any
    expect(present.type).toBe("optional")
    expect(present.innerField.type).toBe("text")
    expect(present.innerField.value).toBe("hi")

    const absent = opt.accept(v, { label: "opt", value: null }) as any
    expect(absent.type).toBe("optional")
    // innerField when absent should have null/undefined inner value; visitor uses null for missing
    expect(
      absent.innerField.value === null || absent.innerField.value === undefined
    ).toBeTruthy()
  })

  it("handles records, tuples and variants", () => {
    const rec = IDL.Record({ foo: IDL.Text, bar: IDL.Nat })
    const r = rec.accept(v, {
      label: "rec",
      value: { foo: "x", bar: 2 },
    }) as any
    expect(r.type).toBe("record")
    expect(r.fields.find((f: any) => f.label === "foo").value).toBe("x")

    const tup = IDL.Tuple(IDL.Text, IDL.Nat)
    const tRes = tup.accept(v, { label: "t", value: ["y", 5] }) as any
    expect(tRes.type).toBe("tuple")
    expect(tRes.fields[1].value).toBe(5)

    const variant = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text })
    const varRes = variant.accept(v, {
      label: "v",
      value: { Ok: "ok!" },
    }) as any
    expect(varRes.type).toBe("variant")
    expect(varRes.optionFields.find((f: any) => f.label === "Ok").value).toBe(
      "ok!"
    )
  })

  it("maps function return types to MethodResultMeta and service to ServiceResultFields", () => {
    const fn = IDL.Func([], [IDL.Text, IDL.Nat], ["query"])
    const meta = fn.accept(v, { label: "greet", value: ["hello", 7] }) as any
    expect(meta.functionName).toBe("greet")
    expect(meta.resultFields).toHaveLength(2)
    expect(meta.resultFields[0].value).toBe("hello")

    const svc = IDL.Service({ greet: IDL.Func([], [IDL.Text], ["query"]) })
    const svcRes = svc.accept(v, {
      label: "service",
      value: { greet: ["hello"] },
    }) as any
    expect(typeof svcRes.greet).toBe("object")
    expect(svcRes.greet.functionName).toBe("greet")
  })

  it("produces deterministic sha256 hashes", () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const hash = bytesToHex(sha256(bytes))
    const blobType = IDL.Vec(IDL.Nat8)
    const res = blobType.accept(v, { label: "d", value: bytes }) as any
    expect(res.value.hash).toBe(hash)
  })
})
