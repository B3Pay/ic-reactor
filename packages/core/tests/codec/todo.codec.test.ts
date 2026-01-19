import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { todoIDLTypes } from "./idl-types"
import { didToDisplayCodec } from "../../src/display/helper"

describe("Codec Visitor - Todo Types", () => {
  const idlTypes = todoIDLTypes

  describe("TodoStatus Variant", () => {
    const codec = didToDisplayCodec(idlTypes.TodoStatus)

    it("should transform Candid to Display format", () => {
      const candidValue = { Cancelled: ["User requested cancellation"] }
      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({
        _type: "Cancelled",
        Cancelled: "User requested cancellation",
      })
    })

    it("should transform Display to Candid format", () => {
      const displayValue = { _type: "Completed" }
      const candidValue = codec.asCandid(displayValue)
      expect(candidValue).toEqual({ Completed: null })
    })

    it("should handle null variants", () => {
      const candidValue = { Pending: null }
      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({ _type: "Pending" })

      const backToCandid = codec.asCandid(displayValue)
      expect(backToCandid).toEqual({ Pending: null })
    })

    it("should handle optional values in variants", () => {
      const candidValue = { Cancelled: [] } // Empty optional
      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({ _type: "Cancelled", Cancelled: undefined })
    })
  })

  describe("UserRole Variant", () => {
    const codec = didToDisplayCodec(idlTypes.UserRole)

    it("should transform all role types", () => {
      const roles = ["Admin", "Editor", "Viewer", "Owner", "Contributor"]

      roles.forEach((role) => {
        const candidValue = { [role]: null }
        const displayValue = codec.asDisplay(candidValue)
        expect(displayValue).toEqual({ _type: role })

        const backToCandid = codec.asCandid(displayValue)
        expect(backToCandid).toEqual({ [role]: null })
      })
    })
  })

  describe("Todo Record", () => {
    const codec = didToDisplayCodec(idlTypes.Todo)

    it("should transform complex record with nested variants", () => {
      const principal = Principal.fromText("aaaaa-aa")
      const candidValue = {
        id: "todo-123",
        todo_type: { Category: { Work: null } },
        description: "Complete the project documentation",
        metadata: [
          { key: "priority", value: "high" },
          { key: "tags", value: "docs" },
        ],
        title: "Project Docs",
        content_hash: "abc123def456",
        priority: 1,
        due_date: "2024-12-31",
        created_at: "2024-01-01T00:00:00Z",
        created_by: principal,
        status: { InProgress: null },
        reviews: [],
      }

      const displayValue = codec.asDisplay(candidValue)

      expect(displayValue).toEqual({
        id: "todo-123",
        todo_type: {
          _type: "Category",
          Category: { _type: "Work" },
        },
        description: "Complete the project documentation",
        metadata: [
          { key: "priority", value: "high" },
          { key: "tags", value: "docs" },
        ],
        title: "Project Docs",
        content_hash: "abc123def456",
        priority: 1,
        due_date: "2024-12-31",
        created_at: "2024-01-01T00:00:00Z",
        created_by: "aaaaa-aa",
        status: { _type: "InProgress" },
        reviews: [],
      })

      const backToCandid = codec.asCandid(displayValue)
      expect(backToCandid).toEqual(candidValue)
    })
  })

  describe("Metadata Array", () => {
    const codec = didToDisplayCodec(IDL.Vec(idlTypes.Metadata))

    it("should handle arrays of records", () => {
      const candidValue = [
        { key: "category", value: "work" },
        { key: "version", value: "1.0" },
      ]

      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual(candidValue) // No transformation needed for text fields

      const backToCandid = codec.asCandid(displayValue)
      expect(backToCandid).toEqual(candidValue)
    })
  })

  describe("Optional Fields", () => {
    const OptionalFieldIDL = IDL.Record({
      required_field: IDL.Text,
      optional_field: IDL.Opt(IDL.Text),
      nested_optional: IDL.Opt(
        IDL.Record({
          inner: IDL.Text,
        })
      ),
    })

    const codec = didToDisplayCodec(OptionalFieldIDL)

    it("should handle present optional values", () => {
      const candidValue = {
        required_field: "required",
        optional_field: ["optional value"],
        nested_optional: [{ inner: "nested value" }],
      }

      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({
        required_field: "required",
        optional_field: "optional value",
        nested_optional: { inner: "nested value" },
      })

      const backToCandid = codec.asCandid(displayValue)
      expect(backToCandid).toEqual(candidValue)
    })

    it("should handle absent optional values", () => {
      const candidValue = {
        required_field: "required",
        optional_field: [],
        nested_optional: [],
      }

      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({
        required_field: "required",
        optional_field: undefined,
        nested_optional: undefined,
      })

      const backToCandid = codec.asCandid(displayValue)
      expect(backToCandid).toEqual(candidValue)
    })
  })

  describe("BigInt/Nat Transformation", () => {
    const BigIntRecordIDL = IDL.Record({
      amount: IDL.Nat,
      timestamp: IDL.Int,
      small_number: IDL.Nat32, // This should stay as number if < 32 bits
    })

    const codec = didToDisplayCodec(BigIntRecordIDL)

    it("should transform bigints to strings", () => {
      const candidValue = {
        amount: 1000000n,
        timestamp: -1609459200000000n, // Some timestamp
        small_number: 42, // Small number stays as number
      }

      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({
        amount: "1000000",
        timestamp: "-1609459200000000",
        small_number: 42,
      })

      const backToCandid = codec.asCandid(displayValue)
      expect(backToCandid).toEqual(candidValue)
    })
  })

  describe("Principal Transformation", () => {
    const PrincipalRecordIDL = IDL.Record({
      owner: IDL.Principal,
      creator: IDL.Principal,
    })

    const codec = didToDisplayCodec(PrincipalRecordIDL)

    it("should transform principals to text", () => {
      const principal1 = Principal.fromText("aaaaa-aa")
      const principal2 = Principal.fromText("2vxsx-fae")

      const candidValue = {
        owner: principal1,
        creator: principal2,
      }

      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({
        owner: "aaaaa-aa",
        creator: "2vxsx-fae",
      })

      const backToCandid = codec.asCandid(displayValue) as typeof candidValue
      expect((backToCandid as any).owner).toEqual(principal1)
      expect((backToCandid as any).creator).toEqual(principal2)
    })
  })

  describe("Blob/Uint8Array Transformation", () => {
    const BlobRecordIDL = IDL.Record({
      content: IDL.Vec(IDL.Nat8),
      hash: IDL.Text,
    })

    const codec = didToDisplayCodec(BlobRecordIDL)

    it("should transform Uint8Array to hex string", () => {
      const content = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
      const candidValue = {
        content,
        hash: "sha256-hash",
      }

      const displayValue = codec.asDisplay(candidValue)
      expect(displayValue).toEqual({
        content: "48656c6c6f", // "Hello" in hex
        hash: "sha256-hash",
      })

      const backToCandid = codec.asCandid(displayValue) as typeof candidValue
      expect((backToCandid as any).content).toEqual(content)
      expect((backToCandid as any).hash).toEqual("sha256-hash")
    })
  })

  describe("Complex Nested Structure", () => {
    const ComplexIDL = IDL.Record({
      id: IDL.Text,
      status: IDL.Variant({
        Active: IDL.Null,
        Inactive: IDL.Record({ reason: IDL.Text }),
      }),
      metadata: IDL.Vec(
        IDL.Record({
          key: IDL.Text,
          value: IDL.Opt(IDL.Text),
        })
      ),
      amount: IDL.Nat,
      owner: IDL.Principal,
      tags: IDL.Opt(IDL.Vec(IDL.Text)),
    })

    const codec = didToDisplayCodec(ComplexIDL)

    it("should handle complex nested transformations", () => {
      const principal = Principal.fromText("aaaaa-aa")

      const candidValue = {
        id: "complex-123",
        status: { Active: null },
        metadata: [
          { key: "category", value: ["contract"] },
          { key: "version", value: [] },
        ],
        amount: 5000000n,
        owner: principal,
        tags: [["tag1", "tag2"]],
      }

      const displayValue = codec.asDisplay(candidValue)

      expect(displayValue).toEqual({
        id: "complex-123",
        status: { _type: "Active" },
        metadata: [
          { key: "category", value: "contract" },
          { key: "version", value: undefined },
        ],
        amount: "5000000",
        owner: "aaaaa-aa",
        tags: ["tag1", "tag2"],
      })

      const backToCandid = codec.asCandid(displayValue) as typeof candidValue
      expect((backToCandid as any).id).toEqual("complex-123")
      expect((backToCandid as any).status).toEqual({ Active: null })
      expect((backToCandid as any).metadata).toEqual([
        { key: "category", value: ["contract"] },
        { key: "version", value: [] },
      ])
      expect((backToCandid as any).amount).toEqual(5000000n)
      expect((backToCandid as any).owner).toEqual(principal)
      expect((backToCandid as any).tags).toEqual([["tag1", "tag2"]])
    })
  })

  describe("Round-trip Consistency", () => {
    const TestIDL = IDL.Record({
      text_field: IDL.Text,
      number_field: IDL.Nat,
      optional_field: IDL.Opt(IDL.Text),
      variant_field: IDL.Variant({
        OptionA: IDL.Null,
        OptionB: IDL.Record({ value: IDL.Text }),
      }),
      array_field: IDL.Vec(IDL.Text),
    })

    const codec = didToDisplayCodec(TestIDL)

    it("should maintain data integrity through round-trip transformations", () => {
      const originalCandid = {
        text_field: "test",
        number_field: 123n,
        optional_field: ["optional"],
        variant_field: { OptionB: { value: "variant_value" } },
        array_field: ["item1", "item2"],
      }

      const display = codec.asDisplay(originalCandid)
      const backToCandid = codec.asCandid(display)

      expect(backToCandid).toEqual(originalCandid)
    })

    it("should handle null optionals in round-trip", () => {
      const originalCandid = {
        text_field: "test",
        number_field: 456n,
        optional_field: [],
        variant_field: { OptionA: null },
        array_field: [],
      }

      const display = codec.asDisplay(originalCandid)
      const backToCandid = codec.asCandid(display)

      expect(backToCandid).toEqual(originalCandid)
    })
  })
})
