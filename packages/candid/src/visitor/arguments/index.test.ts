import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { ArgumentFieldVisitor, VectorField } from "./index"

describe("ArgumentFieldVisitor", () => {
  const visitor = new ArgumentFieldVisitor()

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

      expect(field.type).toBe("number")
      expect(field.label).toBe("amount")
      expect(field.candidType).toBe("nat")
      expect(field.defaultValue).toBe("")
      expect(field.unsigned).toBe(true)
      expect(field.isFloat).toBe(false)
    })

    it("should handle int type", () => {
      const field = visitor.visitInt(IDL.Int, "balance")

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("int")
      expect(field.unsigned).toBe(false)
      expect(field.isFloat).toBe(false)
    })

    it("should handle nat8 type with min/max", () => {
      const field = visitor.visitFixedNat(IDL.Nat8 as IDL.FixedNatClass, "byte")

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("nat8")
      expect(field.bits).toBe(8)
      expect(field.min).toBe("0")
      expect(field.max).toBe("255")
    })

    it("should handle nat64 type with min/max", () => {
      const field = visitor.visitFixedNat(
        IDL.Nat64 as IDL.FixedNatClass,
        "timestamp"
      )

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("nat64")
      expect(field.bits).toBe(64)
      expect(field.min).toBe("0")
      expect(field.max).toBe("18446744073709551615")
    })

    it("should handle int32 type with min/max", () => {
      const field = visitor.visitFixedInt(
        IDL.Int32 as IDL.FixedIntClass,
        "count"
      )

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("int32")
      expect(field.bits).toBe(32)
      expect(field.min).toBe("-2147483648")
      expect(field.max).toBe("2147483647")
    })

    it("should handle float64 type", () => {
      const field = visitor.visitFloat(IDL.Float64 as IDL.FloatClass, "price")

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("float64")
      expect(field.isFloat).toBe(true)
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
      expect(field.fieldMap.has("name")).toBe(true)
      expect(field.fieldMap.has("age")).toBe(true)

      const nameField = field.fields.find((f) => f.label === "name")
      if (!nameField || nameField.type !== "text") {
        throw new Error("Name field not found or not text")
      }
      expect(nameField.type).toBe("text")
      expect(nameField.defaultValue).toBe("")

      const ageField = field.fields.find((f) => f.label === "age")
      if (!ageField || ageField.type !== "number") {
        throw new Error("Age field not found or not number")
      }
      expect(ageField.type).toBe("number")
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

      const addressField = field.fields.find((f) => f.label === "address")
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
      const toField = field.fields.find((f) => f.label === "to")
      if (!toField || toField.type !== "record") {
        throw new Error("To field not found or not record")
      }
      expect(toField.type).toBe("record")
      expect(toField.fields).toHaveLength(2)

      // Check 'amount' field
      const amountField = field.fields.find((f) => f.label === "amount")
      if (!amountField || amountField.type !== "number") {
        throw new Error("Amount field not found or not number")
      }
      expect(amountField.type).toBe("number")
      expect(amountField.candidType).toBe("nat")

      // Check optional 'fee' field
      const feeField = field.fields.find((f) => f.label === "fee")
      if (!feeField || feeField.type !== "optional") {
        throw new Error("Fee field not found or not optional")
      }
      expect(feeField.type).toBe("optional")
      expect(feeField.innerField.type).toBe("number")
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
      expect(field.options).toEqual(["Inactive", "Active", "Pending"])
      expect(field.defaultOption).toBe("Inactive")
      expect(field.fields).toHaveLength(3)
      expect(field.optionMap.has("Active")).toBe(true)

      field.fields.forEach((f) => {
        expect(f.type).toBe("null")
      })

      // Test getOptionDefault helper
      expect(field.getOptionDefault("Active")).toEqual({ Active: null })
      expect(field.getOptionDefault("Pending")).toEqual({ Pending: null })
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
      expect(field.options).toEqual(["Approve", "Burn", "Transfer"]) // Sorted order

      const transferField = field.fields.find((f) => f.label === "Transfer")
      if (!transferField || transferField.type !== "record") {
        throw new Error("Transfer field not found or not record")
      }
      expect(transferField.type).toBe("record")
      expect(transferField.fields).toHaveLength(2)

      const burnField = field.fields.find((f) => f.label === "Burn")
      if (!burnField || burnField.type !== "number") {
        throw new Error("Burn field not found or not number")
      }
      expect(burnField.type).toBe("number")
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
      expect(field.options).toContain("Ok")
      expect(field.options).toContain("Err")

      const okField = field.fields.find((f) => f.label === "Ok")
      if (!okField || okField.type !== "number") {
        throw new Error("Ok field not found or not number")
      }
      expect(okField.type).toBe("number")

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
      expect(field.fields[1].type).toBe("number")
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
      expect(field.fields[1].type).toBe("number")
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
      const inner = field.innerField
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
      const inner = field.innerField
      if (inner.type === "optional") {
        expect(inner.innerField.type).toBe("number")
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
      const item = field.itemField
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
      const item = field.itemField
      if (item.type === "vector") {
        expect(item.itemField.type).toBe("number")
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
      const extracted = field.extract()
      if (extracted.type !== "variant") {
        throw new Error("Extracted field is not variant")
      }
      expect(extracted.type).toBe("variant")
      expect(extracted.options).toContain("Leaf")
      expect(extracted.options).toContain("Node")
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

      const extracted = field.extract()
      if (extracted.type !== "variant") {
        throw new Error("Extracted field is not variant")
      }
      expect(extracted.type).toBe("variant")
      expect(extracted.options).toEqual(["Nil", "Cons"])

      const consField = extracted.fields.find((f) => f.label === "Cons")
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
      expect(meta.defaultValue).toEqual([""])
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

      const recordField = meta.fields[0]
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
      expect(meta.fields[1].type).toBe("number")
      expect(meta.fields[2].type).toBe("optional")
      expect(meta.argCount).toBe(3)
    })

    it("should handle function with no arguments", () => {
      const funcType = IDL.Func([], [IDL.Nat], ["query"])
      const meta = visitor.visitFunc(funcType, "getBalance")

      expect(meta.functionType).toBe("query")
      expect(meta.fields).toHaveLength(0)
      expect(meta.defaultValue).toEqual([])
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

      const argRecord = meta.fields[0]
      if (argRecord.type !== "record") {
        throw new Error("Expected record field")
      }
      expect(argRecord.name).toBe("[0]")

      const userRecord = argRecord.fields.find((f) => f.label === "user")
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
      if (!ageField || ageField.type !== "number") {
        throw new Error("Age field not found or not number")
      }
      expect(ageField.name).toBe("[0].user.age")
    })

    it("should generate correct names for vectors", () => {
      const funcType = IDL.Func([IDL.Vec(IDL.Text)], [], [])
      const meta = visitor.visitFunc(funcType, "addTags")

      const vecField = meta.fields[0]
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
      const spenderField = field.fields.find((f) => f.label === "spender")
      if (!spenderField || spenderField.type !== "record") {
        throw new Error("Spender field not found or not record")
      }
      expect(spenderField.type).toBe("record")
      expect(spenderField.fields).toHaveLength(2)

      // Check amount field
      const amountField = field.fields.find((f) => f.label === "amount")
      if (!amountField || amountField.type !== "number") {
        throw new Error("Amount field not found or not number")
      }
      expect(amountField.type).toBe("number")
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
      expect(field.options).toContain("Motion")
      expect(field.options).toContain("TransferSnsTreasuryFunds")
      expect(field.options).toContain("UpgradeSnsControlledCanister")

      // Check Motion variant
      const motionField = field.fields.find((f) => f.label === "Motion")
      if (!motionField || motionField.type !== "record") {
        throw new Error("Motion field not found or not record")
      }
      expect(motionField.type).toBe("record")
      expect(motionField.fields).toHaveLength(1)

      // Check TransferSnsTreasuryFunds variant
      const transferField = field.fields.find(
        (f) => f.label === "TransferSnsTreasuryFunds"
      )
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

      expect(field.getOptionDefault("Active")).toEqual({ Active: null })
      expect(field.getOptionDefault("Pending")).toEqual({
        Pending: { reason: "" },
      })
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
})
