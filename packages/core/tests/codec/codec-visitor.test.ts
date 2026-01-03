/**
 * Tests for Zod Codec Schema Visitor (codec-schema-visitor.ts)
 *
 * This test suite validates the bidirectional codec functionality that uses
 * Zod 4's z.codec() API for transforming between Candid and Display formats.
 *
 * Key differences from codec-visitor.ts:
 * - Uses z.codec() for bidirectional transformations
 * - Single codec supports both .asDisplay() and .asCandid()
 * - 50% better performance (compile once vs twice)
 */

import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { didToDisplayCodec, didToDisplayCodecs } from "../../src/display"

describe("Codec Schema Visitor - Basic Type Transformations", () => {
  it("should convert Principal to string with asDisplay/asCandid", () => {
    const principalType = IDL.Principal
    const codec = didToDisplayCodec<Principal>(principalType)

    const candidValue = Principal.fromText("aaaaa-aa")
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toBe("aaaaa-aa")
    expect(typeof displayValue).toBe("string")

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid.toText()).toBe("aaaaa-aa")

    expect(() => codec.asCandid("invalid-principal")).toThrow(
      'Principal "k73u3-l3pri-ncipa-l" does not have a valid checksum (original value "invalid-principal" may not be a valid Principal ID).'
    )
    expect(() => codec.asCandid("")).toThrow()
  })

  it("should convert bigint to string with asDisplay/asCandid", () => {
    const natType = IDL.Nat
    const codec = didToDisplayCodec<bigint>(natType)

    const candidValue = 1234567890n
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toBe("1234567890")
    expect(typeof displayValue).toBe("string")

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toBe(1234567890n)
  })

  it("should handle Int (negative bigints)", () => {
    const intType = IDL.Int
    const codec = didToDisplayCodec<bigint>(intType)

    expect(codec.asDisplay(-500n)).toBe("-500")
    expect(codec.asCandid("-500")).toBe(-500n)
    expect(codec.asDisplay(0n)).toBe("0")
    expect(codec.asCandid("0")).toBe(0n)
  })

  it("should handle primitives without transformation", () => {
    const textType = IDL.Text
    const codec = didToDisplayCodec<string>(textType)

    const candidValue = "Hello, World!"
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toBe("Hello, World!")

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toBe("Hello, World!")
  })

  it("should handle boolean values", () => {
    const boolType = IDL.Bool
    const codec = didToDisplayCodec<boolean>(boolType)

    expect(codec.asDisplay(true)).toBe(true)
    expect(codec.asDisplay(false)).toBe(false)
    expect(codec.asCandid(true)).toBe(true)
    expect(codec.asCandid(false)).toBe(false)
  })

  it("should handle null values", () => {
    const nullType = IDL.Null
    const codec = didToDisplayCodec<null>(nullType)

    expect(codec.asDisplay(null)).toBe(null)
    expect(codec.asCandid(null)).toBe(null)
  })

  it("should handle number types", () => {
    const numberType = IDL.Float64
    const codec = didToDisplayCodec<number>(numberType)

    expect(codec.asDisplay(3.14159)).toBe(3.14159)
    expect(codec.asCandid(2.71828)).toBe(2.71828)
  })
})

describe("Codec Schema Visitor - Optional Types", () => {
  it("should convert optional text from Candid [] to undefined", () => {
    const optType = IDL.Opt(IDL.Text)
    type CandidOpt = [] | [string]

    const codec = didToDisplayCodec<CandidOpt>(optType)

    // Empty array -> undefined
    expect(codec.asDisplay([])).toBeUndefined()

    // Single element array -> value
    expect(codec.asDisplay(["hello"])).toBe("hello")

    // undefined -> empty array
    expect(codec.asCandid(null)).toEqual([])

    // value -> single element array
    expect(codec.asCandid("world")).toEqual(["world"])
  })

  it("should convert optional bigint with transformation", () => {
    const optType = IDL.Opt(IDL.Nat)
    type CandidOpt = [] | [bigint]

    const codec = didToDisplayCodec<CandidOpt>(optType)

    // Empty -> undefined
    expect(codec.asDisplay([])).toBeUndefined()

    // With value: bigint -> string
    expect(codec.asDisplay([9999n])).toBe("9999")

    // undefined -> empty array
    expect(codec.asCandid(null)).toEqual([])

    // string -> [bigint]
    expect(codec.asCandid("9999")).toEqual([9999n])
  })

  it("should handle nested optional with Principal", () => {
    const optType = IDL.Opt(IDL.Principal)
    type CandidOpt = [] | [Principal]

    const codec = didToDisplayCodec<CandidOpt>(optType)

    expect(codec.asDisplay([])).toBeUndefined()

    const principal = Principal.fromText("aaaaa-aa")
    expect(codec.asDisplay([principal])).toBe("aaaaa-aa")

    expect(codec.asCandid(null)).toEqual([])
    expect(codec.asCandid("aaaaa-aa")).toEqual([Principal.fromText("aaaaa-aa")])
  })
})

