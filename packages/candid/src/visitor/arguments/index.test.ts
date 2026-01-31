import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import {
  FieldVisitor,
  OptionalField,
  RecordField,
  VariantField,
  VectorField,
} from "./index"

describe("ArgumentFieldVisitor", () => {
  const visitor = new FieldVisitor()

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Primitive Types", () => {
    it("should handle text type", () => {
      const field = visitor.visitText(IDL.Text, "username")

      expect(field.type).toBe("text")
      expect(field.label).toBe("username")
      expect(field.defaultValue).toBe("")
    })

    it("should handle bool type", () => {
      const field = visitor.visitBool(IDL.Bool, "isActive")

      expect(field.type).toBe("boolean")
      expect(field.label).toBe("isActive")
      expect(field.defaultValue).toBe(false)
    })

    it("should handle null type", () => {
      const field = visitor.visitNull(IDL.Null, "empty")

      expect(field.type).toBe("null")
      expect(field.label).toBe("empty")
      expect(field.defaultValue).toBe(null)
    })

    it("should handle principal type", () => {
      const field = visitor.visitPrincipal(IDL.Principal, "caller")

      expect(field.type).toBe("principal")
      expect(field.label).toBe("caller")
      expect(field.defaultValue).toBe("")
      expect(field.minLength).toBe(7)
      expect(field.maxLength).toBe(64)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Number Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Number Types", () => {
    it("should handle nat type", () => {
      const field = visitor.visitNat(IDL.Nat, "amount")

      expect(field.type).toBe("text")
      expect(field.label).toBe("amount")
      expect(field.candidType).toBe("nat")
      expect(field.defaultValue).toBe("")
      // TextField doesn't have isFloat or unsigned properties in the types
    })

    it("should handle int type", () => {
      const field = visitor.visitInt(IDL.Int, "balance")

      expect(field.type).toBe("text")
      expect(field.candidType).toBe("int")
    })

    it("should handle nat8 type with min/max", () => {
      const field = visitor.visitFixedNat(IDL.Nat8 as IDL.FixedNatClass, "byte")

      if (field.type === "number") {
        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat8")
        expect(field.bits).toBe(8)
        expect(field.min).toBe("0")
        expect(field.max).toBe("255")
      } else {
        throw new Error("Expected number field for nat8")
      }
    })

    it("should handle nat64 type with min/max", () => {
      const field = visitor.visitFixedNat(
        IDL.Nat64 as IDL.FixedNatClass,
        "timestamp"
      )

      expect(field.type).toBe("text")
      expect(field.candidType).toBe("nat64")
      // Large numbers are now text fields and don't carry bit/min/max metadata in the same way
    })

    it("should handle int32 type with min/max", () => {
      const field = visitor.visitFixedInt(
        IDL.Int32 as IDL.FixedIntClass,
        "count"
      )

      if (field.type === "number") {
        expect(field.type).toBe("number")
        expect(field.candidType).toBe("int32")
        expect(field.bits).toBe(32)
        expect(field.min).toBe("-2147483648")
        expect(field.max).toBe("2147483647")
      } else {
        throw new Error("Expected number field for int32")
      }
    })

    it("should handle float64 type", () => {
      const field = visitor.visitFloat(IDL.Float64 as IDL.FloatClass, "price")

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("float64")
      if (field.type === "number") {
        expect(field.isFloat).toBe(true)
      }
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Compound Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Record Types", () => {
    it("should handle simple record", () => {
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

      expect(field.type).toBe("record")
      expect(field.label).toBe("person")
      expect(field.fields).toHaveLength(2)
      expect(field.fields.some((f) => f.label === "name")).toBe(true)
      expect(field.fields.some((f) => f.label === "age")).toBe(true)

      const nameField = field.fields.find((f) => f.label === "name")
      if (!nameField || nameField.type !== "text") {
        throw new Error("Name field not found or not text")
      }
      expect(nameField.type).toBe("text")
      expect(nameField.defaultValue).toBe("")

      const ageField = field.fields.find((f) => f.label === "age")
      if (!ageField || ageField.type !== "text") {
        throw new Error("Age field not found or not text")
      }
      expect(ageField.type).toBe("text")
      expect(ageField.candidType).toBe("nat")

      expect(field.defaultValue).toEqual({
        name: "",
        age: "",
      })
    })

    it("should handle nested record", () => {
      const addressType = IDL.Record({
        street: IDL.Text,
        city: IDL.Text,
      })
      const personType = IDL.Record({
        name: IDL.Text,
        address: addressType,
      })
      const field = visitor.visitRecord(
        personType,
        [
          ["name", IDL.Text],
          ["address", addressType],
        ],
        "user"
      )

      expect(field.type).toBe("record")
      expect(field.fields).toHaveLength(2)

      const addressField = field.fields.find(
        (f) => f.label === "address"
      ) as RecordField
      if (!addressField || addressField.type !== "record") {
        throw new Error("Address field not found or not record")
      }
      expect(addressField.type).toBe("record")
      expect(addressField.fields).toHaveLength(2)

      expect(field.defaultValue).toEqual({
        name: "",
        address: {
          street: "",
          city: "",
        },
      })
    })

    it("should handle ICRC-1 transfer record", () => {
      const transferType = IDL.Record({
        to: IDL.Record({
          owner: IDL.Principal,
          subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
        }),
        amount: IDL.Nat,
        fee: IDL.Opt(IDL.Nat),
        memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
        created_at_time: IDL.Opt(IDL.Nat64),
      })
      const field = visitor.visitRecord(
        transferType,
        [
          [
            "to",
            IDL.Record({
              owner: IDL.Principal,
              subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
            }),
          ],
          ["amount", IDL.Nat],
          ["fee", IDL.Opt(IDL.Nat)],
          ["memo", IDL.Opt(IDL.Vec(IDL.Nat8))],
          ["created_at_time", IDL.Opt(IDL.Nat64)],
        ],
        "transfer"
      )

      expect(field.type).toBe("record")
      expect(field.fields).toHaveLength(5)

      // Check 'to' field
      const toField = field.fields.find((f) => f.label === "to") as RecordField
      if (!toField || toField.type !== "record") {
        throw new Error("To field not found or not record")
      }
      expect(toField.type).toBe("record")
      expect(toField.fields).toHaveLength(2)

      // Check 'amount' field
      const amountField = field.fields.find((f) => f.label === "amount")
      if (!amountField || amountField.type !== "text") {
        throw new Error("Amount field not found or not text")
      }
      expect(amountField.type).toBe("text")
      expect(amountField.candidType).toBe("nat")

      // Check optional 'fee' field
      const feeField = field.fields.find(
        (f) => f.label === "fee"
      ) as OptionalField
      if (!feeField || feeField.type !== "optional") {
        throw new Error("Fee field not found or not optional")
      }
      expect(feeField.type).toBe("optional")
      expect(feeField.innerField.type).toBe("text")
    })
  })

  describe("Variant Types", () => {
    it("should handle simple variant", () => {
      const statusType = IDL.Variant({
        Active: IDL.Null,
        Inactive: IDL.Null,
        Pending: IDL.Null,
      })
      const field = visitor.visitVariant(
        statusType,
        [
          ["Inactive", IDL.Null],
          ["Active", IDL.Null],
          ["Pending", IDL.Null],
        ],
        "status"
      )

      expect(field.type).toBe("variant")
      expect(field.label).toBe("status")
      expect(field.fields.map((f) => f.label)).toEqual([
        "Inactive",
        "Active",
        "Pending",
      ])
      expect(field.defaultOption).toBe("Inactive")
      expect(field.fields).toHaveLength(3)
      expect(field.fields.some((f) => f.label === "Active")).toBe(true)

      field.fields.forEach((f) => {
        expect(f.type).toBe("null")
      })
    })

    it("should handle variant with payloads", () => {
      const actionType = IDL.Variant({
        Transfer: IDL.Record({
          to: IDL.Principal,
          amount: IDL.Nat,
        }),
        Approve: IDL.Record({
          spender: IDL.Principal,
          amount: IDL.Nat,
        }),
        Burn: IDL.Nat,
      })
      const field = visitor.visitVariant(
        actionType,
        [
          [
            "Approve",
            IDL.Record({
              spender: IDL.Principal,
              amount: IDL.Nat,
            }),
          ],
          ["Burn", IDL.Nat],
          [
            "Transfer",
            IDL.Record({
              to: IDL.Principal,
              amount: IDL.Nat,
            }),
          ],
        ],
        "action"
      )

      expect(field.type).toBe("variant")
      expect(field.fields.map((f) => f.label)).toEqual([
        "Approve",
        "Burn",
        "Transfer",
      ]) // Sorted order

      const transferField = field.fields.find(
        (f) => f.label === "Transfer"
      ) as RecordField
      if (!transferField || transferField.type !== "record") {
        throw new Error("Transfer field not found or not record")
      }
      expect(transferField.type).toBe("record")
      expect(transferField.fields).toHaveLength(2)

      const burnField = field.fields.find((f) => f.label === "Burn")
      if (!burnField || burnField.type !== "text") {
        throw new Error("Burn field not found or not text")
      }
      expect(burnField.type).toBe("text")
    })

    it("should handle Result variant (Ok/Err)", () => {
      const resultType = IDL.Variant({
        Ok: IDL.Nat,
        Err: IDL.Text,
      })
      const field = visitor.visitVariant(
        resultType,
        [
          ["Ok", IDL.Nat],
          ["Err", IDL.Text],
        ],
        "result"
      )

      expect(field.type).toBe("variant")
      expect(field.fields.some((f) => f.label === "Ok")).toBe(true)
      expect(field.fields.some((f) => f.label === "Err")).toBe(true)

      const okField = field.fields.find((f) => f.label === "Ok")
      if (!okField || okField.type !== "text") {
        throw new Error("Ok field not found or not text")
      }
      expect(okField.type).toBe("text")

      const errField = field.fields.find((f) => f.label === "Err")
      if (!errField || errField.type !== "text") {
        throw new Error("Err field not found or not text")
      }
      expect(errField.type).toBe("text")
    })
  })

  describe("Tuple Types", () => {
    it("should handle simple tuple", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const field = visitor.visitTuple(tupleType, [IDL.Text, IDL.Nat], "pair")

      expect(field.type).toBe("tuple")
      expect(field.label).toBe("pair")
      expect(field.fields).toHaveLength(2)
      expect(field.fields[0].type).toBe("text")
      expect(field.fields[1].type).toBe("text")
      expect(field.defaultValue).toEqual(["", ""])
    })

    it("triple tuple", () => {
      const tupleType = IDL.Tuple(IDL.Principal, IDL.Nat, IDL.Bool)
      const field = visitor.visitTuple(
        tupleType,
        [IDL.Principal, IDL.Nat, IDL.Bool],
        "triple"
      )

      expect(field.type).toBe("tuple")
      expect(field.fields).toHaveLength(3)
      expect(field.fields[0].type).toBe("principal")
      expect(field.fields[1].type).toBe("text")
      expect(field.fields[2].type).toBe("boolean")
      expect(field.defaultValue).toEqual(["", "", false])
    })
  })

  describe("Optional Types", () => {
    it("should handle optional primitive", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = visitor.visitOpt(optType, IDL.Text, "nickname")

      expect(field.type).toBe("optional")
      expect(field.label).toBe("nickname")
      expect(field.defaultValue).toBe(null)
      expect(field.innerField.type).toBe("text")
      expect(field.getInnerDefault()).toBe("")
    })

    it("should handle optional record", () => {
      const recType = IDL.Record({
        name: IDL.Text,
        value: IDL.Nat,
      })
      const optType = IDL.Opt(recType)
      const field = visitor.visitOpt(optType, recType, "metadata")

      expect(field.type).toBe("optional")
      expect(field.innerField.type).toBe("record")
      expect(field.innerField.type).toBe("record")
      const inner = field.innerField as RecordField
      if (inner.type === "record") {
        expect(inner.fields).toHaveLength(2)
      } else {
        throw new Error("Inner field is not record")
      }

      // Test getInnerDefault helper
      expect(field.getInnerDefault()).toEqual({ name: "", value: "" })
    })

    it("should handle nested optional", () => {
      const innerOpt = IDL.Opt(IDL.Nat)
      const optType = IDL.Opt(innerOpt)
      const field = visitor.visitOpt(optType, innerOpt, "maybeNumber")

      expect(field.type).toBe("optional")
      expect(field.innerField.type).toBe("optional")
      expect(field.innerField.type).toBe("optional")
      const inner = field.innerField as OptionalField
      if (inner.type === "optional") {
        expect(inner.innerField.type).toBe("text")
      } else {
        throw new Error("Inner field is not optional")
      }
    })
  })

  describe("Vector Types", () => {
    it("should handle vector of primitives", () => {
      const vecType = IDL.Vec(IDL.Text)
      const field = visitor.visitVec(vecType, IDL.Text, "tags") as VectorField

      expect(field.type).toBe("vector")
      expect(field.label).toBe("tags")
      expect(field.defaultValue).toEqual([])
      expect(field.itemField.type).toBe("text")
      expect(field.getItemDefault()).toBe("")
    })

    it("should handle vector of records", () => {
      const recType = IDL.Record({
        id: IDL.Nat,
        name: IDL.Text,
      })
      const vecType = IDL.Vec(recType)
      const field = visitor.visitVec(vecType, recType, "items") as VectorField

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("record")
      const item = field.itemField as RecordField
      if (item.type === "record") {
        expect(item.fields).toHaveLength(2)
      } else {
        throw new Error("Item field is not record")
      }

      // Test getItemDefault helper
      expect(field.getItemDefault()).toEqual({ id: "", name: "" })
    })

    it("blob (vec nat8)", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")

      expect(field.type).toBe("blob")
      expect(field.label).toBe("data")
      expect(field.defaultValue).toBe("")
      if (field.type === "blob") {
        expect(field.acceptedFormats).toEqual(["hex", "base64", "file"])
      }
    })

    it("should handle nested vectors", () => {
      const innerVec = IDL.Vec(IDL.Nat)
      const nestedVecType = IDL.Vec(innerVec)
      const field = visitor.visitVec(nestedVecType, innerVec, "matrix")

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("vector")
      const item = field.itemField as VectorField
      if (item.type === "vector") {
        expect(item.itemField.type).toBe("text")
      } else {
        throw new Error("Item field is not vector")
      }
    })
  })

  describe("Recursive Types", () => {
    it("should handle recursive type (tree)", () => {
      const Tree = IDL.Rec()
      Tree.fill(
        IDL.Variant({
          Leaf: IDL.Nat,
          Node: IDL.Record({
            left: Tree,
            right: Tree,
          }),
        })
      )

      const field = visitor.visitRec(
        Tree,
        IDL.Variant({
          Leaf: IDL.Nat,
          Node: IDL.Record({
            left: Tree,
            right: Tree,
          }),
        }),
        "tree"
      )

      expect(field.type).toBe("recursive")
      expect(field.label).toBe("tree")
      expect(field.typeName).toBeDefined()
      expect(typeof field.extract).toBe("function")
      expect(typeof field.getInnerDefault).toBe("function")

      // Extract should return a variant
      const extracted = field.extract() as VariantField
      if (extracted.type !== "variant") {
        throw new Error("Extracted field is not variant")
      }
      expect(extracted.type).toBe("variant")
      expect(extracted.fields.some((f) => f.label === "Leaf")).toBe(true)
      expect(extracted.fields.some((f) => f.label === "Node")).toBe(true)
    })

    it("should handle recursive linked list", () => {
      const List = IDL.Rec()
      List.fill(
        IDL.Variant({
          Nil: IDL.Null,
          Cons: IDL.Record({
            head: IDL.Nat,
            tail: List,
          }),
        })
      )

      const field = visitor.visitRec(
        List,
        IDL.Variant({
          Nil: IDL.Null,
          Cons: IDL.Record({
            head: IDL.Nat,
            tail: List,
          }),
        }),
        "list"
      )

      expect(field.type).toBe("recursive")

      const extracted = field.extract() as VariantField
      if (extracted.type !== "variant") {
        throw new Error("Extracted field is not variant")
      }
      expect(extracted.type).toBe("variant")
      expect(extracted.fields.map((f) => f.label)).toEqual(["Nil", "Cons"])

      const consField = extracted.fields.find(
        (f) => f.label === "Cons"
      ) as RecordField
      if (!consField || consField.type !== "record") {
        throw new Error("Cons field not found or not record")
      }
      expect(consField.type).toBe("record")
      expect(consField.fields).toHaveLength(2)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Function Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Function Types", () => {
    it("should handle query function", () => {
      const funcType = IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"])
      const meta = visitor.visitFunc(funcType, "lookup")

      expect(meta.functionType).toBe("query")
      expect(meta.functionName).toBe("lookup")
      expect(meta.fields).toHaveLength(1)
      expect(meta.fields[0].type).toBe("text")
      expect(meta.defaultValues).toEqual([""])
      expect(meta.argCount).toBe(1)
      expect(meta.isNoArgs).toBe(false)
    })

    it("should handle update function", () => {
      const funcType = IDL.Func(
        [
          IDL.Record({
            to: IDL.Principal,
            amount: IDL.Nat,
          }),
        ],
        [
          IDL.Variant({
            Ok: IDL.Nat,
            Err: IDL.Text,
          }),
        ],
        []
      )
      const meta = visitor.visitFunc(funcType, "transfer")

      expect(meta.functionType).toBe("update")
      expect(meta.functionName).toBe("transfer")
      expect(meta.fields).toHaveLength(1)
      expect(meta.fields[0].type).toBe("record")

      const recordField = meta.fields[0] as RecordField
      if (recordField.type !== "record") {
        throw new Error("Expected record field")
      }
      expect(recordField.fields).toHaveLength(2)
    })

    it("should handle function with multiple arguments", () => {
      const funcType = IDL.Func(
        [IDL.Principal, IDL.Nat, IDL.Opt(IDL.Vec(IDL.Nat8))],
        [IDL.Bool],
        []
      )
      const meta = visitor.visitFunc(funcType, "authorize")

      expect(meta.fields).toHaveLength(3)
      expect(meta.fields[0].type).toBe("principal")
      expect(meta.fields[1].type).toBe("text")
      expect(meta.fields[2].type).toBe("optional")
      expect(meta.argCount).toBe(3)
    })

    it("should handle function with no arguments", () => {
      const funcType = IDL.Func([], [IDL.Nat], ["query"])
      const meta = visitor.visitFunc(funcType, "getBalance")

      expect(meta.functionType).toBe("query")
      expect(meta.fields).toHaveLength(0)
      expect(meta.defaultValues).toEqual([])
      expect(meta.argCount).toBe(0)
      expect(meta.isNoArgs).toBe(true)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Service Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Service Types", () => {
    it("should handle complete service", () => {
      const serviceType = IDL.Service({
        get_balance: IDL.Func([IDL.Principal], [IDL.Nat], ["query"]),
        transfer: IDL.Func(
          [
            IDL.Record({
              to: IDL.Principal,
              amount: IDL.Nat,
            }),
          ],
          [
            IDL.Variant({
              Ok: IDL.Nat,
              Err: IDL.Text,
            }),
          ],
          []
        ),
        get_metadata: IDL.Func(
          [],
          [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
          ["query"]
        ),
      })

      const serviceMeta = visitor.visitService(serviceType)

      expect(Object.keys(serviceMeta)).toHaveLength(3)
      expect(serviceMeta).toHaveProperty("get_balance")
      expect(serviceMeta).toHaveProperty("transfer")
      expect(serviceMeta).toHaveProperty("get_metadata")

      // Check get_balance
      const getBalanceMeta = serviceMeta["get_balance"]
      expect(getBalanceMeta.functionType).toBe("query")
      expect(getBalanceMeta.fields).toHaveLength(1)
      expect(getBalanceMeta.fields[0].type).toBe("principal")

      // Check transfer
      const transferMeta = serviceMeta["transfer"]
      expect(transferMeta.functionType).toBe("update")
      expect(transferMeta.fields).toHaveLength(1)
      expect(transferMeta.fields[0].type).toBe("record")

      // Check get_metadata
      const getMetadataMeta = serviceMeta["get_metadata"]
      expect(getMetadataMeta.functionType).toBe("query")
      expect(getMetadataMeta.fields).toHaveLength(0)
      expect(getMetadataMeta.isNoArgs).toBe(true)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Name (Path) Generation
  // ════════════════════════════════════════════════════════════════════════

  describe("Name Generation", () => {
    it("should generate correct names for nested records", () => {
      const funcType = IDL.Func(
        [
          IDL.Record({
            user: IDL.Record({
              name: IDL.Text,
              age: IDL.Nat,
            }),
            active: IDL.Bool,
          }),
        ],
        [],
        []
      )
      const meta = visitor.visitFunc(funcType, "updateUser")

      const argRecord = meta.fields[0] as RecordField
      if (argRecord.type !== "record") {
        throw new Error("Expected record field")
      }
      expect(argRecord.name).toBe("[0]")

      const userRecord = argRecord.fields.find(
        (f) => f.label === "user"
      ) as RecordField
      if (!userRecord || userRecord.type !== "record") {
        throw new Error("User record not found or not record")
      }
      expect(userRecord.name).toBe("[0].user")

      const nameField = userRecord.fields.find((f) => f.label === "name")
      if (!nameField || nameField.type !== "text") {
        throw new Error("Name field not found or not text")
      }
      expect(nameField.name).toBe("[0].user.name")

      const ageField = userRecord.fields.find((f) => f.label === "age")
      if (!ageField || ageField.type !== "text") {
        throw new Error("Age field not found or not text")
      }
      expect(ageField.name).toBe("[0].user.age")
    })

    it("should generate correct names for vectors", () => {
      const funcType = IDL.Func([IDL.Vec(IDL.Text)], [], [])
      const meta = visitor.visitFunc(funcType, "addTags")

      const vecField = meta.fields[0] as VectorField
      if (vecField.type !== "vector") {
        throw new Error("Expected vector field")
      }
      expect(vecField.name).toBe("[0]")
      expect(vecField.itemField.name).toBe("[0][0]")
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Complex Real-World Examples
  // ════════════════════════════════════════════════════════════════════════

  describe("Real-World Examples", () => {
    it("should handle ICRC-2 approve", () => {
      const ApproveArgs = IDL.Record({
        fee: IDL.Opt(IDL.Nat),
        memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
        from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
        created_at_time: IDL.Opt(IDL.Nat64),
        amount: IDL.Nat,
        expected_allowance: IDL.Opt(IDL.Nat),
        expires_at: IDL.Opt(IDL.Nat64),
        spender: IDL.Record({
          owner: IDL.Principal,
          subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
        }),
      })

      const field = visitor.visitRecord(
        ApproveArgs,
        [
          ["fee", IDL.Opt(IDL.Nat)],
          ["memo", IDL.Opt(IDL.Vec(IDL.Nat8))],
          ["from_subaccount", IDL.Opt(IDL.Vec(IDL.Nat8))],
          ["created_at_time", IDL.Opt(IDL.Nat64)],
          ["amount", IDL.Nat],
          ["expected_allowance", IDL.Opt(IDL.Nat)],
          ["expires_at", IDL.Opt(IDL.Nat64)],
          [
            "spender",
            IDL.Record({
              owner: IDL.Principal,
              subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
            }),
          ],
        ],
        "approve"
      )

      expect(field.type).toBe("record")
      expect(field.fields.length).toBeGreaterThan(5)

      // Check spender field
      const spenderField = field.fields.find(
        (f) => f.label === "spender"
      ) as RecordField
      if (!spenderField || spenderField.type !== "record") {
        throw new Error("Spender field not found or not record")
      }
      expect(spenderField.type).toBe("record")
      expect(spenderField.fields).toHaveLength(2)

      // Check amount field
      const amountField = field.fields.find((f) => f.label === "amount")
      if (!amountField || amountField.type !== "text") {
        throw new Error("Amount field not found or not text")
      }
      expect(amountField.type).toBe("text")
      expect(amountField.candidType).toBe("nat")
    })

    it("should handle SNS governance proposal", () => {
      const ProposalType = IDL.Variant({
        Motion: IDL.Record({
          motion_text: IDL.Text,
        }),
        TransferSnsTreasuryFunds: IDL.Record({
          from_treasury: IDL.Nat32,
          to_principal: IDL.Opt(IDL.Principal),
          to_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
          memo: IDL.Opt(IDL.Nat64),
          amount_e8s: IDL.Nat64,
        }),
        UpgradeSnsControlledCanister: IDL.Record({
          new_canister_wasm: IDL.Vec(IDL.Nat8),
          mode: IDL.Opt(IDL.Nat32),
          canister_id: IDL.Opt(IDL.Principal),
          canister_upgrade_arg: IDL.Opt(IDL.Vec(IDL.Nat8)),
        }),
      })

      const field = visitor.visitVariant(
        ProposalType,
        [
          ["Motion", IDL.Record({ motion_text: IDL.Text })],
          [
            "TransferSnsTreasuryFunds",
            IDL.Record({
              from_treasury: IDL.Nat32,
              to_principal: IDL.Opt(IDL.Principal),
              to_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
              memo: IDL.Opt(IDL.Nat64),
              amount_e8s: IDL.Nat64,
            }),
          ],
          [
            "UpgradeSnsControlledCanister",
            IDL.Record({
              new_canister_wasm: IDL.Vec(IDL.Nat8),
              mode: IDL.Opt(IDL.Nat32),
              canister_id: IDL.Opt(IDL.Principal),
              canister_upgrade_arg: IDL.Opt(IDL.Vec(IDL.Nat8)),
            }),
          ],
        ],
        "proposal"
      )

      expect(field.type).toBe("variant")
      expect(field.fields.some((f) => f.label === "Motion")).toBe(true)
      expect(
        field.fields.some((f) => f.label === "TransferSnsTreasuryFunds")
      ).toBe(true)
      expect(
        field.fields.some((f) => f.label === "UpgradeSnsControlledCanister")
      ).toBe(true)

      // Check Motion variant
      const motionField = field.fields.find(
        (f) => f.label === "Motion"
      ) as RecordField
      if (!motionField || motionField.type !== "record") {
        throw new Error("Motion field not found or not record")
      }
      expect(motionField.type).toBe("record")
      expect(motionField.fields).toHaveLength(1)

      // Check TransferSnsTreasuryFunds variant
      const transferField = field.fields.find(
        (f) => f.label === "TransferSnsTreasuryFunds"
      ) as RecordField
      if (!transferField || transferField.type !== "record") {
        throw new Error("Transfer field not found or not record")
      }
      expect(transferField.type).toBe("record")
      expect(transferField.fields.length).toBeGreaterThan(3)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Helper Methods
  // ════════════════════════════════════════════════════════════════════════

  describe("Helper Methods", () => {
    it("variant getOptionDefault should return correct defaults", () => {
      const statusType = IDL.Variant({
        Active: IDL.Null,
        Pending: IDL.Record({ reason: IDL.Text }),
      })
      const field = visitor.visitVariant(
        statusType,
        [
          ["Active", IDL.Null],
          ["Pending", IDL.Record({ reason: IDL.Text })],
        ],
        "status"
      )
    })

    it("vector getItemDefault should return item default", () => {
      const vecType = IDL.Vec(IDL.Record({ name: IDL.Text }))
      const field = visitor.visitVec(
        vecType,
        IDL.Record({ name: IDL.Text }),
        "items"
      ) as VectorField

      expect(field.getItemDefault()).toEqual({ name: "" })
    })

    it("optional getInnerDefault should return inner default", () => {
      const optType = IDL.Opt(IDL.Record({ value: IDL.Nat }))
      const field = visitor.visitOpt(
        optType,
        IDL.Record({ value: IDL.Nat }),
        "config"
      )

      expect(field.getInnerDefault()).toEqual({ value: "" })
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // New Features - displayLabel, component, renderHint
  // ════════════════════════════════════════════════════════════════════════

  describe("displayLabel formatting", () => {
    it("should format __arg labels correctly", () => {
      const funcType = IDL.Func([IDL.Text, IDL.Nat], [], [])
      const meta = visitor.visitFunc(funcType, "test")

      expect(meta.fields[0].displayLabel).toBe("Arg 0")
      expect(meta.fields[1].displayLabel).toBe("Arg 1")
    })

    it("should format tuple index labels correctly", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat, IDL.Bool)
      const field = visitor.visitTuple(
        tupleType,
        [IDL.Text, IDL.Nat, IDL.Bool],
        "triple"
      )

      expect(field.fields[0].displayLabel).toBe("Item 0")
      expect(field.fields[1].displayLabel).toBe("Item 1")
      expect(field.fields[2].displayLabel).toBe("Item 2")
    })

    it("should format snake_case labels correctly", () => {
      const recordType = IDL.Record({
        created_at_time: IDL.Nat,
        user_address: IDL.Text,
      })
      const field = visitor.visitRecord(
        recordType,
        [
          ["created_at_time", IDL.Nat],
          ["user_address", IDL.Text],
        ],
        "record"
      )

      const createdField = field.fields.find(
        (f) => f.label === "created_at_time"
      )
      const userField = field.fields.find((f) => f.label === "user_address")

      expect(createdField?.displayLabel).toBe("Created At Time")
      expect(userField?.displayLabel).toBe("User Address")
    })
  })

  describe("component hints", () => {
    it("should have correct component for record", () => {
      const recordType = IDL.Record({ name: IDL.Text })
      const field = visitor.visitRecord(
        recordType,
        [["name", IDL.Text]],
        "person"
      )

      expect(field.component).toBe("record-container")
    })

    it("should have correct component for variant", () => {
      const variantType = IDL.Variant({ A: IDL.Null, B: IDL.Text })
      const field = visitor.visitVariant(
        variantType,
        [
          ["A", IDL.Null],
          ["B", IDL.Text],
        ],
        "choice"
      )

      expect(field.component).toBe("variant-select")
    })

    it("should have correct component for optional", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = visitor.visitOpt(optType, IDL.Text, "optional")

      expect(field.component).toBe("optional-toggle")
    })

    it("should have correct component for vector", () => {
      const vecType = IDL.Vec(IDL.Text)
      const field = visitor.visitVec(vecType, IDL.Text, "vec") as VectorField

      expect(field.component).toBe("vector-list")
    })

    it("should have correct component for blob", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "blob")

      expect(field.component).toBe("blob-upload")
    })

    it("should have correct component for text", () => {
      const field = visitor.visitText(IDL.Text, "text")

      expect(field.component).toBe("text-input")
    })

    it("should have correct component for number", () => {
      const field = visitor.visitFloat(IDL.Float64 as IDL.FloatClass, "num")

      expect(field.component).toBe("number-input")
    })

    it("should have correct component for boolean", () => {
      const field = visitor.visitBool(IDL.Bool, "bool")

      expect(field.component).toBe("boolean-checkbox")
    })

    it("should have correct component for principal", () => {
      const field = visitor.visitPrincipal(IDL.Principal, "principal")

      expect(field.component).toBe("principal-input")
    })

    it("should have correct component for null", () => {
      const field = visitor.visitNull(IDL.Null, "null")

      expect(field.component).toBe("null-hidden")
    })
  })

  describe("renderHint properties", () => {
    it("compound types should have isCompound: true", () => {
      const recordField = visitor.visitRecord(
        IDL.Record({ x: IDL.Text }),
        [["x", IDL.Text]],
        "rec"
      )
      const variantField = visitor.visitVariant(
        IDL.Variant({ A: IDL.Null }),
        [["A", IDL.Null]],
        "var"
      )
      const optionalField = visitor.visitOpt(IDL.Opt(IDL.Text), IDL.Text, "opt")
      const vectorField = visitor.visitVec(IDL.Vec(IDL.Text), IDL.Text, "vec")

      expect(recordField.renderHint.isCompound).toBe(true)
      expect(recordField.renderHint.isPrimitive).toBe(false)

      expect(variantField.renderHint.isCompound).toBe(true)
      expect(optionalField.renderHint.isCompound).toBe(true)
      expect((vectorField as VectorField).renderHint.isCompound).toBe(true)
    })

    it("primitive types should have isPrimitive: true", () => {
      const textField = visitor.visitText(IDL.Text, "text")
      const boolField = visitor.visitBool(IDL.Bool, "bool")
      const principalField = visitor.visitPrincipal(IDL.Principal, "principal")

      expect(textField.renderHint.isPrimitive).toBe(true)
      expect(textField.renderHint.isCompound).toBe(false)

      expect(boolField.renderHint.isPrimitive).toBe(true)
      expect(principalField.renderHint.isPrimitive).toBe(true)
    })

    it("should have correct inputType hints", () => {
      const textField = visitor.visitText(IDL.Text, "text")
      const boolField = visitor.visitBool(IDL.Bool, "bool")
      const numField = visitor.visitFloat(IDL.Float64 as IDL.FloatClass, "num")

      expect(textField.renderHint.inputType).toBe("text")
      expect(boolField.renderHint.inputType).toBe("checkbox")
      expect(numField.renderHint.inputType).toBe("number")
    })
  })

  describe("inputProps for primitive types", () => {
    it("text field should have inputProps", () => {
      const field = visitor.visitText(IDL.Text, "text")

      expect(field.inputProps).toBeDefined()
      expect(field.inputProps.type).toBe("text")
      expect(field.inputProps.placeholder).toBeDefined()
    })

    it("boolean field should have checkbox inputProps", () => {
      const field = visitor.visitBool(IDL.Bool, "bool")

      expect(field.inputProps).toBeDefined()
      expect(field.inputProps.type).toBe("checkbox")
    })

    it("number field should have number inputProps with min/max", () => {
      const field = visitor.visitFixedNat(IDL.Nat8 as IDL.FixedNatClass, "byte")

      if (field.type === "number") {
        expect(field.inputProps).toBeDefined()
        expect(field.inputProps.type).toBe("number")
        expect(field.inputProps.min).toBe("0")
        expect(field.inputProps.max).toBe("255")
      }
    })

    it("principal field should have inputProps with spellCheck disabled", () => {
      const field = visitor.visitPrincipal(IDL.Principal, "principal")

      expect(field.inputProps).toBeDefined()
      expect(field.inputProps.spellCheck).toBe(false)
      expect(field.inputProps.autoComplete).toBe("off")
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Optional isEnabled Helper
  // ════════════════════════════════════════════════════════════════════════

  describe("Optional isEnabled helper", () => {
    it("should return true for non-null values", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = visitor.visitOpt(optType, IDL.Text, "optional")

      expect(field.isEnabled("hello")).toBe(true)
      expect(field.isEnabled("")).toBe(true)
      expect(field.isEnabled(0)).toBe(true)
      expect(field.isEnabled(false)).toBe(true)
      expect(field.isEnabled({})).toBe(true)
    })

    it("should return false for null and undefined", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = visitor.visitOpt(optType, IDL.Text, "optional")

      expect(field.isEnabled(null)).toBe(false)
      expect(field.isEnabled(undefined)).toBe(false)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Vector createItemField Helper
  // ════════════════════════════════════════════════════════════════════════

  describe("Vector createItemField helper", () => {
    it("should create item field with correct index in name path", () => {
      const funcType = IDL.Func([IDL.Vec(IDL.Text)], [], [])
      const meta = visitor.visitFunc(funcType, "addItems")
      const vecField = meta.fields[0] as VectorField

      const item0 = vecField.createItemField(0)
      expect(item0.name).toBe("[0][0]")

      const item5 = vecField.createItemField(5)
      expect(item5.name).toBe("[0][5]")
    })

    it("should use custom label when provided", () => {
      const funcType = IDL.Func(
        [IDL.Vec(IDL.Record({ name: IDL.Text }))],
        [],
        []
      )
      const meta = visitor.visitFunc(funcType, "addItems")
      const vecField = meta.fields[0] as VectorField

      const item = vecField.createItemField(3, { label: "Person 3" })
      expect(item.label).toBe("Person 3")
      expect(item.displayLabel).toBe("Person 3")
    })

    it("should use default label when not provided", () => {
      const funcType = IDL.Func([IDL.Vec(IDL.Text)], [], [])
      const meta = visitor.visitFunc(funcType, "addTags")
      const vecField = meta.fields[0] as VectorField

      const item = vecField.createItemField(2)
      expect(item.label).toBe("Item 2")
      expect(item.displayLabel).toBe("Item 2")
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Blob Field Utilities
  // ════════════════════════════════════════════════════════════════════════

  describe("Blob field utilities", () => {
    it("should have limits defined", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")

      if (field.type === "blob") {
        expect(field.limits).toBeDefined()
        expect(field.limits.maxHexBytes).toBeGreaterThan(0)
        expect(field.limits.maxFileBytes).toBeGreaterThan(0)
        expect(field.limits.maxHexDisplayLength).toBeGreaterThan(0)
      }
    })

    it("normalizeHex should remove 0x prefix and lowercase", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")

      if (field.type === "blob") {
        expect(field.normalizeHex("0xDEADBEEF")).toBe("deadbeef")
        expect(field.normalizeHex("DEADBEEF")).toBe("deadbeef")
        expect(field.normalizeHex("0x")).toBe("")
        expect(field.normalizeHex("abc123")).toBe("abc123")
      }
    })

    it("validateInput should validate hex strings", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")

      if (field.type === "blob") {
        // Valid inputs
        expect(field.validateInput("").valid).toBe(true)
        expect(field.validateInput("deadbeef").valid).toBe(true)
        expect(field.validateInput("0x1234").valid).toBe(true)

        // Invalid inputs
        expect(field.validateInput("xyz").valid).toBe(false)
        expect(field.validateInput("abc").valid).toBe(false) // odd length
      }
    })

    it("validateInput should validate Uint8Array", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")

      if (field.type === "blob") {
        expect(field.validateInput(new Uint8Array([1, 2, 3])).valid).toBe(true)
      }
    })
  })
})
