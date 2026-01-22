import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { ArgumentFieldVisitor } from "./index"
import type {
  ArgumentField,
  RecordArgumentField,
  VariantArgumentField,
  TupleArgumentField,
  OptionalArgumentField,
  VectorArgumentField,
  BlobArgumentField,
  RecursiveArgumentField,
  NumberArgumentField,
  TextArgumentField,
  PrincipalArgumentField,
  BooleanArgumentField,
  NullArgumentField,
  MethodArgumentsMeta,
  ServiceArgumentsMeta,
} from "./types"

describe("ArgumentFieldVisitor", () => {
  const visitor = new ArgumentFieldVisitor()

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Primitive Types", () => {
    it("should handle text type", () => {
      const textType = IDL.Text
      const field = textType.accept(visitor, "username") as TextArgumentField

      expect(field.type).toBe("text")
      expect(field.label).toBe("username")
      expect(field.defaultValue).toBe("")
    })

    it("should handle bool type", () => {
      const boolType = IDL.Bool
      const field = boolType.accept(visitor, "isActive") as BooleanArgumentField

      expect(field.type).toBe("boolean")
      expect(field.label).toBe("isActive")
      expect(field.defaultValue).toBe(false)
    })

    it("should handle null type", () => {
      const nullType = IDL.Null
      const field = nullType.accept(visitor, "empty") as NullArgumentField

      expect(field.type).toBe("null")
      expect(field.label).toBe("empty")
      expect(field.defaultValue).toBe(null)
    })

    it("should handle principal type", () => {
      const principalType = IDL.Principal
      const field = principalType.accept(
        visitor,
        "caller"
      ) as PrincipalArgumentField

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
      const natType = IDL.Nat
      const field = natType.accept(visitor, "amount") as NumberArgumentField

      expect(field.type).toBe("number")
      expect(field.label).toBe("amount")
      expect(field.candidType).toBe("nat")
      expect(field.defaultValue).toBe("")
    })

    it("should handle int type", () => {
      const intType = IDL.Int
      const field = intType.accept(visitor, "balance") as NumberArgumentField

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("int")
    })

    it("should handle nat8 type", () => {
      const nat8Type = IDL.Nat8
      const field = nat8Type.accept(visitor, "byte") as NumberArgumentField

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("nat8")
    })

    it("should handle nat64 type", () => {
      const nat64Type = IDL.Nat64
      const field = nat64Type.accept(
        visitor,
        "timestamp"
      ) as NumberArgumentField

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("nat64")
    })

    it("should handle int32 type", () => {
      const int32Type = IDL.Int32
      const field = int32Type.accept(visitor, "count") as NumberArgumentField

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("int32")
    })

    it("should handle float64 type", () => {
      const float64Type = IDL.Float64
      const field = float64Type.accept(visitor, "price") as NumberArgumentField

      expect(field.type).toBe("number")
      expect(field.candidType).toBe("float")
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
      const field = recordType.accept(visitor, "person") as RecordArgumentField

      expect(field.type).toBe("record")
      expect(field.label).toBe("person")
      expect(field.fields).toHaveLength(2)

      const nameField = field.fields.find(
        (f) => f.label === "name"
      ) as TextArgumentField
      expect(nameField.type).toBe("text")
      expect(nameField.defaultValue).toBe("")

      const ageField = field.fields.find(
        (f) => f.label === "age"
      ) as NumberArgumentField
      expect(ageField.type).toBe("number")
      expect(ageField.candidType).toBe("nat")

      expect(field.defaultValues).toEqual({
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
      const field = personType.accept(visitor, "user") as RecordArgumentField

      expect(field.type).toBe("record")
      expect(field.fields).toHaveLength(2)

      const addressField = field.fields.find(
        (f) => f.label === "address"
      ) as RecordArgumentField
      expect(addressField.type).toBe("record")
      expect(addressField.fields).toHaveLength(2)

      expect(field.defaultValues).toEqual({
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
      const field = transferType.accept(
        visitor,
        "transfer"
      ) as RecordArgumentField

      expect(field.type).toBe("record")
      expect(field.fields).toHaveLength(5)

      // Check 'to' field
      const toField = field.fields.find(
        (f) => f.label === "to"
      ) as RecordArgumentField
      expect(toField.type).toBe("record")
      expect(toField.fields).toHaveLength(2)

      // Check 'amount' field
      const amountField = field.fields.find(
        (f) => f.label === "amount"
      ) as NumberArgumentField
      expect(amountField.type).toBe("number")
      expect(amountField.candidType).toBe("nat")

      // Check optional 'fee' field
      const feeField = field.fields.find(
        (f) => f.label === "fee"
      ) as OptionalArgumentField
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
      const field = statusType.accept(visitor, "status") as VariantArgumentField

      expect(field.type).toBe("variant")
      expect(field.label).toBe("status")
      expect(field.options).toEqual(["Inactive", "Active", "Pending"])
      expect(field.defaultOption).toBe("Inactive")
      expect(field.fields).toHaveLength(3)

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
      const field = actionType.accept(visitor, "action") as VariantArgumentField

      expect(field.type).toBe("variant")
      expect(field.options).toEqual(["Approve", "Burn", "Transfer"])

      const transferField = field.fields.find(
        (f) => f.label === "Transfer"
      ) as RecordArgumentField
      expect(transferField.type).toBe("record")
      expect(transferField.fields).toHaveLength(2)

      const burnField = field.fields.find(
        (f) => f.label === "Burn"
      ) as NumberArgumentField
      expect(burnField.type).toBe("number")
    })

    it("should handle Result variant (Ok/Err)", () => {
      const resultType = IDL.Variant({
        Ok: IDL.Nat,
        Err: IDL.Text,
      })
      const field = resultType.accept(visitor, "result") as VariantArgumentField

      expect(field.type).toBe("variant")
      expect(field.options).toContain("Ok")
      expect(field.options).toContain("Err")

      const okField = field.fields.find(
        (f) => f.label === "Ok"
      ) as NumberArgumentField
      expect(okField.type).toBe("number")

      const errField = field.fields.find(
        (f) => f.label === "Err"
      ) as TextArgumentField
      expect(errField.type).toBe("text")
    })
  })

  describe("Tuple Types", () => {
    it("should handle simple tuple", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const field = tupleType.accept(visitor, "pair") as TupleArgumentField

      expect(field.type).toBe("tuple")
      expect(field.label).toBe("pair")
      expect(field.fields).toHaveLength(2)
      expect(field.fields[0].type).toBe("text")
      expect(field.fields[1].type).toBe("number")
      expect(field.defaultValues).toEqual(["", ""])
    })

    it("should handle triple tuple", () => {
      const tupleType = IDL.Tuple(IDL.Principal, IDL.Nat, IDL.Bool)
      const field = tupleType.accept(visitor, "triple") as TupleArgumentField

      expect(field.type).toBe("tuple")
      expect(field.fields).toHaveLength(3)
      expect(field.fields[0].type).toBe("principal")
      expect(field.fields[1].type).toBe("number")
      expect(field.fields[2].type).toBe("boolean")
      expect(field.defaultValues).toEqual(["", "", false])
    })
  })

  describe("Optional Types", () => {
    it("should handle optional primitive", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = optType.accept(visitor, "nickname") as OptionalArgumentField

      expect(field.type).toBe("optional")
      expect(field.label).toBe("nickname")
      expect(field.defaultValue).toBe(null)
      expect(field.innerField.type).toBe("text")
    })

    it("should handle optional record", () => {
      const optType = IDL.Opt(
        IDL.Record({
          name: IDL.Text,
          value: IDL.Nat,
        })
      )
      const field = optType.accept(visitor, "metadata") as OptionalArgumentField

      expect(field.type).toBe("optional")
      expect(field.innerField.type).toBe("record")
      expect((field.innerField as RecordArgumentField).fields).toHaveLength(2)
    })

    it("should handle nested optional", () => {
      const optType = IDL.Opt(IDL.Opt(IDL.Nat))
      const field = optType.accept(
        visitor,
        "maybeNumber"
      ) as OptionalArgumentField

      expect(field.type).toBe("optional")
      expect(field.innerField.type).toBe("optional")
      expect((field.innerField as OptionalArgumentField).innerField.type).toBe(
        "number"
      )
    })
  })

  describe("Vector Types", () => {
    it("should handle vector of primitives", () => {
      const vecType = IDL.Vec(IDL.Text)
      const field = vecType.accept(visitor, "tags") as VectorArgumentField

      expect(field.type).toBe("vector")
      expect(field.label).toBe("tags")
      expect(field.defaultValue).toEqual([])
      expect(field.itemField.type).toBe("text")
    })

    it("should handle vector of records", () => {
      const vecType = IDL.Vec(
        IDL.Record({
          id: IDL.Nat,
          name: IDL.Text,
        })
      )
      const field = vecType.accept(visitor, "items") as VectorArgumentField

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("record")
      expect((field.itemField as RecordArgumentField).fields).toHaveLength(2)
    })

    it("should handle blob (vec nat8)", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = blobType.accept(visitor, "data") as BlobArgumentField

      expect(field.type).toBe("blob")
      expect(field.label).toBe("data")
      expect(field.defaultValue).toBe("")
    })

    it("should handle nested vectors", () => {
      const nestedVecType = IDL.Vec(IDL.Vec(IDL.Nat))
      const field = nestedVecType.accept(
        visitor,
        "matrix"
      ) as VectorArgumentField

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("vector")
      expect((field.itemField as VectorArgumentField).itemField.type).toBe(
        "number"
      )
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

      const field = Tree.accept(visitor, "tree") as RecursiveArgumentField

      expect(field.type).toBe("recursive")
      expect(field.label).toBe("tree")
      expect(typeof field.extract).toBe("function")

      // Extract should return a variant
      const extracted = field.extract() as VariantArgumentField
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

      const field = List.accept(visitor, "list") as RecursiveArgumentField

      expect(field.type).toBe("recursive")

      const extracted = field.extract() as VariantArgumentField
      expect(extracted.type).toBe("variant")
      expect(extracted.options).toEqual(["Nil", "Cons"])

      const consField = extracted.fields.find(
        (f) => f.label === "Cons"
      ) as RecordArgumentField
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
      const meta = funcType.accept(
        visitor,
        "lookup"
      ) as MethodArgumentsMeta<unknown>

      expect(meta.functionType).toBe("query")
      expect(meta.functionName).toBe("lookup")
      expect(meta.fields).toHaveLength(1)
      expect(meta.fields[0].type).toBe("text")
      expect(meta.defaultValues).toEqual([""])
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
      const meta = funcType.accept(
        visitor,
        "transfer"
      ) as MethodArgumentsMeta<unknown>

      expect(meta.functionType).toBe("update")
      expect(meta.functionName).toBe("transfer")
      expect(meta.fields).toHaveLength(1)
      expect(meta.fields[0].type).toBe("record")

      const recordField = meta.fields[0] as RecordArgumentField
      expect(recordField.fields).toHaveLength(2)
    })

    it("should handle function with multiple arguments", () => {
      const funcType = IDL.Func(
        [IDL.Principal, IDL.Nat, IDL.Opt(IDL.Vec(IDL.Nat8))],
        [IDL.Bool],
        []
      )
      const meta = funcType.accept(
        visitor,
        "authorize"
      ) as MethodArgumentsMeta<unknown>

      expect(meta.fields).toHaveLength(3)
      expect(meta.fields[0].type).toBe("principal")
      expect(meta.fields[1].type).toBe("number")
      expect(meta.fields[2].type).toBe("optional")
    })

    it("should handle function with no arguments", () => {
      const funcType = IDL.Func([], [IDL.Nat], ["query"])
      const meta = funcType.accept(
        visitor,
        "getBalance"
      ) as MethodArgumentsMeta<unknown>

      expect(meta.functionType).toBe("query")
      expect(meta.fields).toHaveLength(0)
      expect(meta.defaultValues).toEqual([])
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

      const serviceMeta = serviceType.accept(
        visitor,
        null as any
      ) as ServiceArgumentsMeta<unknown>

      expect(Object.keys(serviceMeta)).toHaveLength(3)
      expect(serviceMeta).toHaveProperty("get_balance")
      expect(serviceMeta).toHaveProperty("transfer")
      expect(serviceMeta).toHaveProperty("get_metadata")

      // Check get_balance
      const getBalanceMeta = (serviceMeta as any)[
        "get_balance"
      ] as MethodArgumentsMeta<unknown>
      expect(getBalanceMeta.functionType).toBe("query")
      expect(getBalanceMeta.fields).toHaveLength(1)
      expect(getBalanceMeta.fields[0].type).toBe("principal")

      // Check transfer
      const transferMeta = (serviceMeta as any)[
        "transfer"
      ] as MethodArgumentsMeta<unknown>
      expect(transferMeta.functionType).toBe("update")
      expect(transferMeta.fields).toHaveLength(1)
      expect(transferMeta.fields[0].type).toBe("record")

      // Check get_metadata
      const getMetadataMeta = (serviceMeta as any)[
        "get_metadata"
      ] as MethodArgumentsMeta<unknown>
      expect(getMetadataMeta.functionType).toBe("query")
      expect(getMetadataMeta.fields).toHaveLength(0)
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Path Generation
  // ════════════════════════════════════════════════════════════════════════

  describe("Path Generation", () => {
    it("should generate correct paths for nested records", () => {
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
      const meta = funcType.accept(
        visitor,
        "updateUser"
      ) as MethodArgumentsMeta<unknown>

      const argRecord = meta.fields[0] as RecordArgumentField
      expect(argRecord.path).toBe("[0]")

      const userRecord = argRecord.fields.find(
        (f) => f.label === "user"
      ) as RecordArgumentField
      expect(userRecord.path).toBe("[0].user")

      const nameField = userRecord.fields.find(
        (f) => f.label === "name"
      ) as TextArgumentField
      expect(nameField.path).toBe("[0].user.name")

      const ageField = userRecord.fields.find(
        (f) => f.label === "age"
      ) as NumberArgumentField
      expect(ageField.path).toBe("[0].user.age")
    })

    it("should generate correct paths for vectors", () => {
      const funcType = IDL.Func([IDL.Vec(IDL.Text)], [], [])
      const meta = funcType.accept(
        visitor,
        "addTags"
      ) as MethodArgumentsMeta<unknown>

      const vecField = meta.fields[0] as VectorArgumentField
      expect(vecField.path).toBe("[0]")
      expect(vecField.itemField.path).toBe("[0][0]")
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

      const field = ApproveArgs.accept(
        visitor,
        "approve"
      ) as RecordArgumentField

      expect(field.type).toBe("record")
      expect(field.fields.length).toBeGreaterThan(5)

      // Check spender field
      const spenderField = field.fields.find(
        (f) => f.label === "spender"
      ) as RecordArgumentField
      expect(spenderField.type).toBe("record")
      expect(spenderField.fields).toHaveLength(2)

      // Check amount field
      const amountField = field.fields.find(
        (f) => f.label === "amount"
      ) as NumberArgumentField
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

      const field = ProposalType.accept(
        visitor,
        "proposal"
      ) as VariantArgumentField

      expect(field.type).toBe("variant")
      expect(field.options).toContain("Motion")
      expect(field.options).toContain("TransferSnsTreasuryFunds")
      expect(field.options).toContain("UpgradeSnsControlledCanister")

      // Check Motion variant
      const motionField = field.fields.find(
        (f) => f.label === "Motion"
      ) as RecordArgumentField
      expect(motionField.type).toBe("record")
      expect(motionField.fields).toHaveLength(1)

      // Check TransferSnsTreasuryFunds variant
      const transferField = field.fields.find(
        (f) => f.label === "TransferSnsTreasuryFunds"
      ) as RecordArgumentField
      expect(transferField.type).toBe("record")
      expect(transferField.fields.length).toBeGreaterThan(3)
    })
  })
})