describe("Codec Schema Visitor - Variant Types", () => {
  it("should convert simple variants to discriminated unions", () => {
    const variantType = IDL.Variant({
      Active: IDL.Null,
      Completed: IDL.Null,
      Open: IDL.Null,
    })

    type CandidVariant = { Active: null } | { Completed: null } | { Open: null }

    const codec = didToDisplayCodec<CandidVariant>(variantType)

    // Decode: Candid -> Display
    expect(codec.asDisplay({ Active: null })).toEqual({ _type: "Active" })
    expect(codec.asDisplay({ Completed: null })).toEqual({ _type: "Completed" })
    expect(codec.asDisplay({ Open: null })).toEqual({ _type: "Open" })

    // Encode: Display -> Candid
    expect(codec.asCandid({ _type: "Active" })).toEqual({ Active: null })
    expect(codec.asCandid({ _type: "Completed" })).toEqual({ Completed: null })
    expect(codec.asCandid({ _type: "Open" })).toEqual({ Open: null })
  })

  it("should convert variants with values", () => {
    const variantType = IDL.Variant({
      Pending: IDL.Null,
      Approved: IDL.Record({ timestamp: IDL.Nat64 }),
      Rejected: IDL.Record({ reason: IDL.Text }),
    })

    type CandidVariant =
      | { Pending: null }
      | { Approved: { timestamp: bigint } }
      | { Rejected: { reason: string } }

    const codec = didToDisplayCodec<CandidVariant>(variantType)

    // Decode null variant
    expect(codec.asDisplay({ Pending: null })).toEqual({ _type: "Pending" })

    // Decode variant with bigint transformation
    expect(codec.asDisplay({ Approved: { timestamp: 1234567890n } })).toEqual({
      _type: "Approved",
      Approved: { timestamp: "1234567890" },
    })

    // Decode variant with no transformation
    expect(
      codec.asDisplay({ Rejected: { reason: "Invalid signature" } })
    ).toEqual({
      _type: "Rejected",
      Rejected: { reason: "Invalid signature" },
    })

    // Encode null variant
    expect(codec.asCandid({ _type: "Pending" })).toEqual({ Pending: null })

    // Encode variant with bigint transformation
    expect(
      codec.asCandid({
        _type: "Approved",
        Approved: { timestamp: "1234567890" },
      })
    ).toEqual({
      Approved: { timestamp: 1234567890n },
    })

    // Encode variant with no transformation
    expect(
      codec.asCandid({
        _type: "Rejected",
        Rejected: { reason: "Invalid signature" },
      })
    ).toEqual({
      Rejected: { reason: "Invalid signature" },
    })
  })

  it("should handle complex nested variants", () => {
    const variantType = IDL.Variant({
      Cash: IDL.Null,
      BankTransfer: IDL.Record({
        accountNumber: IDL.Text,
        amount: IDL.Nat,
      }),
      Crypto: IDL.Record({
        address: IDL.Text,
        amount: IDL.Nat,
        confirmations: IDL.Opt(IDL.Nat),
      }),
    })

    type CandidVariant =
      | { Cash: null }
      | { BankTransfer: { accountNumber: string; amount: bigint } }
      | {
          Crypto: {
            address: string
            amount: bigint
            confirmations: [] | [bigint]
          }
        }

    const codec = didToDisplayCodec<CandidVariant>(variantType)

    // Decode with optional field
    expect(
      codec.asDisplay({
        Crypto: {
          address: "0x123...",
          amount: 5000000n,
          confirmations: [6n],
        },
      })
    ).toEqual({
      _type: "Crypto",
      Crypto: {
        address: "0x123...",
        amount: "5000000",
        confirmations: "6",
      },
    })

    // Encode with optional field
    expect(
      codec.asCandid({
        _type: "Crypto",
        Crypto: {
          address: "0x123...",
          amount: "5000000",
          confirmations: "6",
        },
      })
    ).toEqual({
      Crypto: {
        address: "0x123...",
        amount: 5000000n,
        confirmations: [6n],
      },
    })
  })
})

describe("Codec Schema Visitor - Record Types", () => {
  it("should handle simple records", () => {
    const recordType = IDL.Record({
      name: IDL.Text,
      age: IDL.Nat,
      active: IDL.Bool,
    })

    type CandidRecord = {
      name: string
      age: bigint
      active: boolean
    }

    const codec = didToDisplayCodec<CandidRecord>(recordType)

    const candidValue = {
      name: "Alice",
      age: 30n,
      active: true,
    }

    const displayValue = codec.asDisplay(candidValue)
    expect(displayValue).toEqual({
      name: "Alice",
      age: "30",
      active: true,
    })

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual(candidValue)
  })

  it("should handle records with optional fields", () => {
    const recordType = IDL.Record({
      name: IDL.Text,
      email: IDL.Opt(IDL.Text),
      balance: IDL.Nat,
    })

    type CandidRecord = {
      name: string
      email: [] | [string]
      balance: bigint
    }

    const codec = didToDisplayCodec<CandidRecord>(recordType)

    // With optional field present
    expect(
      codec.asDisplay({
        name: "Bob",
        email: ["bob@example.com"],
        balance: 1000n,
      })
    ).toEqual({
      name: "Bob",
      email: "bob@example.com",
      balance: "1000",
    })

    // With optional field empty
    expect(
      codec.asDisplay({
        name: "Charlie",
        email: [],
        balance: 2000n,
      })
    ).toEqual({
      name: "Charlie",
      email: undefined,
      balance: "2000",
    })

    // Encode with optional present
    expect(
      codec.asCandid({
        name: "Bob",
        email: "bob@example.com",
        balance: "1000",
      })
    ).toEqual({
      name: "Bob",
      email: ["bob@example.com"],
      balance: 1000n,
    })

    // Encode with optional undefined
    expect(
      codec.asCandid({
        name: "Charlie",
        email: null,
        balance: "2000",
      })
    ).toEqual({
      name: "Charlie",
      email: [],
      balance: 2000n,
    })
  })

  it("should handle nested records", () => {
    const recordType = IDL.Record({
      user: IDL.Record({
        name: IDL.Text,
        id: IDL.Nat,
      }),
      metadata: IDL.Record({
        created: IDL.Nat64,
        updated: IDL.Nat64,
      }),
    })

    type CandidRecord = {
      user: { name: string; id: bigint }
      metadata: { created: bigint; updated: bigint }
    }

    const codec = didToDisplayCodec<CandidRecord>(recordType)

    const candidValue = {
      user: { name: "Dave", id: 123n },
      metadata: { created: 1000n, updated: 2000n },
    }

    const displayValue = codec.asDisplay(candidValue)
    expect(displayValue).toEqual({
      user: { name: "Dave", id: "123" },
      metadata: { created: "1000", updated: "2000" },
    })

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual(candidValue)
  })
})

