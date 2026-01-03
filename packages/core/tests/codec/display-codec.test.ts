import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { didToDisplayCodec } from "../../src/display"

describe("Zod Codec - didToDisplayCodec", () => {
  describe("Primitive Types", () => {
    it("should handle IDL.Text", () => {
      const codec = didToDisplayCodec(IDL.Text)

      const decoded = codec.asDisplay("hello")
      expect(decoded).toBe("hello")

      const encoded = codec.asCandid("world")
      expect(encoded).toBe("world")
    })

    it("should handle IDL.Bool", () => {
      const codec = didToDisplayCodec(IDL.Bool)

      expect(codec.asDisplay(true)).toBe(true)
      expect(codec.asDisplay(false)).toBe(false)
      expect(codec.asCandid(true)).toBe(true)
      expect(codec.asCandid(false)).toBe(false)
    })

    it("should handle IDL.Null", () => {
      const codec = didToDisplayCodec(IDL.Null)

      expect(codec.asDisplay(null)).toBe(null)
      expect(codec.asCandid(null)).toBe(null)
    })
  })

  describe("Number Types", () => {
    it("should convert IDL.Nat to/from string", () => {
      const codec = didToDisplayCodec(IDL.Nat)

      const decoded = codec.asDisplay(1000n)
      expect(decoded).toBe("1000")

      const encoded = codec.asCandid("1000")
      expect(encoded).toBe(1000n)
    })

    it("should convert IDL.Int to/from string", () => {
      const codec = didToDisplayCodec(IDL.Int)

      expect(codec.asDisplay(-500n)).toBe("-500")
      expect(codec.asDisplay(500n)).toBe("500")
      expect(codec.asCandid("-500")).toBe(-500n)
      expect(codec.asCandid("500")).toBe(500n)
    })

    it("should convert IDL.Nat64 to/from string", () => {
      const codec = didToDisplayCodec(IDL.Nat64)

      const decoded = codec.asDisplay(9007199254740991n)
      expect(decoded).toBe("9007199254740991")

      const encoded = codec.asCandid("9007199254740991")
      expect(encoded).toBe(9007199254740991n)
    })

    it("should handle IDL.Nat32 as number", () => {
      const codec = didToDisplayCodec(IDL.Nat32)

      expect(codec.asDisplay(42)).toBe(42)
      expect(codec.asCandid(42)).toBe(42)
    })

    it("should handle IDL.Float64", () => {
      const codec = didToDisplayCodec(IDL.Float64)

      expect(codec.asDisplay(3.14)).toBe(3.14)
      expect(codec.asCandid(3.14)).toBe(3.14)
    })
  })

  describe("Principal Type", () => {
    it("should convert Principal to/from string", () => {
      const codec = didToDisplayCodec<Principal>(IDL.Principal)
      const principalText = "ryjl3-tyaaa-aaaaa-aaaba-cai"
      const principal = Principal.fromText(principalText)

      const decoded = codec.asDisplay(principal)
      expect(decoded).toBe(principalText)

      const encoded = codec.asCandid(principalText)
      expect(encoded).toBeInstanceOf(Principal)
      expect(encoded.toText()).toBe(principalText)
    })

    it("should handle Principal already as string in decode", () => {
      const codec = didToDisplayCodec<Principal>(IDL.Principal)
      const principalText = "ryjl3-tyaaa-aaaaa-aaaba-cai"

      const decoded = codec.asDisplay(principalText as any)
      expect(decoded).toBe(principalText)
    })

    it("should handle Principal instance in encode", () => {
      const codec = didToDisplayCodec<Principal>(IDL.Principal)
      const principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

      const encoded = codec.asCandid(principal as any)
      expect(encoded).toBeInstanceOf(Principal)
    })
  })

  describe("Optional Types", () => {
    it("should convert [] to undefined", () => {
      const codec = didToDisplayCodec(IDL.Opt(IDL.Text))

      const decoded = codec.asDisplay([])
      expect(decoded).toBeUndefined()
    })

    it("should convert [value] to value", () => {
      const codec = didToDisplayCodec(IDL.Opt(IDL.Text))

      const decoded = codec.asDisplay(["hello"])
      expect(decoded).toBe("hello")
    })

    it("should convert undefined to []", () => {
      const codec = didToDisplayCodec(IDL.Opt(IDL.Text))

      const encoded = codec.asCandid(undefined)
      expect(encoded).toEqual([])
    })

    it("should convert null to []", () => {
      const codec = didToDisplayCodec(IDL.Opt(IDL.Text))

      const encoded = codec.asCandid(null)
      expect(encoded).toEqual([])
    })

    it("should convert value to [value]", () => {
      const codec = didToDisplayCodec(IDL.Opt(IDL.Text))

      const encoded = codec.asCandid("hello")
      expect(encoded).toEqual(["hello"])
    })

    it("should handle nested optional with bigint", () => {
      const codec = didToDisplayCodec(IDL.Opt(IDL.Nat))

      const decoded = codec.asDisplay([1000n])
      expect(decoded).toBe("1000")

      const encoded = codec.asCandid("1000")
      expect(encoded).toEqual([1000n])
    })
  })

  describe("Vec (Array) Types", () => {
    it("should handle Vec of Text", () => {
      const codec = didToDisplayCodec(IDL.Vec(IDL.Text))

      const decoded = codec.asDisplay(["a", "b", "c"])
      expect(decoded).toEqual(["a", "b", "c"])

      const encoded = codec.asCandid(["x", "y", "z"])
      expect(encoded).toEqual(["x", "y", "z"])
    })

    it("should handle Vec of Nat with transformation", () => {
      const codec = didToDisplayCodec(IDL.Vec(IDL.Nat))

      const decoded = codec.asDisplay([1n, 2n, 3n])
      expect(decoded).toEqual(["1", "2", "3"])

      const encoded = codec.asCandid(["10", "20", "30"])
      expect(encoded).toEqual([10n, 20n, 30n])
    })

    it("should handle Vec of Nat8 as Uint8Array (blob)", () => {
      const codec = didToDisplayCodec(IDL.Vec(IDL.Nat8))
      const bytes = new Uint8Array([1, 2, 3, 4])

      // Small blobs get converted to hex
      const decoded = codec.asDisplay(bytes)
      expect(typeof decoded).toBe("string")
      expect(decoded).toMatch(/^0x[0-9a-f]+$/)

      // Hex strings get converted back to Uint8Array
      const encoded = codec.asCandid("0x01020304") as Uint8Array
      expect(encoded).toBeInstanceOf(Uint8Array)
      expect(Array.from(encoded)).toEqual([1, 2, 3, 4])
    })

    it("should handle large Vec of Nat8 as Uint8Array without hex conversion", () => {
      const codec = didToDisplayCodec<Uint8Array>(IDL.Vec(IDL.Nat8))
      // Create a large array (> 96 bytes)
      const largeBytes = new Uint8Array(100).fill(42)

      const decoded = codec.asDisplay(largeBytes)
      expect(decoded).toBeInstanceOf(Uint8Array)
      expect(decoded).toEqual(largeBytes)

      const encoded = codec.asCandid(largeBytes)
      expect(encoded).toBeInstanceOf(Uint8Array)
      expect(encoded).toEqual(decoded)
    })
  })

  describe("Record Types", () => {
    it("should handle simple record", () => {
      const PersonType = IDL.Record({
        name: IDL.Text,
        age: IDL.Nat,
      })
      const codec = didToDisplayCodec(PersonType)

      const decoded = codec.asDisplay({
        name: "Alice",
        age: 30n,
      })
      expect(decoded).toEqual({
        name: "Alice",
        age: "30",
      })

      const encoded = codec.asCandid({
        name: "Bob",
        age: "25",
      })
      expect(encoded).toEqual({
        name: "Bob",
        age: 25n,
      })
    })

    it("should handle nested records", () => {
      const AddressType = IDL.Record({
        street: IDL.Text,
        city: IDL.Text,
      })
      const PersonType = IDL.Record({
        name: IDL.Text,
        address: AddressType,
      })
      const codec = didToDisplayCodec(PersonType)

      const decoded = codec.asDisplay({
        name: "Alice",
        address: {
          street: "123 Main St",
          city: "NYC",
        },
      })
      expect(decoded).toEqual({
        name: "Alice",
        address: {
          street: "123 Main St",
          city: "NYC",
        },
      })
    })

    it("should handle record with optional fields", () => {
      const PersonType = IDL.Record({
        name: IDL.Text,
        email: IDL.Opt(IDL.Text),
      })
      const codec = didToDisplayCodec(PersonType)

      const decoded = codec.asDisplay({
        name: "Alice",
        email: ["alice@example.com"],
      })
      expect(decoded).toEqual({
        name: "Alice",
        email: "alice@example.com",
      })

      const decodedNoEmail = codec.asDisplay({
        name: "Bob",
        email: [],
      })
      expect(decodedNoEmail).toEqual({
        name: "Bob",
        email: undefined,
      })
    })
  })

  describe("Variant Types", () => {
    it("should convert variant to discriminated union", () => {
      const StatusType = IDL.Variant({
        Active: IDL.Null,
        Completed: IDL.Null,
        Cancelled: IDL.Null,
      })
      const codec = didToDisplayCodec(StatusType)

      const decoded = codec.asDisplay({ Active: null })
      expect(decoded).toEqual({ _type: "Active" })

      const encoded = codec.asCandid({ _type: "Completed" })
      expect(encoded).toEqual({ Completed: null })
    })

    it("should handle variant with values", () => {
      const ResultType = IDL.Variant({
        Ok: IDL.Text,
        Err: IDL.Text,
      })
      const codec = didToDisplayCodec(ResultType)

      const decodedOk = codec.asDisplay({ Ok: "success" })
      expect(decodedOk).toEqual({
        _type: "Ok",
        Ok: "success",
      })

      const decodedErr = codec.asDisplay({ Err: "failed" })
      expect(decodedErr).toEqual({
        _type: "Err",
        Err: "failed",
      })

      const encodedOk = codec.asCandid({
        _type: "Ok",
        Ok: "success",
      })
      expect(encodedOk).toEqual({ Ok: "success" })

      const encodedErr = codec.asCandid({
        _type: "Err",
        Err: "failed",
      })
      expect(encodedErr).toEqual({ Err: "failed" })
    })

    it("should handle variant with complex types", () => {
      const ResultType = IDL.Variant({
        Ok: IDL.Record({
          id: IDL.Nat,
          name: IDL.Text,
        }),
        Err: IDL.Text,
      })
      const codec = didToDisplayCodec(ResultType)

      const decoded = codec.asDisplay({
        Ok: { id: 123n, name: "Alice" },
      })
      expect(decoded).toEqual({
        _type: "Ok",
        Ok: { id: "123", name: "Alice" },
      })

      const encoded = codec.asCandid({
        _type: "Ok",
        Ok: { id: "456", name: "Bob" },
      })
      expect(encoded).toEqual({
        Ok: { id: 456n, name: "Bob" },
      })
    })
  })

  describe("Tuple Types", () => {
    it("should handle simple tuple", () => {
      const TupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const codec = didToDisplayCodec(TupleType)

      const decoded = codec.asDisplay(["hello", 42n])
      expect(decoded).toEqual(["hello", "42"])

      const encoded = codec.asCandid(["world", "100"])
      expect(encoded).toEqual(["world", 100n])
    })

    it("should handle tuple with mixed types", () => {
      const TupleType = IDL.Tuple(IDL.Text, IDL.Nat, IDL.Bool, IDL.Principal)
      const codec = didToDisplayCodec(TupleType)
      const principal = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

      const decoded = codec.asDisplay(["test", 42n, true, principal])
      expect(decoded).toEqual([
        "test",
        "42",
        true,
        "ryjl3-tyaaa-aaaaa-aaaba-cai",
      ])
    })
  })

  describe("Complex Nested Types", () => {
    it("should handle record with variant and optional fields", () => {
      const UserType = IDL.Record({
        id: IDL.Nat,
        name: IDL.Text,
        status: IDL.Variant({
          Active: IDL.Null,
          Suspended: IDL.Text,
        }),
        email: IDL.Opt(IDL.Text),
      })
      const codec = didToDisplayCodec(UserType)

      const decoded = codec.asDisplay({
        id: 123n,
        name: "Alice",
        status: { Active: null },
        email: ["alice@example.com"],
      })

      expect(decoded).toEqual({
        id: "123",
        name: "Alice",
        status: { _type: "Active" },
        email: "alice@example.com",
      })

      const encoded = codec.asCandid({
        id: "456",
        name: "Bob",
        status: { _type: "Suspended", Suspended: "Violation" },
        email: undefined,
      })

      expect(encoded).toEqual({
        id: 456n,
        name: "Bob",
        status: { Suspended: "Violation" },
        email: [],
      })
    })

    it("should handle array of records with variants", () => {
      const ItemType = IDL.Record({
        id: IDL.Nat,
        status: IDL.Variant({
          Pending: IDL.Null,
          Completed: IDL.Null,
        }),
      })
      const codec = didToDisplayCodec(IDL.Vec(ItemType))

      const decoded = codec.asDisplay([
        { id: 1n, status: { Pending: null } },
        { id: 2n, status: { Completed: null } },
      ])

      expect(decoded).toEqual([
        { id: "1", status: { _type: "Pending" } },
        { id: "2", status: { _type: "Completed" } },
      ])
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty record", () => {
      const EmptyType = IDL.Record({})
      const codec = didToDisplayCodec(EmptyType)

      expect(codec.asDisplay({})).toEqual({})
      expect(codec.asCandid({})).toEqual({})
    })

    it("should handle empty tuple", () => {
      const EmptyTuple = IDL.Tuple()
      const codec = didToDisplayCodec(EmptyTuple)

      expect(codec.asDisplay([])).toEqual([])
      expect(codec.asCandid([])).toEqual([])
    })

    it("should handle very large bigint", () => {
      const codec = didToDisplayCodec(IDL.Nat)
      const largeBigInt = 123456789012345678901234567890n

      const decoded = codec.asDisplay(largeBigInt)
      expect(decoded).toBe("123456789012345678901234567890")

      const encoded = codec.asCandid("123456789012345678901234567890")
      expect(encoded).toBe(largeBigInt)
    })
  })
})
