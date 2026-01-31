import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { FieldVisitor } from "./index"
import * as z from "zod"

describe("FieldVisitor Schema Generation", () => {
  const visitor = new FieldVisitor()

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Primitive Types", () => {
    it("should generate string schema for text", () => {
      const field = visitor.visitText(IDL.Text, "username")
      const schema = field.schema

      expect(schema).toBeDefined()
      expect(schema.parse("hello")).toBe("hello")
      expect(() => schema.parse(123)).toThrow()
    })

    it("should generate boolean schema for bool", () => {
      const field = visitor.visitBool(IDL.Bool, "isActive")
      const schema = field.schema

      expect(schema.parse(true)).toBe(true)
      expect(schema.parse(false)).toBe(false)
      expect(() => schema.parse("true")).toThrow()
    })

    it("should generate null schema for null", () => {
      const field = visitor.visitNull(IDL.Null, "void")
      const schema = field.schema

      expect(schema.parse(null)).toBe(null)
      expect(() => schema.parse(undefined)).toThrow()
    })

    it("should generate string schema for numbers (form input matching)", () => {
      // The visitor currently generates string schemas for numbers to match form inputs
      const natField = visitor.visitNat(IDL.Nat, "amount")
      expect(natField.schema.parse("100")).toBe("100")

      const intField = visitor.visitInt(IDL.Int, "balance")
      expect(intField.schema.parse("-50")).toBe("-50")
    })

    it("should generate principal schema", () => {
      const field = visitor.visitPrincipal(IDL.Principal, "owner")
      const schema = field.schema

      const p = Principal.fromText("2vxsx-fae")
      // Should accept Principal instance
      expect(schema.parse(p)).toEqual(p)
      // Should accept valid string representation
      expect(schema.parse("2vxsx-fae")).toBe("2vxsx-fae")

      // Should reject invalid
      expect(() => schema.parse("invalid-principal")).toThrow()
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Format Detection & Validation
  // ════════════════════════════════════════════════════════════════════════

  describe("Format Detection & Validation", () => {
    describe("Text Formats", () => {
      it("should detect email format", () => {
        const field = visitor.visitText(IDL.Text, "user_email")

        expect(field.format).toBe("email")
        expect(field.inputProps).toMatchObject({
          type: "email",
          inputMode: "email",
        })

        // Valid email
        expect(field.schema.parse("test@example.com")).toBe("test@example.com")
        // Invalid email
        expect(() => field.schema.parse("invalid-email")).toThrow()
      })

      it("should detect url format", () => {
        const field = visitor.visitText(IDL.Text, "website_link")

        expect(field.format).toBe("url")
        expect(field.inputProps).toMatchObject({
          type: "url",
          inputMode: "url",
        })

        // Valid URL
        expect(field.schema.parse("https://example.com")).toBe(
          "https://example.com"
        )
        // Invalid URL
        expect(() => field.schema.parse("not-a-url")).toThrow()
      })

      it("should detect uuid format", () => {
        const field = visitor.visitText(IDL.Text, "transaction_uuid")

        expect(field.format).toBe("uuid")

        const validUuid = "123e4567-e89b-12d3-a456-426614174000"
        expect(field.schema.parse(validUuid)).toBe(validUuid)

        expect(() => field.schema.parse("invalid-uuid")).toThrow()
      })

      it("should detect ethereum address format", () => {
        const field = visitor.visitText(IDL.Text, "eth_address")

        expect(field.format).toBe("eth")
        expect(field.inputProps.pattern).toContain("0x")
      })

      it("should fallback to plain text for unknown formats", () => {
        const field = visitor.visitText(IDL.Text, "some_random_field")

        expect(field.format).toBe("plain")
        expect(field.inputProps).toMatchObject({
          type: "text",
        })
      })
    })

    describe("Number Formats", () => {
      it("should detect timestamp format", () => {
        const field = visitor.visitInt(IDL.Int, "created_at")

        expect(field.format).toBe("timestamp")
      })

      it("should detect cycle format", () => {
        const field = visitor.visitNat(IDL.Nat, "cycles_balance")

        expect(field.format).toBe("cycle")
      })

      it("should fallback to normal format", () => {
        const field = visitor.visitNat(IDL.Nat, "quantity")

        expect(field.format).toBe("plain")
      })
    })

    describe("Principal Format", () => {
      it("should detect principal format and set properties", () => {
        const field = visitor.visitPrincipal(
          IDL.Principal,
          "controller_principal"
        )

        expect(field.format).toBe("principal")
        expect(field.inputProps).toMatchObject({
          minLength: 7,
          maxLength: 64,
        })
      })
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Record Types", () => {
    it("should generate object schema for record", () => {
      const recordType = IDL.Record({
        name: IDL.Text,
        age: IDL.Nat,
      })
      const field = visitor.visitRecord(
        recordType,
        [
          ["name", IDL.Text],
          ["age", IDL.Nat],
        ],
        "person"
      )
      const schema = field.schema as z.ZodObject<any>

      const validData = { name: "John", age: "30" }
      expect(schema.parse(validData)).toEqual(validData)

      expect(() => schema.parse({ name: "John" })).toThrow() // missing age
      expect(() => schema.parse({ name: 123, age: "30" })).toThrow() // invalid type
    })
  })

  describe("Variant Types", () => {
    it("should generate union schema for variant", () => {
      const variantType = IDL.Variant({
        Ok: IDL.Text,
        Err: IDL.Text,
      })
      const field = visitor.visitVariant(
        variantType,
        [
          ["Ok", IDL.Text],
          ["Err", IDL.Text],
        ],
        "result"
      )
      const schema = field.schema as z.ZodUnion<any>

      expect(schema.parse({ _type: "Ok", Ok: "Success" })).toEqual({
        _type: "Ok",
        Ok: "Success",
      })
      expect(schema.parse({ _type: "Err", Err: "Error" })).toEqual({
        _type: "Err",
        Err: "Error",
      })

      expect(() => schema.parse({ _type: "Other", Other: "value" })).toThrow()
    })
  })

  describe("Tuple Types", () => {
    it("should generate tuple schema", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const field = visitor.visitTuple(tupleType, [IDL.Text, IDL.Nat], "pair")
      const schema = field.schema as z.ZodTuple<any>

      expect(schema.parse(["key", "100"])).toEqual(["key", "100"])
      expect(() => schema.parse(["key"])).toThrow()
    })
  })

  describe("Optional Types", () => {
    it("should generate nullable/optional schema", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = visitor.visitOpt(optType, IDL.Text, "maybe")
      const schema = field.schema

      expect(schema.parse("value")).toBe("value")
      expect(schema.parse(null)).toBe(null)
      expect(schema.parse(undefined)).toBe(null) // nullish() allows undefined -> null
    })
  })

  describe("Vector Types", () => {
    it("should generate array schema", () => {
      const vecType = IDL.Vec(IDL.Text)
      const field = visitor.visitVec(vecType, IDL.Text, "tags")
      const schema = field.schema

      expect(schema.parse(["a", "b"])).toEqual(["a", "b"])
      expect(schema.parse([])).toEqual([])
      expect(() => schema.parse("not array")).toThrow()
    })

    it("should generate special schema for blob", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")
      const schema = field.schema

      // Blob accepts string (hex) or array of numbers
      expect(schema.parse("deadbeef")).toBe("deadbeef")
      expect(schema.parse([1, 2, 3])).toEqual([1, 2, 3])
      expect(() => schema.parse(123)).toThrow()
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Recursive Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Recursive Types", () => {
    it("should handle recursive schemas", () => {
      const List = IDL.Rec()
      const ListVariant = IDL.Variant({
        Nil: IDL.Null,
        Cons: IDL.Record({
          head: IDL.Nat,
          tail: List,
        }),
      })
      List.fill(ListVariant)

      const field = visitor.visitRec(List, ListVariant, "list")
      const schema = field.schema

      const validList = {
        _type: "Cons",
        Cons: {
          head: "1",
          tail: {
            _type: "Cons",
            Cons: {
              head: "2",
              tail: { _type: "Nil" },
            },
          },
        },
      }

      expect(schema.parse(validList)).toEqual(validList)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Method Schema
  // ════════════════════════════════════════════════════════════════════════

  describe("Method Schema", () => {
    it("should generate tuple schema for function arguments", () => {
      const funcType = IDL.Func([IDL.Text, IDL.Nat], [], [])
      const meta = visitor.visitFunc(funcType, "myMethod")

      const schema = meta.schema
      expect(schema).toBeDefined()

      const validArgs = ["hello", "123"]
      expect(schema.parse(validArgs)).toEqual(validArgs)

      expect(() => schema.parse(["hello"])).toThrow()
    })
  })
})