describe("Codec Schema Visitor - Array Types", () => {
  it("should handle arrays with bigint elements", () => {
    const arrayType = IDL.Vec(IDL.Nat)
    type CandidArray = bigint[]

    const codec = didToDisplayCodec<CandidArray>(arrayType)

    const candidValue = [100n, 200n, 300n]
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toEqual(["100", "200", "300"])

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual(candidValue)
  })

  it("should handle arrays with Principal elements", () => {
    const arrayType = IDL.Vec(IDL.Principal)
    type CandidArray = Principal[]

    const codec = didToDisplayCodec<CandidArray>(arrayType)

    const candidValue = [
      Principal.fromText("aaaaa-aa"),
      Principal.fromText("2vxsx-fae"),
    ]

    const displayValue = codec.asDisplay(candidValue)
    expect(displayValue).toEqual(["aaaaa-aa", "2vxsx-fae"])

    const backToCandid = codec.asCandid(displayValue) as Principal[]
    expect(backToCandid.map((p) => p.toText())).toEqual([
      "aaaaa-aa",
      "2vxsx-fae",
    ])
  })

  it("should handle arrays of records", () => {
    const arrayType = IDL.Vec(
      IDL.Record({
        id: IDL.Nat,
        name: IDL.Text,
      })
    )

    type CandidArray = Array<{ id: bigint; name: string }>

    const codec = didToDisplayCodec<CandidArray>(arrayType)

    const candidValue = [
      { id: 1n, name: "Alice" },
      { id: 2n, name: "Bob" },
    ]

    const displayValue = codec.asDisplay(candidValue)
    expect(displayValue).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ])

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual(candidValue)
  })

  it("should handle Vec<Nat8> as Blob (Uint8Array)", () => {
    const blobType = IDL.Vec(IDL.Nat8)
    type CandidBlob = Uint8Array

    const codec = didToDisplayCodec<CandidBlob>(blobType)

    // Small array -> hex string
    const smallArray = new Uint8Array([1, 2, 3, 4, 5])
    const displayValue = codec.asDisplay(smallArray)
    expect(typeof displayValue).toBe("string")
    expect(displayValue).toMatch(/^0x[0-9a-f]+$/i)

    // Large array -> stays as Uint8Array
    const largeArray = new Uint8Array(200)
    const displayLarge = codec.asDisplay(largeArray)
    expect(displayLarge).toBeInstanceOf(Uint8Array)
  })
})

describe("Codec Schema Visitor - Tuple Types", () => {
  it("should handle tuples with mixed types", () => {
    const tupleType = IDL.Tuple(IDL.Text, IDL.Nat, IDL.Bool)
    type CandidTuple = [string, bigint, boolean]

    const codec = didToDisplayCodec<CandidTuple>(tupleType)

    const candidValue: CandidTuple = ["test", 42n, true]
    const displayValue = codec.asDisplay(candidValue)

    expect(displayValue).toEqual(["test", "42", true])

    const backToCandid = codec.asCandid(displayValue)
    expect(backToCandid).toEqual(candidValue)
  })

  it("should handle tuples with Principal and optional", () => {
    const tupleType = IDL.Tuple(IDL.Principal, IDL.Opt(IDL.Text))
    type CandidTuple = [Principal, [] | [string]]

    const codec = didToDisplayCodec<CandidTuple>(tupleType)

    const principal = Principal.fromText("aaaaa-aa")
    const candidValue: CandidTuple = [principal, ["hello"]]

    const displayValue = codec.asDisplay(candidValue)
    expect(displayValue).toEqual(["aaaaa-aa", "hello"])

    const backToCandid = codec.asCandid(displayValue) as CandidTuple
    expect(backToCandid[0].toText()).toBe("aaaaa-aa")
    expect(backToCandid[1]).toEqual(["hello"])
  })

  it("should handle empty tuples", () => {
    const tupleType = IDL.Tuple()

    const codec = didToDisplayCodec(tupleType)

    expect(codec.asDisplay([])).toEqual([])
    expect(codec.asCandid([])).toEqual([])
  })

  it("should convert Vec<Tuple(Text, Text)> to Map", () => {
    const mapType = IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))
    type CandidMap = Array<[string, string]>

    const codec = didToDisplayCodec<CandidMap>(mapType)

    // Decode: Array of tuples → Map
    const candidValue: CandidMap = [
      ["key1", "value1"],
      ["key2", "value2"],
      ["key3", "value3"],
    ]

    const display = codec.asDisplay(candidValue)
    expect(display).toBeInstanceOf(Map)
    expect(display.get("key1")).toBe("value1")
    expect(display.get("key2")).toBe("value2")
    expect(display.get("key3")).toBe("value3")
    expect(display.size).toBe(3)

    // Encode: Map → Array of tuples
    const mapValue = new Map([
      ["foo", "bar"],
      ["hello", "world"],
    ])

    const roundTrip = codec.asCandid(mapValue as any)
    expect(roundTrip).toEqual([
      ["foo", "bar"],
      ["hello", "world"],
    ])

    // Round-trip test
    const originalMap = new Map([
      ["a", "1"],
      ["b", "2"],
    ])
    const encoded = codec.asCandid(originalMap as any)
    const decoded = codec.asDisplay(encoded)
    expect(decoded).toBeInstanceOf(Map)
    expect(decoded.get("a")).toBe("1")
    expect(decoded.get("b")).toBe("2")
  })
})

describe("Codec Schema Visitor - Batch Generation", () => {
  it("should generate multiple codecs at once", () => {
    const codecs = didToDisplayCodecs({
      Status: IDL.Variant({
        Active: IDL.Null,
        Completed: IDL.Null,
      }),
      Person: IDL.Record({
        name: IDL.Text,
        age: IDL.Nat,
      }),
      Amount: IDL.Nat,
    })

    // All codecs should support asDisplay
    expect(codecs.Status.asDisplay({ Active: null })).toEqual({
      _type: "Active",
    })
    expect(codecs.Person.asDisplay({ name: "Alice", age: 30n })).toEqual({
      name: "Alice",
      age: "30",
    })
    expect(codecs.Amount.asDisplay(1000n)).toBe("1000")

    // All codecs should support asCandid
    expect(codecs.Status.asCandid({ _type: "Completed" })).toEqual({
      Completed: null,
    })
    expect(codecs.Person.asCandid({ name: "Bob", age: "25" })).toEqual({
      name: "Bob",
      age: 25n,
    })
    expect(codecs.Amount.asCandid("500")).toBe(500n)
  })
})

