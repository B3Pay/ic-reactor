import { describe, it, expect } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { ResultFieldVisitor } from "./index"
import type {
  ResultField,
  RecordResultField,
  VariantResultField,
  TupleResultField,
  OptionalResultField,
  VectorResultField,
  BlobResultField,
  RecursiveResultField,
  NumberResultField,
  TextResultField,
  PrincipalResultField,
  BooleanResultField,
  NullResultField,
  MethodResultMeta,
  ServiceResultMeta,
} from "./types"

describe("ResultFieldVisitor", () => {
  const visitor = new ResultFieldVisitor()

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Primitive Types", () => {
    it("should handle text type", () => {
      const textType = IDL.Text
      const field = textType.accept(visitor, "message") as TextResultField

      expect(field.type).toBe("text")
      expect(field.label).toBe("message")
      expect(field.candidType).toBe("text")
      expect(field.displayType).toBe("string")
      expect(field.textFormat).toBe("plain")
    })

    it("should handle text with special label detection", () => {
      const emailField = IDL.Text.accept(visitor, "email") as TextResultField
      expect(emailField.textFormat).toBe("email")

      const urlField = IDL.Text.accept(
        visitor,
        "website_url"
      ) as TextResultField
      expect(urlField.textFormat).toBe("url")

      const phoneField = IDL.Text.accept(
        visitor,
        "phone_number"
      ) as TextResultField
      expect(phoneField.textFormat).toBe("phone")

      const uuidField = IDL.Text.accept(
        visitor,
        "transaction_uuid"
      ) as TextResultField
      expect(uuidField.textFormat).toBe("uuid")

      const btcField = IDL.Text.accept(
        visitor,
        "btc_address"
      ) as TextResultField
      expect(btcField.textFormat).toBe("btc")

      const ethField = IDL.Text.accept(
        visitor,
        "ethereum_address"
      ) as TextResultField
      expect(ethField.textFormat).toBe("eth")

      const accountIdField = IDL.Text.accept(
        visitor,
        "account_id"
      ) as TextResultField
      expect(accountIdField.textFormat).toBe("account-id")

      const principalField = IDL.Text.accept(
        visitor,
        "canister_id"
      ) as TextResultField
      expect(principalField.textFormat).toBe("principal")
    })

    it("should handle bool type", () => {
      const boolType = IDL.Bool
      const field = boolType.accept(visitor, "isActive") as BooleanResultField

      expect(field.type).toBe("boolean")
      expect(field.label).toBe("isActive")
      expect(field.candidType).toBe("bool")
      expect(field.displayType).toBe("boolean")
    })

    it("should handle null type", () => {
      const nullType = IDL.Null
      const field = nullType.accept(visitor, "empty") as NullResultField

      expect(field.type).toBe("null")
      expect(field.candidType).toBe("null")
      expect(field.displayType).toBe("null")
    })

    it("should handle principal type", () => {
      const principalType = IDL.Principal
      const field = principalType.accept(
        visitor,
        "owner"
      ) as PrincipalResultField

      expect(field.type).toBe("principal")
      expect(field.label).toBe("owner")
      expect(field.candidType).toBe("principal")
      expect(field.displayType).toBe("string") // Principal → string after transformation
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Number Types - Display Type Mapping
  // ════════════════════════════════════════════════════════════════════════

  describe("Number Types", () => {
    describe("BigInt types (display as string)", () => {
      it("should map nat to string display type", () => {
        const field = IDL.Nat.accept(visitor, "amount") as NumberResultField

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat")
        expect(field.displayType).toBe("string") // BigInt → string
        expect(field.numberFormat).toBe("normal")
      })

      it("should map int to string display type", () => {
        const field = IDL.Int.accept(visitor, "balance") as NumberResultField

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("int")
        expect(field.displayType).toBe("string")
      })

      it("should map nat64 to string display type", () => {
        const field = IDL.Nat64.accept(
          visitor,
          "timestamp"
        ) as NumberResultField

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat64")
        expect(field.displayType).toBe("string") // 64-bit → string
      })

      it("should map int64 to string display type", () => {
        const field = IDL.Int64.accept(visitor, "offset") as NumberResultField

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("int64")
        expect(field.displayType).toBe("string")
      })
    })

    describe("Small int types (display as number)", () => {
      it("should map nat8 to number display type", () => {
        const field = IDL.Nat8.accept(visitor, "byte") as NumberResultField

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat8")
        expect(field.displayType).toBe("number") // Small int stays number
      })

      it("should map nat16 to number display type", () => {
        const field = IDL.Nat16.accept(visitor, "port") as NumberResultField

        expect(field.candidType).toBe("nat16")
        expect(field.displayType).toBe("number")
      })

      it("should map nat32 to number display type", () => {
        const field = IDL.Nat32.accept(visitor, "count") as NumberResultField

        expect(field.candidType).toBe("nat32")
        expect(field.displayType).toBe("number")
      })

      it("should map int8 to number display type", () => {
        const field = IDL.Int8.accept(visitor, "temp") as NumberResultField

        expect(field.candidType).toBe("int8")
        expect(field.displayType).toBe("number")
      })

      it("should map int32 to number display type", () => {
        const field = IDL.Int32.accept(visitor, "index") as NumberResultField

        expect(field.candidType).toBe("int32")
        expect(field.displayType).toBe("number")
      })
    })

    describe("Float types (display as number)", () => {
      it("should map float32 to number display type", () => {
        const field = IDL.Float32.accept(visitor, "rate") as NumberResultField

        expect(field.candidType).toBe("float32")
        expect(field.displayType).toBe("number")
      })

      it("should map float64 to number display type", () => {
        const field = IDL.Float64.accept(visitor, "price") as NumberResultField

        expect(field.candidType).toBe("float64")
        expect(field.displayType).toBe("number")
      })
    })

    describe("Number format detection", () => {
      it("should detect timestamp format from label", () => {
        const timestampField = IDL.Nat64.accept(
          visitor,
          "created_at"
        ) as NumberResultField
        expect(timestampField.numberFormat).toBe("timestamp")

        const dateField = IDL.Nat.accept(
          visitor,
          "timestamp_nanos"
        ) as NumberResultField
        expect(dateField.numberFormat).toBe("timestamp")

        const deadlineField = IDL.Nat.accept(
          visitor,
          "deadline"
        ) as NumberResultField
        expect(deadlineField.numberFormat).toBe("timestamp")
      })

      it("should detect cycle format from label", () => {
        const cycleField = IDL.Nat.accept(
          visitor,
          "cycles"
        ) as NumberResultField
        expect(cycleField.numberFormat).toBe("cycle")

        // "cycle" as standalone word
        const cycleSingleField = IDL.Nat.accept(
          visitor,
          "cycle"
        ) as NumberResultField
        expect(cycleSingleField.numberFormat).toBe("cycle")
      })

      it("should default to normal format", () => {
        const amountField = IDL.Nat.accept(
          visitor,
          "amount"
        ) as NumberResultField
        expect(amountField.numberFormat).toBe("normal")

        const countField = IDL.Nat.accept(visitor, "count") as NumberResultField
        expect(countField.numberFormat).toBe("normal")
      })
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
      const field = recordType.accept(visitor, "person") as RecordResultField

      expect(field.type).toBe("record")
      expect(field.label).toBe("person")
      expect(field.candidType).toBe("record")
      expect(field.displayType).toBe("object")
      expect(field.fields).toHaveLength(2)

      const nameField = field.fields.find(
        (f) => f.label === "name"
      ) as TextResultField
      expect(nameField.displayType).toBe("string")

      const ageField = field.fields.find(
        (f) => f.label === "age"
      ) as NumberResultField
      expect(ageField.displayType).toBe("string") // nat → string
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
      const field = personType.accept(visitor, "user") as RecordResultField

      expect(field.type).toBe("record")

      const addressField = field.fields.find(
        (f) => f.label === "address"
      ) as RecordResultField
      expect(addressField.type).toBe("record")
      expect(addressField.displayType).toBe("object")
      expect(addressField.fields).toHaveLength(2)
    })

    it("should handle ICRC-1 account record", () => {
      const accountType = IDL.Record({
        owner: IDL.Principal,
        subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
      })
      const field = accountType.accept(visitor, "account") as RecordResultField

      expect(field.type).toBe("record")

      const ownerField = field.fields.find(
        (f) => f.label === "owner"
      ) as PrincipalResultField
      expect(ownerField.type).toBe("principal")
      expect(ownerField.displayType).toBe("string")

      const subaccountField = field.fields.find(
        (f) => f.label === "subaccount"
      ) as OptionalResultField
      expect(subaccountField.type).toBe("optional")
      expect(subaccountField.innerField.type).toBe("blob")
    })
  })

  describe("Variant Types", () => {
    it("should handle simple variant", () => {
      const statusType = IDL.Variant({
        Active: IDL.Null,
        Inactive: IDL.Null,
        Pending: IDL.Null,
      })
      const field = statusType.accept(visitor, "status") as VariantResultField

      expect(field.type).toBe("variant")
      expect(field.candidType).toBe("variant")
      expect(field.displayType).toBe("variant")
      expect(field.options).toContain("Active")
      expect(field.options).toContain("Inactive")
      expect(field.options).toContain("Pending")
      expect(field.options).toHaveLength(3)
    })

    it("should handle variant with payloads", () => {
      const eventType = IDL.Variant({
        Transfer: IDL.Record({
          from: IDL.Principal,
          to: IDL.Principal,
          amount: IDL.Nat,
        }),
        Approve: IDL.Nat,
        Mint: IDL.Record({
          to: IDL.Principal,
          amount: IDL.Nat,
        }),
      })
      const field = eventType.accept(visitor, "event") as VariantResultField

      expect(field.type).toBe("variant")
      expect(field.options).toContain("Transfer")
      expect(field.options).toContain("Approve")
      expect(field.options).toContain("Mint")
      expect(field.options).toHaveLength(3)

      const transferField = field.optionFields.find(
        (f) => f.label === "Transfer"
      ) as RecordResultField
      expect(transferField.type).toBe("record")
      expect(transferField.fields).toHaveLength(3)

      const approveField = field.optionFields.find(
        (f) => f.label === "Approve"
      ) as NumberResultField
      expect(approveField.type).toBe("number")
    })

    it("should detect Result variant (Ok/Err)", () => {
      const resultType = IDL.Variant({
        Ok: IDL.Nat,
        Err: IDL.Text,
      })
      const field = resultType.accept(visitor, "result") as VariantResultField

      expect(field.type).toBe("variant")
      expect(field.displayType).toBe("result") // Special result type
      expect(field.isResultType).toBe(true)
      expect(field.options).toContain("Ok")
      expect(field.options).toContain("Err")

      const okField = field.optionFields.find(
        (f) => f.label === "Ok"
      ) as NumberResultField
      expect(okField.displayType).toBe("string")

      const errField = field.optionFields.find(
        (f) => f.label === "Err"
      ) as TextResultField
      expect(errField.displayType).toBe("string")
    })

    it("should detect complex Result variant", () => {
      const resultType = IDL.Variant({
        Ok: IDL.Record({
          id: IDL.Nat,
          data: IDL.Vec(IDL.Nat8),
        }),
        Err: IDL.Variant({
          NotFound: IDL.Null,
          Unauthorized: IDL.Null,
          InvalidInput: IDL.Text,
        }),
      })
      const field = resultType.accept(visitor, "result") as VariantResultField

      expect(field.isResultType).toBe(true)
      expect(field.displayType).toBe("result")

      const okField = field.optionFields.find(
        (f) => f.label === "Ok"
      ) as RecordResultField
      expect(okField.type).toBe("record")

      const errField = field.optionFields.find(
        (f) => f.label === "Err"
      ) as VariantResultField
      expect(errField.type).toBe("variant")
      expect(errField.isResultType).toBe(false)
    })

    it("should not detect non-Result variant with Ok and other options", () => {
      const weirdType = IDL.Variant({
        Ok: IDL.Nat,
        Pending: IDL.Null,
        Processing: IDL.Text,
      })
      const field = weirdType.accept(visitor, "status") as VariantResultField

      expect(field.isResultType).toBe(false) // Not exactly Ok/Err pair
      expect(field.displayType).toBe("variant")
    })
  })

  describe("Tuple Types", () => {
    it("should handle simple tuple", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const field = tupleType.accept(visitor, "pair") as TupleResultField

      expect(field.type).toBe("tuple")
      expect(field.candidType).toBe("tuple")
      expect(field.displayType).toBe("array")
      expect(field.fields).toHaveLength(2)
      expect(field.fields[0].type).toBe("text")
      expect(field.fields[1].type).toBe("number")
    })

    it("should handle tuple with mixed types", () => {
      const tupleType = IDL.Tuple(
        IDL.Principal,
        IDL.Nat64,
        IDL.Bool,
        IDL.Vec(IDL.Nat8)
      )
      const field = tupleType.accept(visitor, "data") as TupleResultField

      expect(field.fields).toHaveLength(4)
      expect(field.fields[0].type).toBe("principal")
      expect(field.fields[1].type).toBe("number")
      expect((field.fields[1] as NumberResultField).displayType).toBe("string") // nat64 → string
      expect(field.fields[2].type).toBe("boolean")
      expect(field.fields[3].type).toBe("blob")
    })
  })

  describe("Optional Types", () => {
    it("should handle optional primitive", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = optType.accept(visitor, "nickname") as OptionalResultField

      expect(field.type).toBe("optional")
      expect(field.candidType).toBe("opt")
      expect(field.displayType).toBe("nullable") // opt T → T | null
      expect(field.innerField.type).toBe("text")
    })

    it("should handle optional record", () => {
      const optType = IDL.Opt(
        IDL.Record({
          name: IDL.Text,
          value: IDL.Nat,
        })
      )
      const field = optType.accept(visitor, "metadata") as OptionalResultField

      expect(field.type).toBe("optional")
      expect(field.innerField.type).toBe("record")
    })

    it("should handle nested optional", () => {
      const optType = IDL.Opt(IDL.Opt(IDL.Nat))
      const field = optType.accept(
        visitor,
        "maybeNumber"
      ) as OptionalResultField

      expect(field.type).toBe("optional")
      expect(field.innerField.type).toBe("optional")
      expect((field.innerField as OptionalResultField).innerField.type).toBe(
        "number"
      )
    })
  })

  describe("Vector Types", () => {
    it("should handle vector of primitives", () => {
      const vecType = IDL.Vec(IDL.Text)
      const field = vecType.accept(visitor, "tags") as VectorResultField

      expect(field.type).toBe("vector")
      expect(field.candidType).toBe("vec")
      expect(field.displayType).toBe("array")
      expect(field.itemField.type).toBe("text")
    })

    it("should handle vector of records", () => {
      const vecType = IDL.Vec(
        IDL.Record({
          id: IDL.Nat,
          name: IDL.Text,
        })
      )
      const field = vecType.accept(visitor, "items") as VectorResultField

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("record")
    })

    it("should handle blob (vec nat8)", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = blobType.accept(visitor, "data") as BlobResultField

      expect(field.type).toBe("blob")
      expect(field.candidType).toBe("blob")
      expect(field.displayType).toBe("string") // Blob → hex string
      expect(field.displayHint).toBe("hex")
    })

    it("should handle nested vectors", () => {
      const nestedVecType = IDL.Vec(IDL.Vec(IDL.Nat))
      const field = nestedVecType.accept(visitor, "matrix") as VectorResultField

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("vector")
    })

    it("should handle vec of tuples (Map-like)", () => {
      const mapType = IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))
      const field = mapType.accept(visitor, "metadata") as VectorResultField

      expect(field.type).toBe("vector")
      expect(field.itemField.type).toBe("tuple")
      expect((field.itemField as TupleResultField).fields).toHaveLength(2)
    })
  })

  describe("Recursive Types", () => {
    it("should handle recursive tree type", () => {
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

      const field = Tree.accept(visitor, "tree") as RecursiveResultField

      expect(field.type).toBe("recursive")
      expect(field.candidType).toBe("rec")
      expect(field.displayType).toBe("recursive")
      expect(field.typeName).toBeDefined()
      expect(typeof field.extract).toBe("function")

      // Extract should return the variant
      const extracted = field.extract() as VariantResultField
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

      const field = List.accept(visitor, "list") as RecursiveResultField

      expect(field.type).toBe("recursive")

      const extracted = field.extract() as VariantResultField
      expect(extracted.options).toEqual(["Nil", "Cons"])
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Function Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Function Types", () => {
    it("should handle query function with single return", () => {
      const funcType = IDL.Func([IDL.Principal], [IDL.Nat], ["query"])
      const meta = funcType.accept(
        visitor,
        "get_balance"
      ) as MethodResultMeta<unknown>

      expect(meta.functionType).toBe("query")
      expect(meta.functionName).toBe("get_balance")
      expect(meta.returnCount).toBe(1)
      expect(meta.resultFields).toHaveLength(1)

      const returnField = meta.resultFields[0] as NumberResultField
      expect(returnField.type).toBe("number")
      expect(returnField.candidType).toBe("nat")
      expect(returnField.displayType).toBe("string")
    })

    it("should handle update function with Result return", () => {
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
      ) as MethodResultMeta<unknown>

      expect(meta.functionType).toBe("update")
      expect(meta.returnCount).toBe(1)

      const resultField = meta.resultFields[0] as VariantResultField
      expect(resultField.type).toBe("variant")
      expect(resultField.isResultType).toBe(true)
      expect(resultField.displayType).toBe("result")
    })

    it("should handle function with multiple returns", () => {
      const funcType = IDL.Func([], [IDL.Text, IDL.Nat, IDL.Bool], ["query"])
      const meta = funcType.accept(
        visitor,
        "get_info"
      ) as MethodResultMeta<unknown>

      expect(meta.returnCount).toBe(3)
      expect(meta.resultFields).toHaveLength(3)
      expect(meta.resultFields[0].type).toBe("text")
      expect(meta.resultFields[1].type).toBe("number")
      expect(meta.resultFields[2].type).toBe("boolean")
    })

    it("should handle function with no returns", () => {
      const funcType = IDL.Func([IDL.Text], [], [])
      const meta = funcType.accept(visitor, "log") as MethodResultMeta<unknown>

      expect(meta.returnCount).toBe(0)
      expect(meta.resultFields).toHaveLength(0)
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
      ) as ServiceResultMeta<unknown>

      expect(Object.keys(serviceMeta)).toHaveLength(3)

      // Check get_balance
      const getBalanceMeta = (serviceMeta as any)[
        "get_balance"
      ] as MethodResultMeta<unknown>
      expect(getBalanceMeta.functionType).toBe("query")
      expect(getBalanceMeta.returnCount).toBe(1)
      expect(getBalanceMeta.resultFields[0].type).toBe("number")
      expect(
        (getBalanceMeta.resultFields[0] as NumberResultField).displayType
      ).toBe("string")

      // Check transfer
      const transferMeta = (serviceMeta as any)[
        "transfer"
      ] as MethodResultMeta<unknown>
      expect(transferMeta.functionType).toBe("update")
      expect(
        (transferMeta.resultFields[0] as VariantResultField).isResultType
      ).toBe(true)

      // Check get_metadata
      const getMetadataMeta = (serviceMeta as any)[
        "get_metadata"
      ] as MethodResultMeta<unknown>
      expect(getMetadataMeta.returnCount).toBe(1)
      expect(getMetadataMeta.resultFields[0].type).toBe("vector")
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Real-World Examples
  // ════════════════════════════════════════════════════════════════════════

  describe("Real-World Examples", () => {
    it("should handle ICRC-1 balance_of return", () => {
      const funcType = IDL.Func(
        [
          IDL.Record({
            owner: IDL.Principal,
            subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
          }),
        ],
        [IDL.Nat],
        ["query"]
      )
      const meta = funcType.accept(
        visitor,
        "icrc1_balance_of"
      ) as MethodResultMeta<unknown>

      expect(meta.functionType).toBe("query")
      expect(meta.returnCount).toBe(1)

      const balanceField = meta.resultFields[0] as NumberResultField
      expect(balanceField.candidType).toBe("nat")
      expect(balanceField.displayType).toBe("string")
    })

    it("should handle ICRC-1 transfer return", () => {
      const TransferResult = IDL.Variant({
        Ok: IDL.Nat, // Block index
        Err: IDL.Variant({
          BadFee: IDL.Record({ expected_fee: IDL.Nat }),
          BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
          InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
          TooOld: IDL.Null,
          CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
          Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
          TemporarilyUnavailable: IDL.Null,
          GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
        }),
      })

      const field = TransferResult.accept(
        visitor,
        "result"
      ) as VariantResultField

      expect(field.isResultType).toBe(true)
      expect(field.displayType).toBe("result")

      const okField = field.optionFields.find(
        (f) => f.label === "Ok"
      ) as NumberResultField
      expect(okField.candidType).toBe("nat")
      expect(okField.displayType).toBe("string")

      const errField = field.optionFields.find(
        (f) => f.label === "Err"
      ) as VariantResultField
      expect(errField.type).toBe("variant")
      expect(errField.options).toContain("InsufficientFunds")
      expect(errField.options).toContain("GenericError")
    })

    it("should handle SNS canister status return", () => {
      const CanisterStatusResponse = IDL.Record({
        status: IDL.Variant({
          running: IDL.Null,
          stopping: IDL.Null,
          stopped: IDL.Null,
        }),
        settings: IDL.Record({
          controllers: IDL.Vec(IDL.Principal),
          compute_allocation: IDL.Nat,
          memory_allocation: IDL.Nat,
          freezing_threshold: IDL.Nat,
        }),
        module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
        memory_size: IDL.Nat,
        cycles: IDL.Nat,
        idle_cycles_burned_per_day: IDL.Nat,
      })

      const field = CanisterStatusResponse.accept(
        visitor,
        "status"
      ) as RecordResultField

      expect(field.type).toBe("record")

      // Check status variant
      const statusField = field.fields.find(
        (f) => f.label === "status"
      ) as VariantResultField
      expect(statusField.type).toBe("variant")
      expect(statusField.options).toContain("running")
      expect(statusField.options).toContain("stopping")
      expect(statusField.options).toContain("stopped")
      expect(statusField.options).toHaveLength(3)

      // Check settings record
      const settingsField = field.fields.find(
        (f) => f.label === "settings"
      ) as RecordResultField
      expect(settingsField.type).toBe("record")

      const controllersField = settingsField.fields.find(
        (f) => f.label === "controllers"
      ) as VectorResultField
      expect(controllersField.type).toBe("vector")
      expect(controllersField.itemField.type).toBe("principal")

      // Check cycles - should detect special format
      const cyclesField = field.fields.find(
        (f) => f.label === "cycles"
      ) as NumberResultField
      expect(cyclesField.numberFormat).toBe("cycle")

      // Check module_hash - optional blob
      const moduleHashField = field.fields.find(
        (f) => f.label === "module_hash"
      ) as OptionalResultField
      expect(moduleHashField.type).toBe("optional")
      expect(moduleHashField.innerField.type).toBe("blob")
    })

    it("should handle complex governance proposal types", () => {
      const ProposalInfo = IDL.Record({
        id: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
        status: IDL.Nat32,
        topic: IDL.Nat32,
        failure_reason: IDL.Opt(
          IDL.Record({ error_type: IDL.Nat32, error_message: IDL.Text })
        ),
        ballots: IDL.Vec(
          IDL.Tuple(
            IDL.Nat64,
            IDL.Record({
              vote: IDL.Nat32,
              voting_power: IDL.Nat64,
            })
          )
        ),
        proposal_timestamp_seconds: IDL.Nat64,
        reward_event_round: IDL.Nat64,
        deadline_timestamp_seconds: IDL.Opt(IDL.Nat64),
        executed_timestamp_seconds: IDL.Nat64,
        reject_cost_e8s: IDL.Nat64,
        proposer: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
        reward_status: IDL.Nat32,
      })

      const field = ProposalInfo.accept(
        visitor,
        "proposal"
      ) as RecordResultField

      expect(field.type).toBe("record")
      expect(field.fields.length).toBeGreaterThan(8)

      // Check timestamp field (note: the label pattern matching may not match "proposal_timestamp_seconds")
      const timestampField = field.fields.find(
        (f) => f.label === "proposal_timestamp_seconds"
      ) as NumberResultField
      expect(timestampField.type).toBe("number")
      expect(timestampField.displayType).toBe("string") // nat64 → string

      // Check ballots - vec of tuples
      const ballotsField = field.fields.find(
        (f) => f.label === "ballots"
      ) as VectorResultField
      expect(ballotsField.type).toBe("vector")
      expect(ballotsField.itemField.type).toBe("tuple")

      const ballotTuple = ballotsField.itemField as TupleResultField
      expect(ballotTuple.fields).toHaveLength(2)
      expect(ballotTuple.fields[0].type).toBe("number") // nat64
      expect(ballotTuple.fields[1].type).toBe("record") // ballot record
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Display Type Verification
  // ════════════════════════════════════════════════════════════════════════

  describe("Display Type Verification", () => {
    it("should correctly map all types to their display types", () => {
      const testCases: Array<{ type: IDL.Type; expectedDisplay: string }> = [
        { type: IDL.Text, expectedDisplay: "string" },
        { type: IDL.Principal, expectedDisplay: "string" },
        { type: IDL.Nat, expectedDisplay: "string" },
        { type: IDL.Int, expectedDisplay: "string" },
        { type: IDL.Nat64, expectedDisplay: "string" },
        { type: IDL.Int64, expectedDisplay: "string" },
        { type: IDL.Nat8, expectedDisplay: "number" },
        { type: IDL.Nat16, expectedDisplay: "number" },
        { type: IDL.Nat32, expectedDisplay: "number" },
        { type: IDL.Int8, expectedDisplay: "number" },
        { type: IDL.Int16, expectedDisplay: "number" },
        { type: IDL.Int32, expectedDisplay: "number" },
        { type: IDL.Float32, expectedDisplay: "number" },
        { type: IDL.Float64, expectedDisplay: "number" },
        { type: IDL.Bool, expectedDisplay: "boolean" },
        { type: IDL.Null, expectedDisplay: "null" },
        { type: IDL.Vec(IDL.Nat8), expectedDisplay: "string" }, // blob → hex string
        { type: IDL.Vec(IDL.Text), expectedDisplay: "array" },
        { type: IDL.Opt(IDL.Text), expectedDisplay: "nullable" },
        { type: IDL.Record({ a: IDL.Text }), expectedDisplay: "object" },
        { type: IDL.Tuple(IDL.Text, IDL.Nat), expectedDisplay: "array" },
      ]

      testCases.forEach(({ type, expectedDisplay }) => {
        const field = type.accept(visitor, "test") as ResultField
        expect(field.displayType).toBe(expectedDisplay)
      })
    })
  })
})
