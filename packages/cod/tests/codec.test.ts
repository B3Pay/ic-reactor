/**
 * Candid Codec — Test Suite
 *
 * Tests for the @ic-reactor/cod package.
 */

import { describe, it, expect, expectTypeOf } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import type { Principal } from "@icp-sdk/core/principal"
import { c, CandidMethodCodec } from "../src"

// ═══════════════════════════════════════════════════════════════════════════
// Primitives
// ═══════════════════════════════════════════════════════════════════════════

describe("Primitive Codecs", () => {
  it("c.text() produces IDL.Text", () => {
    const codec = c.text()
    expect(codec.kind).toBe("text")
    expect(codec.toIDL()).toBe(IDL.Text)
  })

  it("text format helpers produce IDL.Text with validation metadata", () => {
    const email = c.email()

    expect(email.kind).toBe("text")
    expect(email.toIDL()).toBe(IDL.Text)
    expect(email.metadata.validation?.format).toEqual({
      type: "email",
      regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
      jsonSchemaFormat: "email",
      errorMessage: "Must be a valid email address",
    })

    expect(c.url().metadata.validation?.format?.errorMessage).toBe(
      "Must be a valid URL"
    )
    expect(
      c.email("Invalid email").metadata.validation?.format?.errorMessage
    ).toBe("Invalid email")
    expect(c.uuid().metadata.validation?.format?.jsonSchemaFormat).toBe("uuid")
    expect(c.dateTime().metadata.validation?.format?.type).toBe("date-time")
  })

  it("c.bool() produces IDL.Bool", () => {
    const codec = c.bool()
    expect(codec.kind).toBe("bool")
    expect(codec.toIDL()).toBe(IDL.Bool)
  })

  it("c.nat() produces IDL.Nat", () => {
    const codec = c.nat()
    expect(codec.kind).toBe("nat")
    expect(codec.toIDL()).toBe(IDL.Nat)
  })

  it("c.int() produces IDL.Int", () => {
    const codec = c.int()
    expect(codec.kind).toBe("int")
    expect(codec.toIDL()).toBe(IDL.Int)
  })

  it("c.nat8() produces IDL.Nat8", () => {
    expect(c.nat8().toIDL()).toBe(IDL.Nat8)
  })

  it("c.nat16() produces IDL.Nat16", () => {
    expect(c.nat16().toIDL()).toBe(IDL.Nat16)
  })

  it("c.nat32() produces IDL.Nat32", () => {
    expect(c.nat32().toIDL()).toBe(IDL.Nat32)
  })

  it("c.nat64() produces IDL.Nat64", () => {
    expect(c.nat64().toIDL()).toBe(IDL.Nat64)
  })

  it("c.int8() produces IDL.Int8", () => {
    expect(c.int8().toIDL()).toBe(IDL.Int8)
  })

  it("c.int16() produces IDL.Int16", () => {
    expect(c.int16().toIDL()).toBe(IDL.Int16)
  })

  it("c.int32() produces IDL.Int32", () => {
    expect(c.int32().toIDL()).toBe(IDL.Int32)
  })

  it("c.int64() produces IDL.Int64", () => {
    expect(c.int64().toIDL()).toBe(IDL.Int64)
  })

  it("c.float32() produces IDL.Float32", () => {
    expect(c.float32().toIDL()).toBe(IDL.Float32)
  })

  it("c.float64() produces IDL.Float64", () => {
    expect(c.float64().toIDL()).toBe(IDL.Float64)
  })

  it("c.principal() produces IDL.Principal", () => {
    expect(c.principal().toIDL()).toBe(IDL.Principal)
  })

  it("c.null() produces IDL.Null", () => {
    expect(c.null().toIDL()).toBe(IDL.Null)
  })

  it("c.reserved() produces IDL.Reserved", () => {
    expect(c.reserved().toIDL()).toBe(IDL.Reserved)
  })

  it("c.empty() produces IDL.Empty", () => {
    expect(c.empty().toIDL()).toBe(IDL.Empty)
  })

  it("c.blob() produces IDL.Vec(IDL.Nat8)", () => {
    const codec = c.blob()
    expect(codec.kind).toBe("blob")
    const idl = codec.toIDL()
    // Should be a Vec containing Nat8
    expect(idl).toBeInstanceOf(IDL.VecClass)
    expect(idl.display()).toBe("vec nat8")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Metadata Immutability
// ═══════════════════════════════════════════════════════════════════════════

describe("Metadata Chaining (Immutable)", () => {
  it("describe() returns a new instance", () => {
    const original = c.text()
    const described = original.describe("A name field")
    expect(described).not.toBe(original)
    expect(described.metadata.description).toBe("A name field")
    expect(original.metadata.description).toBeUndefined()
  })

  it("label() returns a new instance", () => {
    const original = c.nat()
    const labeled = original.label("Amount")
    expect(labeled).not.toBe(original)
    expect(labeled.metadata.label).toBe("Amount")
    expect(original.metadata.label).toBeUndefined()
  })

  it("example() appends to examples array", () => {
    const original = c.text()
    const ex1 = original.example("Alice")
    const ex2 = ex1.example("Bob")
    expect(ex2.metadata.examples).toEqual(["Alice", "Bob"])
    expect(ex1.metadata.examples).toEqual(["Alice"])
    expect(original.metadata.examples).toBeUndefined()
  })

  it("meta() merges arbitrary metadata", () => {
    const codec = c.text().meta({
      form: { widget: "textarea", placeholder: "Enter text..." },
    })
    expect(codec.metadata.form?.widget).toBe("textarea")
    expect(codec.metadata.form?.placeholder).toBe("Enter text...")
  })

  it("metadata is frozen", () => {
    const codec = c.text().describe("frozen")
    expect(() => {
      ;(codec.metadata as Record<string, unknown>).description = "mutated"
    }).toThrow()
  })

  it("chaining preserves codec kind and IDL", () => {
    const codec = c.nat().describe("amount").label("Amount").example(100n)
    expect(codec.kind).toBe("nat")
    expect(codec.toIDL()).toBe(IDL.Nat)
  })

  it("metadata chaining works on composite codecs", () => {
    const original = c.record({ name: c.text() })
    const described = original.describe("A person record")
    expect(described).not.toBe(original)
    expect(described.metadata.description).toBe("A person record")
    expect(described.kind).toBe("record")
    expect(original.metadata.description).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Composites
// ═══════════════════════════════════════════════════════════════════════════

describe("Composite Codecs", () => {
  describe("opt", () => {
    it("produces IDL.Opt", () => {
      const codec = c.opt(c.text())
      expect(codec.kind).toBe("opt")
      const idl = codec.toIDL()
      expect(idl).toBeInstanceOf(IDL.OptClass)
      expect(idl.display()).toBe("opt text")
    })

    it("nested opt works", () => {
      const codec = c.opt(c.opt(c.nat()))
      expect(codec.toIDL().display()).toBe("opt opt nat")
    })
  })

  describe("vec", () => {
    it("produces IDL.Vec", () => {
      const codec = c.vec(c.text())
      expect(codec.kind).toBe("vec")
      const idl = codec.toIDL()
      expect(idl).toBeInstanceOf(IDL.VecClass)
      expect(idl.display()).toBe("vec text")
    })

    it("vec of records works", () => {
      const codec = c.vec(c.record({ id: c.nat(), name: c.text() }))
      expect(codec.toIDL()).toBeInstanceOf(IDL.VecClass)
    })
  })

  describe("record", () => {
    it("produces IDL.Record with correct fields", () => {
      const codec = c.record({
        name: c.text(),
        age: c.nat(),
      })
      expect(codec.kind).toBe("record")
      const idl = codec.toIDL()
      expect(idl).toBeInstanceOf(IDL.RecordClass)
    })

    it("matches hand-built IDL.Record", () => {
      const codecIdl = c
        .record({
          owner: c.principal(),
          subaccount: c.opt(c.blob()),
        })
        .toIDL()

      const handIdl = IDL.Record({
        owner: IDL.Principal,
        subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
      })

      // Both should have the same display representation
      expect(codecIdl.display()).toBe(handIdl.display())
    })

    it("nested records work", () => {
      const Address = c.record({
        street: c.text(),
        city: c.text(),
      })
      const Person = c.record({
        name: c.text(),
        address: Address,
      })
      const idl = Person.toIDL()
      expect(idl).toBeInstanceOf(IDL.RecordClass)
    })
  })

  describe("variant", () => {
    it("produces IDL.Variant with correct arms", () => {
      const codec = c.variant({
        Ok: c.nat(),
        Err: c.text(),
      })
      expect(codec.kind).toBe("variant")
      const idl = codec.toIDL()
      expect(idl).toBeInstanceOf(IDL.VariantClass)
    })

    it("matches hand-built IDL.Variant", () => {
      const codecIdl = c
        .variant({
          Ok: c.nat(),
          Err: c.text(),
        })
        .toIDL()

      const handIdl = IDL.Variant({
        Ok: IDL.Nat,
        Err: IDL.Text,
      })

      expect(codecIdl.display()).toBe(handIdl.display())
    })

    it("variant with null arms works", () => {
      const codec = c.variant({
        Active: c.null(),
        Inactive: c.null(),
      })
      expect(codec.toIDL()).toBeInstanceOf(IDL.VariantClass)
    })
  })

  describe("tuple", () => {
    it("produces IDL.Tuple", () => {
      const codec = c.tuple([c.text(), c.nat()])
      expect(codec.kind).toBe("tuple")
      const idl = codec.toIDL()
      expect(idl).toBeInstanceOf(IDL.TupleClass)
    })

    it("single-element tuple works", () => {
      const codec = c.tuple([c.bool()])
      expect(codec.toIDL()).toBeInstanceOf(IDL.TupleClass)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Service & Methods
// ═══════════════════════════════════════════════════════════════════════════

describe("Service Codec", () => {
  // Build a small ICRC-1-like service for testing
  const Account = c.record({
    owner: c.principal(),
    subaccount: c.opt(c.blob()),
  })

  const TransferArg = c.record({
    to: Account,
    amount: c.nat(),
    memo: c.opt(c.blob()),
  })

  const TransferResult = c.variant({
    Ok: c.nat(),
    Err: c.text(),
  })

  const ledger = c.service({
    icrc1_balance_of: c.query([Account], c.nat()),
    icrc1_transfer: c.update([TransferArg], TransferResult),
  })

  it("has kind 'service'", () => {
    expect(ledger.kind).toBe("service")
  })

  it("stores method codecs", () => {
    expect(ledger.methods.icrc1_balance_of).toBeInstanceOf(CandidMethodCodec)
    expect(ledger.methods.icrc1_transfer).toBeInstanceOf(CandidMethodCodec)
  })

  it("method modes are correct", () => {
    expect(ledger.methods.icrc1_balance_of.mode).toBe("query")
    expect(ledger.methods.icrc1_transfer.mode).toBe("update")
  })

  it("method annotations are correct", () => {
    expect(ledger.methods.icrc1_balance_of.annotations).toEqual(["query"])
    expect(ledger.methods.icrc1_transfer.annotations).toEqual([])
  })

  describe("idlFactory", () => {
    it("produces a function", () => {
      expect(typeof ledger.idlFactory).toBe("function")
    })

    it("returns an IDL.ServiceClass when called", () => {
      const service = ledger.idlFactory({ IDL })
      expect(service).toBeInstanceOf(IDL.ServiceClass)
    })

    it("produces equivalent IDL to a hand-written factory", () => {
      // Hand-written idlFactory equivalent
      const handFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
        const Account = I.Record({
          owner: I.Principal,
          subaccount: I.Opt(I.Vec(I.Nat8)),
        })
        const TransferArg = I.Record({
          to: Account,
          amount: I.Nat,
          memo: I.Opt(I.Vec(I.Nat8)),
        })
        const TransferResult = I.Variant({
          Ok: I.Nat,
          Err: I.Text,
        })
        return I.Service({
          icrc1_balance_of: I.Func([Account], [I.Nat], ["query"]),
          icrc1_transfer: I.Func([TransferArg], [TransferResult], []),
        })
      }

      const codecService = ledger.idlFactory({ IDL })
      const handService = handFactory({ IDL })

      // Both should encode the same IDL type string
      expect(codecService.display()).toBe(handService.display())
    })
  })

  describe("manifest()", () => {
    it("returns structured method metadata", () => {
      const manifest = ledger.manifest()
      expect(manifest.methods).toHaveLength(2)

      const balance = manifest.methods.find(
        (m) => m.name === "icrc1_balance_of"
      )
      expect(balance).toBeDefined()
      expect(balance!.mode).toBe("query")
      expect(balance!.args).toHaveLength(1)
      expect(balance!.returns).toHaveLength(1)
      expect(balance!.args[0].kind).toBe("record")

      const transfer = manifest.methods.find((m) => m.name === "icrc1_transfer")
      expect(transfer).toBeDefined()
      expect(transfer!.mode).toBe("update")
      expect(transfer!.args).toHaveLength(1)
      expect(transfer!.returns).toHaveLength(1)
      expect(transfer!.returns[0].kind).toBe("variant")
    })
  })

  describe("oneway", () => {
    it("creates a oneway method with no return", () => {
      const svc = c.service({
        fire: c.oneway([c.text()]),
      })
      expect(svc.methods.fire.mode).toBe("oneway")
      expect(svc.methods.fire.annotations).toEqual(["oneway"])
      expect(svc.methods.fire.returnCodec).toBeUndefined()

      const manifest = svc.manifest()
      const fire = manifest.methods.find((m) => m.name === "fire")
      expect(fire!.returns).toHaveLength(0)
    })
  })

  describe("query/update with no returns", () => {
    it("creates no-return query and update methods", () => {
      const svc = c.service({
        ping: c.query([]),
        save: c.update([c.text()]),
      })

      expect(svc.methods.ping.returnCodec).toBeUndefined()
      expect(svc.methods.save.returnCodec).toBeUndefined()

      const idl = svc.idlFactory({ IDL })
      expect(idl.display()).toBe(
        IDL.Service({
          ping: IDL.Func([], [], ["query"]),
          save: IDL.Func([IDL.Text], [], []),
        }).display()
      )

      const manifest = svc.manifest()
      expect(manifest.methods.find((m) => m.name === "ping")!.returns).toEqual(
        []
      )
      expect(manifest.methods.find((m) => m.name === "save")!.returns).toEqual(
        []
      )
    })
  })

  describe("query/update with multiple returns", () => {
    it("creates methods whose IDL returns are separate values", () => {
      const svc = c.service({
        stats: c.query([], [c.text(), c.nat64()]),
      })

      expect(svc.methods.stats.returnCodec).toBeUndefined()
      expect(svc.methods.stats.returnCodecs).toHaveLength(2)

      const idl = svc.idlFactory({ IDL })
      expect(idl.display()).toBe(
        IDL.Service({
          stats: IDL.Func([], [IDL.Text, IDL.Nat64], ["query"]),
        }).display()
      )

      const manifest = svc.manifest()
      expect(manifest.methods.find((m) => m.name === "stats")!.returns).toEqual(
        [
          { kind: "text", metadata: {} },
          { kind: "nat64", metadata: {} },
        ]
      )
    })
  })

  describe("method metadata", () => {
    it("describe() works on methods", () => {
      const method = c.query([c.text()], c.text()).describe("Greet the user")
      expect(method.metadata.description).toBe("Greet the user")
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Type Inference (compile-time checks)
// ═══════════════════════════════════════════════════════════════════════════

describe("Type Inference", () => {
  it("primitive types infer correctly", () => {
    type TextType = c.infer<ReturnType<typeof c.text>>
    type BoolType = c.infer<ReturnType<typeof c.bool>>
    type NatType = c.infer<ReturnType<typeof c.nat>>
    type IntType = c.infer<ReturnType<typeof c.int>>
    type Nat8Type = c.infer<ReturnType<typeof c.nat8>>
    type Nat64Type = c.infer<ReturnType<typeof c.nat64>>
    type PrincipalType = c.infer<ReturnType<typeof c.principal>>
    type NullType = c.infer<ReturnType<typeof c.null>>
    type BlobType = c.infer<ReturnType<typeof c.blob>>

    expectTypeOf<TextType>().toEqualTypeOf<string>()
    expectTypeOf<BoolType>().toEqualTypeOf<boolean>()
    expectTypeOf<NatType>().toEqualTypeOf<bigint>()
    expectTypeOf<IntType>().toEqualTypeOf<bigint>()
    expectTypeOf<Nat8Type>().toEqualTypeOf<number>()
    expectTypeOf<Nat64Type>().toEqualTypeOf<bigint>()
    expectTypeOf<PrincipalType>().toEqualTypeOf<Principal>()
    expectTypeOf<NullType>().toEqualTypeOf<null>()
    expectTypeOf<BlobType>().toEqualTypeOf<Uint8Array | number[]>()
  })

  it("opt type infers as [] | [T]", () => {
    const optText = c.opt(c.text())
    type OptTextType = c.infer<typeof optText>
    expectTypeOf<OptTextType>().toEqualTypeOf<[] | [string]>()
  })

  it("vec type infers as T[]", () => {
    const vecNat = c.vec(c.nat())
    type VecNatType = c.infer<typeof vecNat>
    expectTypeOf<VecNatType>().toEqualTypeOf<bigint[]>()
  })

  it("record type infers as object", () => {
    const Account = c.record({
      owner: c.principal(),
      subaccount: c.opt(c.blob()),
    })
    type AccountType = c.infer<typeof Account>

    expectTypeOf<AccountType>().toEqualTypeOf<{
      owner: Principal
      subaccount: [] | [Uint8Array | number[]]
    }>()
  })

  it("variant type infers as discriminated union", () => {
    const Result = c.variant({
      Ok: c.nat(),
      Err: c.text(),
    })
    type ResultType = c.infer<typeof Result>

    // Should be { Ok: bigint } | { Err: string }
    expectTypeOf<ResultType>().toMatchTypeOf<{ Ok: bigint } | { Err: string }>()
  })

  it("tuple type infers correctly", () => {
    const pair = c.tuple([c.text(), c.nat()])
    type PairType = c.infer<typeof pair>
    expectTypeOf<PairType>().toEqualTypeOf<[string, bigint]>()
  })

  it("service methods with multiple returns infer tuple results", () => {
    const svc = c.service({
      stats: c.query([], [c.text(), c.nat64()]),
    })
    type Service = c.ServiceOf<typeof svc>

    expectTypeOf<Service["stats"]>().toEqualTypeOf<
      () => Promise<[string, bigint]>
    >()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// IDL Encoding / Decoding Roundtrip
// ═══════════════════════════════════════════════════════════════════════════

describe("IDL Encode/Decode Roundtrip", () => {
  it("record codec IDL encodes/decodes correctly", () => {
    const Account = c.record({
      name: c.text(),
      amount: c.nat(),
    })

    const idl = Account.toIDL()
    const testValue = {
      name: "Alice",
      amount: BigInt(1000),
    }

    const encoded = IDL.encode([idl], [testValue])
    const [decoded] = IDL.decode([idl], encoded)
    expect(decoded).toEqual(testValue)
  })

  it("variant codec IDL encodes/decodes correctly", () => {
    const Result = c.variant({
      Ok: c.nat(),
      Err: c.text(),
    })

    const idl = Result.toIDL()
    const okValue = { Ok: BigInt(42) }
    const errValue = { Err: "something went wrong" }

    // Roundtrip Ok
    const encodedOk = IDL.encode([idl], [okValue])
    const [decodedOk] = IDL.decode([idl], encodedOk)
    expect(decodedOk).toEqual(okValue)

    // Roundtrip Err
    const encodedErr = IDL.encode([idl], [errValue])
    const [decodedErr] = IDL.decode([idl], encodedErr)
    expect(decodedErr).toEqual(errValue)
  })

  it("opt codec IDL roundtrips", () => {
    const optNat = c.opt(c.nat())
    const idl = optNat.toIDL()

    const some = [BigInt(99)]
    const none: never[] = []

    const encodedSome = IDL.encode([idl], [some])
    const [decodedSome] = IDL.decode([idl], encodedSome)
    expect(decodedSome).toEqual(some)

    const encodedNone = IDL.encode([idl], [none])
    const [decodedNone] = IDL.decode([idl], encodedNone)
    expect(decodedNone).toEqual(none)
  })

  it("vec codec IDL roundtrips", () => {
    const vecText = c.vec(c.text())
    const idl = vecText.toIDL()

    const value = ["hello", "world"]
    const encoded = IDL.encode([idl], [value])
    const [decoded] = IDL.decode([idl], encoded)
    expect(decoded).toEqual(value)
  })

  it("primitives encode/decode correctly", () => {
    const textIdl = c.text().toIDL()
    const encoded = IDL.encode([textIdl], ["hello"])
    const [decoded] = IDL.decode([textIdl], encoded)
    expect(decoded).toBe("hello")

    const natIdl = c.nat().toIDL()
    const encodedNat = IDL.encode([natIdl], [BigInt(42)])
    const [decodedNat] = IDL.decode([natIdl], encodedNat)
    expect(decodedNat).toBe(BigInt(42))

    const boolIdl = c.bool().toIDL()
    const encodedBool = IDL.encode([boolIdl], [true])
    const [decodedBool] = IDL.decode([boolIdl], encodedBool)
    expect(decodedBool).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("empty record works", () => {
    const empty = c.record({})
    expect(empty.toIDL()).toBeInstanceOf(IDL.RecordClass)
  })

  it("deeply nested composites work", () => {
    const deep = c.vec(c.opt(c.record({ values: c.vec(c.nat()) })))
    const idl = deep.toIDL()
    expect(idl).toBeInstanceOf(IDL.VecClass)
  })

  it("service with no methods works", () => {
    const empty = c.service({})
    expect(empty.kind).toBe("service")
    expect(empty.manifest().methods).toHaveLength(0)
    expect(typeof empty.idlFactory).toBe("function")
  })

  it("multiple codecs with same shape are independent", () => {
    const a = c.record({ x: c.nat() })
    const b = c.record({ x: c.nat() })
    expect(a).not.toBe(b)
    // But their IDL display should match
    expect(a.toIDL().display()).toBe(b.toIDL().display())
  })
})