describe("Codec Schema Visitor - Round-Trip Transformations", () => {
  it("should maintain data integrity through round-trips", () => {
    const recordType = IDL.Record({
      id: IDL.Nat,
      owner: IDL.Principal,
      metadata: IDL.Opt(IDL.Text),
      tags: IDL.Vec(IDL.Text),
    })

    type CandidRecord = {
      id: bigint
      owner: Principal
      metadata: [] | [string]
      tags: string[]
    }

    const codec = didToDisplayCodec<CandidRecord>(recordType)

    const original: CandidRecord = {
      id: 12345n,
      owner: Principal.fromText("aaaaa-aa"),
      metadata: ["test metadata"],
      tags: ["tag1", "tag2", "tag3"],
    }

    // Round-trip: Candid -> Display -> Candid
    const display = codec.asDisplay(original)
    const roundTrip = codec.asCandid(display) as CandidRecord

    expect(roundTrip.id).toBe(original.id)
    expect(roundTrip.owner.toText()).toBe(original.owner.toText())
    expect(roundTrip.metadata).toEqual(original.metadata)
    expect(roundTrip.tags).toEqual(original.tags)
  })

  it("should handle round-trips with complex variants", () => {
    const variantType = IDL.Variant({
      Simple: IDL.Null,
      WithData: IDL.Record({
        amount: IDL.Nat,
        recipient: IDL.Principal,
        memo: IDL.Opt(IDL.Text),
      }),
    })

    type CandidVariant =
      | { Simple: null }
      | {
          WithData: {
            amount: bigint
            recipient: Principal
            memo: [] | [string]
          }
        }

    const codec = didToDisplayCodec<CandidVariant>(variantType)

    const original: CandidVariant = {
      WithData: {
        amount: 1000000n,
        recipient: Principal.fromText("2vxsx-fae"),
        memo: [],
      },
    }

    const display = codec.asDisplay(original)
    const roundTrip = codec.asCandid(display) as CandidVariant

    expect("WithData" in roundTrip).toBe(true)
    if ("WithData" in roundTrip) {
      expect(roundTrip.WithData.amount).toBe(original.WithData.amount)
      expect(roundTrip.WithData.recipient.toText()).toBe(
        original.WithData.recipient.toText()
      )
      expect(roundTrip.WithData.memo).toEqual(original.WithData.memo)
    }
  })
})

describe("Codec Schema Visitor - Edge Cases", () => {
  it("should handle large bigints", () => {
    const natType = IDL.Nat
    const codec = didToDisplayCodec<bigint>(natType)

    const largeBigInt = 999999999999999999999999n
    const display = codec.asDisplay(largeBigInt)
    const roundTrip = codec.asCandid(display)

    expect(roundTrip).toBe(largeBigInt)
  })

  it("should handle empty arrays", () => {
    const arrayType = IDL.Vec(IDL.Nat)
    const codec = didToDisplayCodec<bigint[]>(arrayType)

    expect(codec.asDisplay([])).toEqual([])
    expect(codec.asCandid([])).toEqual([])
  })

  it("should handle deeply nested structures", () => {
    const deepType = IDL.Record({
      level1: IDL.Record({
        level2: IDL.Record({
          level3: IDL.Record({
            value: IDL.Nat,
          }),
        }),
      }),
    })

    type CandidDeep = {
      level1: {
        level2: {
          level3: {
            value: bigint
          }
        }
      }
    }

    const codec = didToDisplayCodec<CandidDeep>(deepType)

    const candidValue: CandidDeep = {
      level1: {
        level2: {
          level3: {
            value: 42n,
          },
        },
      },
    }

    const display = codec.asDisplay(candidValue)
    expect(display.level1.level2.level3.value).toBe("42")

    const roundTrip = codec.asCandid(display) as CandidDeep
    expect(roundTrip.level1.level2.level3.value).toBe(42n)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PROJECT-SPECIFIC CODEC TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("Codec Schema Visitor - Project Candid Types", () => {
  it("should handle TaskStatus variant correctly", () => {
    type TaskStatus =
      | { Todo: null }
      | { InProgress: null }
      | { Review: null }
      | { Done: null }
      | { Cancelled: null }

    const statusType = IDL.Variant({
      Todo: IDL.Null,
      InProgress: IDL.Null,
      Review: IDL.Null,
      Done: IDL.Null,
      Cancelled: IDL.Null,
    })

    const codec = didToDisplayCodec<TaskStatus>(statusType)

    // Test Todo status
    const todoDisplay = codec.asDisplay({ Todo: null })
    expect(todoDisplay).toEqual({ _type: "Todo" })

    const todoCandid = codec.asCandid({ _type: "Todo" })
    expect(todoCandid).toEqual({ Todo: null })

    // Test InProgress status
    const progressDisplay = codec.asDisplay({ InProgress: null })
    expect(progressDisplay).toEqual({ _type: "InProgress" })

    // Test Review status
    const reviewDisplay = codec.asDisplay({ Review: null })
    expect(reviewDisplay).toEqual({ _type: "Review" })
  })

  it("should handle ProjectRole variant correctly", () => {
    type ProjectRole =
      | { Manager: null }
      | { Developer: null }
      | { Designer: null }
      | { Tester: null }
      | { Stakeholder: null }
      | { Admin: null }

    const roleType = IDL.Variant({
      Manager: IDL.Null,
      Developer: IDL.Null,
      Designer: IDL.Null,
      Tester: IDL.Null,
      Stakeholder: IDL.Null,
      Admin: IDL.Null,
    })

    const codec = didToDisplayCodec<ProjectRole>(roleType)

    const managerDisplay = codec.asDisplay({ Manager: null })
    expect(managerDisplay).toEqual({ _type: "Manager" })

    const devDisplay = codec.asDisplay({ Developer: null })
    expect(devDisplay).toEqual({ _type: "Developer" })

    const adminCandid = codec.asCandid({ _type: "Admin" })
    expect(adminCandid).toEqual({ Admin: null })
  })

  it("should handle DocumentStatus variant with optional values", () => {
    type DocumentStatus =
      | { Pending: null }
      | { PartiallySigned: null }
      | { Verified: null }
      | { Rejected: [] | [string] }

    const statusType = IDL.Variant({
      Pending: IDL.Null,
      PartiallySigned: IDL.Null,
      Verified: IDL.Null,
      Rejected: IDL.Opt(IDL.Text),
    })

    const codec = didToDisplayCodec<DocumentStatus>(statusType)

    // Null variant
    const pendingDisplay = codec.asDisplay({ Pending: null })
    expect(pendingDisplay).toEqual({ _type: "Pending" })

    // Variant with optional value - empty
    const rejectedEmptyDisplay = codec.asDisplay({ Rejected: [] })
    expect(rejectedEmptyDisplay).toEqual({
      _type: "Rejected",
      Rejected: undefined,
    })

    // Variant with optional value - present
    const rejectedDisplay = codec.asDisplay({ Rejected: ["Invalid signature"] })
    expect(rejectedDisplay).toEqual({
      _type: "Rejected",
      Rejected: "Invalid signature",
    })

    // Encode back
    const rejectedCandid = codec.asCandid({
      _type: "Rejected",
      Rejected: "Invalid signature",
    })
    expect(rejectedCandid).toEqual({ Rejected: ["Invalid signature"] })
  })

  it("should handle TicketStatus complex variant", () => {
    type TicketStatus =
      | { Open: null }
      | { Assigned: { to: Principal } }
      | { InProgress: null }
      | { Resolved: { by: Principal } }
      | { Closed: null }

    const statusType = IDL.Variant({
      Open: IDL.Null,
      Assigned: IDL.Record({ to: IDL.Principal }),
      InProgress: IDL.Null,
      Resolved: IDL.Record({ by: IDL.Principal }),
      Closed: IDL.Null,
    })

    const codec = didToDisplayCodec<TicketStatus>(statusType)

    const openDisplay = codec.asDisplay({ Open: null })
    expect(openDisplay).toEqual({ _type: "Open" })

    const assignedDisplay = codec.asDisplay({
      Assigned: { to: Principal.fromText("aaaaa-aa") },
    })
    expect(assignedDisplay).toEqual({
      _type: "Assigned",
      Assigned: { to: "aaaaa-aa" },
    })

    const resolvedCandid = codec.asCandid({
      _type: "Resolved",
      Resolved: { by: "2vxsx-fae" },
    })
    expect(resolvedCandid).toHaveProperty("Resolved")
  })

  it("should handle TeamMember record with principal, variant, and metadata", () => {
    type TeamMember = {
      identity: Principal
      role: { Manager: null } | { Developer: null }
      name: string
      email: string
      department: string
      skills: Array<{ name: string; level: string }>
    }

    const memberType = IDL.Record({
      identity: IDL.Principal,
      role: IDL.Variant({ Manager: IDL.Null, Developer: IDL.Null }),
      name: IDL.Text,
      email: IDL.Text,
      department: IDL.Text,
      skills: IDL.Vec(IDL.Record({ name: IDL.Text, level: IDL.Text })),
    })

    const codec = didToDisplayCodec<TeamMember>(memberType)

    const candidMember: TeamMember = {
      identity: Principal.fromText("aaaaa-aa"),
      role: { Manager: null },
      name: "Alice Smith",
      email: "alice@example.com",
      department: "Engineering",
      skills: [
        { name: "Rust", level: "Expert" },
        { name: "TypeScript", level: "Advanced" },
      ],
    }

    const display = codec.asDisplay(candidMember)
    expect(display.identity).toBe("aaaaa-aa")
    expect(display.role).toEqual({ _type: "Manager" })
    expect(display.name).toBe("Alice Smith")
    expect(display.skills).toHaveLength(2)
    expect(display.skills[0]).toEqual({ name: "Rust", level: "Expert" })

    const roundTrip = codec.asCandid(display)
    expect(roundTrip.identity.toText()).toBe("aaaaa-aa")
    expect(roundTrip.role).toEqual({ Manager: null })
  })

  it("should handle Amount (bigint) to string transformation", () => {
    type Amount = bigint

    const amountType = IDL.Nat
    const codec = didToDisplayCodec<Amount>(amountType)

    // Small amount
    const smallDisplay = codec.asDisplay(1000n)
    expect(smallDisplay).toBe("1000")

    // Large amount (representing tokens with decimals)
    const largeDisplay = codec.asDisplay(1000000000000000000n)
    expect(largeDisplay).toBe("1000000000000000000")

    // Round trip
    const roundTrip = codec.asCandid(largeDisplay)
    expect(roundTrip).toBe(1000000000000000000n)
  })

  it("should handle Timestamp (RFC3339 string) passthrough", () => {
    type TimestampRFC3339 = string

    const timestampType = IDL.Text
    const codec = didToDisplayCodec<TimestampRFC3339>(timestampType)

    const timestamp = "2024-01-15T10:30:00Z"
    const display = codec.asDisplay(timestamp)
    expect(display).toBe(timestamp)

    const roundTrip = codec.asCandid(display)
    expect(roundTrip).toBe(timestamp)
  })

  it("should handle UUID (string) passthrough", () => {
    type UUID = string

    const uuidType = IDL.Text
    const codec = didToDisplayCodec<UUID>(uuidType)

    const uuid = "550e8400-e29b-41d4-a716-446655440000"
    const display = codec.asDisplay(uuid)
    expect(display).toBe(uuid)

    const roundTrip = codec.asCandid(display)
    expect(roundTrip).toBe(uuid)
  })

  it("should handle BonusCalculation variant with Amount", () => {
    type BonusCalculation = { Fixed: bigint } | { Percentage: number }

    const bonusType = IDL.Variant({
      Fixed: IDL.Nat,
      Percentage: IDL.Float64,
    })

    const codec = didToDisplayCodec<BonusCalculation>(bonusType)

    // Fixed bonus
    const fixedDisplay = codec.asDisplay({ Fixed: 5000n })
    expect(fixedDisplay).toEqual({
      _type: "Fixed",
      Fixed: "5000",
    })

    // Percentage bonus
    const percentageDisplay = codec.asDisplay({ Percentage: 10.5 })
    expect(percentageDisplay).toEqual({
      _type: "Percentage",
      Percentage: 10.5,
    })

    // Round trip
    const fixedCandid = codec.asCandid({
      _type: "Fixed",
      Fixed: "5000",
    })
    expect(fixedCandid).toEqual({ Fixed: 5000n })
  })

  it("should handle ActivityStatus complex variant", () => {
    type ActivityStatus =
      | { Pending: null }
      | { Completed: null }
      | { Failed: { error: string } }
      | { Rejected: { reason: string } }
      | { Skipped: { reason: string } }

    const statusType = IDL.Variant({
      Pending: IDL.Null,
      Completed: IDL.Null,
      Failed: IDL.Record({ error: IDL.Text }),
      Rejected: IDL.Record({ reason: IDL.Text }),
      Skipped: IDL.Record({ reason: IDL.Text }),
    })

    const codec = didToDisplayCodec<ActivityStatus>(statusType)

    // Null variants
    const pendingDisplay = codec.asDisplay({ Pending: null })
    expect(pendingDisplay).toEqual({ _type: "Pending" })

    // Variant with record
    const failedDisplay = codec.asDisplay({
      Failed: { error: "Network timeout" },
    })
    expect(failedDisplay).toEqual({
      _type: "Failed",
      Failed: { error: "Network timeout" },
    })

    // Round trip
    const rejectedCandid = codec.asCandid({
      _type: "Rejected",
      Rejected: { reason: "Invalid data" },
    })
    expect(rejectedCandid).toEqual({
      Rejected: { reason: "Invalid data" },
    })
  })

  it("should handle TransactionStatus variant", () => {
    type TransactionStatus =
      | { Pending: null }
      | { Confirmed: null }
      | { Failed: string }

    const statusType = IDL.Variant({
      Pending: IDL.Null,
      Confirmed: IDL.Null,
      Failed: IDL.Text,
    })

    const codec = didToDisplayCodec<TransactionStatus>(statusType)

    const pendingDisplay = codec.asDisplay({ Pending: null })
    expect(pendingDisplay).toEqual({ _type: "Pending" })

    const failedDisplay = codec.asDisplay({ Failed: "Insufficient funds" })
    expect(failedDisplay).toEqual({
      _type: "Failed",
      Failed: "Insufficient funds",
    })

    const confirmedCandid = codec.asCandid({ _type: "Confirmed" })
    expect(confirmedCandid).toEqual({ Confirmed: null })
  })

  it("should handle ProjectDocuments complex record with arrays and optionals", () => {
    type ProjectDocument = {
      id: string
      name: string
      artifact_id: string
      created_by: Principal
      created_at: string
    }

    type ProjectDocuments = {
      specifications: [] | [ProjectDocument]
      mockups: [] | [ProjectDocument]
      final_assets: [] | [ProjectDocument]
      revisions: Array<ProjectDocument>
      others: Array<ProjectDocument>
    }

    const documentType = IDL.Record({
      id: IDL.Text,
      name: IDL.Text,
      artifact_id: IDL.Text,
      created_by: IDL.Principal,
      created_at: IDL.Text,
    })

    const documentsType = IDL.Record({
      specifications: IDL.Opt(documentType),
      mockups: IDL.Opt(documentType),
      final_assets: IDL.Opt(documentType),
      revisions: IDL.Vec(documentType),
      others: IDL.Vec(documentType),
    })

    const codec = didToDisplayCodec<ProjectDocuments>(documentsType)

    const candidDocuments: ProjectDocuments = {
      specifications: [
        {
          id: "doc-1",
          name: "Project Specs",
          artifact_id: "art-1",
          created_by: Principal.fromText("aaaaa-aa"),
          created_at: "2024-01-15T10:00:00Z",
        },
      ],
      mockups: [],
      final_assets: [],
      revisions: [
        {
          id: "doc-2",
          name: "Revision 1",
          artifact_id: "art-2",
          created_by: Principal.fromText("2vxsx-fae"),
          created_at: "2024-01-16T10:00:00Z",
        },
      ],
      others: [],
    }

    const display = codec.asDisplay(candidDocuments)
    expect(display.specifications).toBeDefined()
    expect(display.specifications?.id).toBe("doc-1")
    expect(display.specifications?.created_by).toBe("aaaaa-aa")
    expect(display.mockups).toBeUndefined()
    expect(display.revisions).toHaveLength(1)
    expect(display.revisions[0].created_by).toBe("2vxsx-fae")
  })

  it("should handle ApiError record structure", () => {
    type ApiError = {
      code: string
      message: [] | [string]
      details: [] | [Array<[string, string]>]
    }

    const errorType = IDL.Record({
      code: IDL.Text,
      message: IDL.Opt(IDL.Text),
      details: IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))),
    })

    const codec = didToDisplayCodec<ApiError>(errorType)

    const candidError: ApiError = {
      code: "NOT_FOUND",
      message: ["Order not found"],
      details: [
        [
          ["field", "order_id"],
          ["value", "123"],
        ],
      ],
    }

    const display = codec.asDisplay(candidError)
    expect(display.code).toBe("NOT_FOUND")
    expect(display.message).toBe("Order not found")
    expect(display.details).toBeDefined()
    expect(display.details).toBeInstanceOf(Map)
    expect(display.details?.get("field")).toBe("order_id")
    expect(display.details?.get("value")).toBe("123")
    // Error without details
    const simpleError: ApiError = {
      code: "UNAUTHORIZED",
      message: [],
      details: [],
    }

    const simpleDisplay = codec.asDisplay(simpleError)
    expect(simpleDisplay.code).toBe("UNAUTHORIZED")
    expect(simpleDisplay.message).toBeUndefined()
    expect(simpleDisplay.details).toBeUndefined()
  })

  it("should handle Result<T, ApiError> pattern", () => {
    type Result<T> =
      | { Ok: T }
      | { Err: { code: string; message: [] | [string] } }

    const resultType = IDL.Variant({
      Ok: IDL.Record({ order_id: IDL.Text }),
      Err: IDL.Record({
        code: IDL.Text,
        message: IDL.Opt(IDL.Text),
      }),
    })

    const codec = didToDisplayCodec<Result<{ order_id: string }>>(resultType)

    // Success case
    const okDisplay = codec.asDisplay({ Ok: { order_id: "order-123" } })
    expect(okDisplay).toEqual({
      _type: "Ok",
      Ok: { order_id: "order-123" },
    })

    // Error case
    const errDisplay = codec.asDisplay({
      Err: { code: "INVALID_INPUT", message: ["Invalid parameters"] },
    })
    expect(errDisplay).toEqual({
      _type: "Err",
      Err: { code: "INVALID_INPUT", message: "Invalid parameters" },
    })

    // Round trip
    const okCandid = codec.asCandid({
      _type: "Ok",
      Ok: { order_id: "order-456" },
    })
    expect(okCandid).toEqual({ Ok: { order_id: "order-456" } })
  })

  it("should handle Metadata array of records", () => {
    type Metadata = Array<{ key: string; value: string }>

    const metadataType = IDL.Vec(
      IDL.Record({
        key: IDL.Text,
        value: IDL.Text,
      })
    )

    const codec = didToDisplayCodec<Metadata>(metadataType)

    const candidMetadata: Metadata = [
      { key: "version", value: "1.0" },
      { key: "environment", value: "production" },
      { key: "region", value: "us-east" },
    ]

    const display = codec.asDisplay(candidMetadata)
    expect(display).toHaveLength(3)
    expect(display[0]).toEqual({ key: "version", value: "1.0" })
    expect(display[2]).toEqual({ key: "region", value: "us-east" })

    const roundTrip = codec.asCandid(display)
    expect(roundTrip).toEqual(candidMetadata)
  })

  it("should handle SupportedBlockchain nested variant", () => {
    type SupportedBlockchain =
      | {
          InternetComputer:
            | { ICRC1: { ledger_id: string; index_id: string } }
            | { Native: null }
        }
      | {
          Ethereum:
            | { Native: null }
            | { Erc20: { ledger_id: string; contract_address: string } }
        }
      | {
          Sepolia:
            | { Native: null }
            | { Erc20: { ledger_id: string; contract_address: string } }
        }

    const blockchainType = IDL.Variant({
      InternetComputer: IDL.Variant({
        ICRC1: IDL.Record({ ledger_id: IDL.Text, index_id: IDL.Text }),
        Native: IDL.Null,
      }),
      Ethereum: IDL.Variant({
        Native: IDL.Null,
        Erc20: IDL.Record({ ledger_id: IDL.Text, contract_address: IDL.Text }),
      }),
      Sepolia: IDL.Variant({
        Native: IDL.Null,
        Erc20: IDL.Record({ ledger_id: IDL.Text, contract_address: IDL.Text }),
      }),
    })

    const codec = didToDisplayCodec<SupportedBlockchain>(blockchainType)

    // IC Native
    const icNativeDisplay = codec.asDisplay({
      InternetComputer: { Native: null },
    })
    expect(icNativeDisplay).toEqual({
      _type: "InternetComputer",
      InternetComputer: { _type: "Native" },
    })

    // IC ICRC1
    const icIcrc1Display = codec.asDisplay({
      InternetComputer: {
        ICRC1: {
          ledger_id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
          index_id: "r7inp-6aaaa-aaaaa-aaabq-cai",
        },
      },
    })
    expect(icIcrc1Display).toEqual({
      _type: "InternetComputer",
      InternetComputer: {
        _type: "ICRC1",
        ICRC1: {
          ledger_id: "ryjl3-tyaaa-aaaaa-aaaba-cai",
          index_id: "r7inp-6aaaa-aaaaa-aaabq-cai",
        },
      },
    })

    // Ethereum Erc20
    const ethErc20Display = codec.asDisplay({
      Ethereum: {
        Erc20: {
          ledger_id: "sv3dd-oaaaa-aaaar-qacoa-cai",
          contract_address: "0x1234567890abcdef",
        },
      },
    })
    expect(ethErc20Display).toEqual({
      _type: "Ethereum",
      Ethereum: {
        _type: "Erc20",
        Erc20: {
          ledger_id: "sv3dd-oaaaa-aaaar-qacoa-cai",
          contract_address: "0x1234567890abcdef",
        },
      },
    })

    // Round trip
    const sepoliaNativeCandid = codec.asCandid({
      _type: "Sepolia",
      Sepolia: { _type: "Native" },
    })
    expect(sepoliaNativeCandid).toEqual({
      Sepolia: { Native: null },
    })
  })

  it("should handle User variant with nested Principal and verification status", () => {
    // Simulate the User type structure
    const userVerificationStatusIDL = IDL.Variant({
      Suspended: IDL.Record({
        until: IDL.Opt(IDL.Text),
        suspended_at: IDL.Text,
        reason: IDL.Text,
      }),
      Denylisted: IDL.Record({
        denylisted_at: IDL.Text,
        reason: IDL.Text,
      }),
      Rejected: IDL.Record({
        rejected_at: IDL.Text,
        resubmission_allowed: IDL.Bool,
        reason: IDL.Text,
      }),
      Verified: IDL.Record({
        verification_authority: IDL.Text,
        verified_at: IDL.Text,
        verified_by: IDL.Principal,
        expires_at: IDL.Opt(IDL.Text),
      }),
      Expired: IDL.Record({
        expired_at: IDL.Text,
      }),
      Pending: IDL.Null,
    })

    const userVerificationDetailIDL = IDL.Record({
      status: userVerificationStatusIDL,
      level: IDL.Variant({
        Advanced: IDL.Null,
        Full: IDL.Null,
        None: IDL.Null,
        Basic: IDL.Null,
      }),
      submitted_at: IDL.Opt(IDL.Text),
    })

    const individualUserIDL = IDL.Record({
      id: IDL.Text,
      identity: IDL.Principal,
      verification: userVerificationDetailIDL,
      last_update_timestamp: IDL.Text,
    })

    const businessUserIDL = IDL.Record({
      id: IDL.Text,
      identity: IDL.Principal,
      verification: userVerificationDetailIDL,
      last_update_timestamp: IDL.Text,
    })

    const userIDL = IDL.Variant({
      Business: businessUserIDL,
      Individual: individualUserIDL,
    })

    const codec = didToDisplayCodec(userIDL)

    // Test Individual user with Pending verification status
    const individualCandid = {
      Individual: {
        id: "user-123",
        identity: Principal.fromText("aaaaa-aa"),
        verification: {
          status: { Pending: null },
          level: { Basic: null },
          submitted_at: [],
        },
        last_update_timestamp: "2024-01-01T00:00:00Z",
      },
    }

    const individualDisplay = codec.asDisplay(individualCandid)

    expect(individualDisplay).toEqual({
      _type: "Individual",
      Individual: {
        id: "user-123",
        identity: "aaaaa-aa", // Principal converted to string!
        verification: {
          status: { _type: "Pending" }, // Null variant
          level: { _type: "Basic" }, // Null variant
          submitted_at: undefined, // Optional [] -> undefined
        },
        last_update_timestamp: "2024-01-01T00:00:00Z",
      },
    })

    // Test Individual user with Verified status (has Principal in nested structure)
    const verifiedCandid = {
      Individual: {
        id: "user-456",
        identity: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
        verification: {
          status: {
            Verified: {
              verification_authority: "KYC Provider",
              verified_at: "2024-01-15T10:00:00Z",
              verified_by: Principal.fromText("aaaaa-aa"),
              expires_at: ["2025-01-15T10:00:00Z"],
            },
          },
          level: { Full: null },
          submitted_at: ["2024-01-10T09:00:00Z"],
        },
        last_update_timestamp: "2024-01-15T10:00:00Z",
      },
    }

    const verifiedDisplay = codec.asDisplay(verifiedCandid)

    expect(verifiedDisplay).toEqual({
      _type: "Individual",
      Individual: {
        id: "user-456",
        identity: "rrkah-fqaaa-aaaaa-aaaaq-cai", // Principal converted to string!
        verification: {
          status: {
            _type: "Verified",
            Verified: {
              verification_authority: "KYC Provider",
              verified_at: "2024-01-15T10:00:00Z",
              verified_by: "aaaaa-aa", // Nested Principal converted to string!
              expires_at: "2025-01-15T10:00:00Z", // Optional [T] -> T
            },
          },
          level: { _type: "Full" },
          submitted_at: "2024-01-10T09:00:00Z", // Optional [T] -> T
        },
        last_update_timestamp: "2024-01-15T10:00:00Z",
      },
    })

    // Test Business user
    const businessCandid = {
      Business: {
        id: "business-789",
        identity: Principal.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
        verification: {
          status: { Pending: null },
          level: { Advanced: null },
          submitted_at: [],
        },
        last_update_timestamp: "2024-01-20T12:00:00Z",
      },
    }

    const businessDisplay = codec.asDisplay(businessCandid)

    expect(businessDisplay).toEqual({
      _type: "Business",
      Business: {
        id: "business-789",
        identity: "rrkah-fqaaa-aaaaa-aaaaq-cai",
        verification: {
          status: { _type: "Pending" },
          level: { _type: "Advanced" },
          submitted_at: undefined,
        },
        last_update_timestamp: "2024-01-20T12:00:00Z",
      },
    })
  })

  it("should handle Result<User, ApiError> with deeply nested structures", () => {
    // Simulate the exact structure from get_user API
    const userVerificationStatusIDL = IDL.Variant({
      Suspended: IDL.Record({
        until: IDL.Opt(IDL.Text),
        suspended_at: IDL.Text,
        reason: IDL.Text,
      }),
      Denylisted: IDL.Record({
        denylisted_at: IDL.Text,
        reason: IDL.Text,
      }),
      Rejected: IDL.Record({
        rejected_at: IDL.Text,
        resubmission_allowed: IDL.Bool,
        reason: IDL.Text,
      }),
      Verified: IDL.Record({
        verification_authority: IDL.Text,
        verified_at: IDL.Text,
        verified_by: IDL.Principal,
        expires_at: IDL.Opt(IDL.Text),
      }),
      Expired: IDL.Record({
        expired_at: IDL.Text,
      }),
      Pending: IDL.Null,
    })

    const userVerificationDetailIDL = IDL.Record({
      status: userVerificationStatusIDL,
      level: IDL.Variant({
        Advanced: IDL.Null,
        Full: IDL.Null,
        None: IDL.Null,
        Basic: IDL.Null,
      }),
      submitted_at: IDL.Opt(IDL.Text),
    })

    const individualUserIDL = IDL.Record({
      id: IDL.Text,
      identity: IDL.Principal,
      verification: userVerificationDetailIDL,
      last_update_timestamp: IDL.Text,
    })

    const businessUserIDL = IDL.Record({
      id: IDL.Text,
      identity: IDL.Principal,
      verification: userVerificationDetailIDL,
      last_update_timestamp: IDL.Text,
    })

    const userIDL = IDL.Variant({
      Business: businessUserIDL,
      Individual: individualUserIDL,
    })

    const apiErrorIDL = IDL.Record({
      code: IDL.Text,
      message: IDL.Text,
    })

    // Result<{ user: User }, ApiError>
    const resultIDL = IDL.Variant({
      Ok: IDL.Record({ user: userIDL }),
      Err: apiErrorIDL,
    })

    const codec = didToDisplayCodec(resultIDL)

    // Test successful result with Individual user
    const okCandid = {
      Ok: {
        user: {
          Individual: {
            id: "user-123",
            identity: Principal.fromText("aaaaa-aa"),
            verification: {
              status: {
                Verified: {
                  verification_authority: "KYC Provider",
                  verified_at: "2024-01-15T10:00:00Z",
                  verified_by: Principal.fromText(
                    "rrkah-fqaaa-aaaaa-aaaaq-cai"
                  ),
                  expires_at: ["2025-01-15T10:00:00Z"],
                },
              },
              level: { Full: null },
              submitted_at: ["2024-01-10T09:00:00Z"],
            },
            last_update_timestamp: "2024-01-15T10:00:00Z",
          },
        },
      },
    }

    const okDisplay = codec.asDisplay(okCandid)

    expect(okDisplay).toEqual({
      _type: "Ok",
      Ok: {
        user: {
          _type: "Individual",
          Individual: {
            id: "user-123",
            identity: "aaaaa-aa", // Principal converted!
            verification: {
              status: {
                _type: "Verified",
                Verified: {
                  verification_authority: "KYC Provider",
                  verified_at: "2024-01-15T10:00:00Z",
                  verified_by: "rrkah-fqaaa-aaaaa-aaaaq-cai", // Nested Principal converted!
                  expires_at: "2025-01-15T10:00:00Z",
                },
              },
              level: { _type: "Full" },
              submitted_at: "2024-01-10T09:00:00Z",
            },
            last_update_timestamp: "2024-01-15T10:00:00Z",
          },
        },
      },
    })

    // Test error result
    const errCandid = {
      Err: {
        code: "NOT_FOUND",
        message: "User not found",
      },
    }

    const errDisplay = codec.asDisplay(errCandid)

    expect(errDisplay).toEqual({
      _type: "Err",
      Err: {
        code: "NOT_FOUND",
        message: "User not found",
      },
    })
  })
})
