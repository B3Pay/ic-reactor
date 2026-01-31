import { describe, it, expect } from "vitest"
import { ResultFieldVisitor } from "./index"
import type {
  ResultNode,
  ResolvedNode,
  RecordNode,
  VariantNode,
  TupleNode,
  OptionalNode,
  VectorNode,
  BlobNode,
  RecursiveNode,
  NumberNode,
  TextNode,
  PrincipalNode,
  BooleanNode,
  NullNode,
  MethodMeta,
  ServiceMeta,
} from "./types"
import { IDL } from "@icp-sdk/core/candid"

describe("ResultFieldVisitor", () => {
  const visitor = new ResultFieldVisitor()

  // ════════════════════════════════════════════════════════════════════════
  // Primitive Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Primitive Types", () => {
    it("should handle text type", () => {
      const textType = IDL.Text
      const field = visitor.visitText(textType, "message")

      expect(field.type).toBe("text")
      expect(field.label).toBe("message")
      expect(field.candidType).toBe("text")
      expect(field.displayType).toBe("string")
      expect(field.format).toBe("plain")
    })

    it("should handle text with special label detection", () => {
      const emailField = visitor.visitText(IDL.Text, "email")
      expect(emailField.format).toBe("email")

      const urlField = visitor.visitText(IDL.Text, "website_url")
      expect(urlField.format).toBe("url")

      const phoneField = visitor.visitText(IDL.Text, "phone_number")
      expect(phoneField.format).toBe("phone")

      const uuidField = visitor.visitText(IDL.Text, "transaction_uuid")
      expect(uuidField.format).toBe("uuid")

      const btcField = visitor.visitText(IDL.Text, "btc_address")
      expect(btcField.format).toBe("btc")

      const ethField = visitor.visitText(IDL.Text, "ethereum_address")
      expect(ethField.format).toBe("eth")

      const accountIdField = visitor.visitText(IDL.Text, "account_identifier")
      expect(accountIdField.format).toBe("account-id")

      const principalField = visitor.visitText(IDL.Text, "canister_id")
      expect(principalField.format).toBe("principal")
    })

    it("should handle bool type", () => {
      const boolType = IDL.Bool
      const field = visitor.visitBool(boolType, "isActive")

      expect(field.type).toBe("boolean")
      expect(field.label).toBe("isActive")
      expect(field.candidType).toBe("bool")
      expect(field.displayType).toBe("boolean")
    })

    it("should handle null type", () => {
      const nullType = IDL.Null
      const field = visitor.visitNull(nullType, "empty")

      expect(field.type).toBe("null")
      expect(field.candidType).toBe("null")
      expect(field.displayType).toBe("null")
    })

    it("should handle principal type", () => {
      const principalType = IDL.Principal
      const field = visitor.visitPrincipal(IDL.Principal, "owner")

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
        const field = visitor.visitNat(IDL.Nat, "amount")

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat")
        expect(field.displayType).toBe("string") // BigInt → string
        expect(field.format).toBe("normal")
      })

      it("should map int to string display type", () => {
        const field = visitor.visitInt(IDL.Int, "balance")

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("int")
        expect(field.displayType).toBe("string")
      })

      it("should map nat64 to string display type", () => {
        const field = visitor.visitFixedNat(IDL.Nat64, "timestamp")

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat64")
        expect(field.displayType).toBe("string") // 64-bit → string
      })

      it("should map int64 to string display type", () => {
        const field = visitor.visitFixedInt(IDL.Int64, "offset")

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("int64")
        expect(field.displayType).toBe("string")
      })
    })

    describe("Small int types (display as number)", () => {
      it("should map nat8 to number display type", () => {
        const field = visitor.visitFixedNat(IDL.Nat8, "byte")

        expect(field.type).toBe("number")
        expect(field.candidType).toBe("nat8")
        expect(field.displayType).toBe("number") // Small int stays number
      })

      it("should map nat16 to number display type", () => {
        const field = visitor.visitFixedNat(IDL.Nat16, "port")

        expect(field.candidType).toBe("nat16")
        expect(field.displayType).toBe("number")
      })

      it("should map nat32 to number display type", () => {
        const field = visitor.visitFixedNat(IDL.Nat32, "count")

        expect(field.candidType).toBe("nat32")
        expect(field.displayType).toBe("number")
      })

      it("should map int8 to number display type", () => {
        const field = visitor.visitFixedInt(IDL.Int8, "temp")

        expect(field.candidType).toBe("int8")
        expect(field.displayType).toBe("number")
      })

      it("should map int32 to number display type", () => {
        const field = visitor.visitFixedInt(IDL.Int32, "index")

        expect(field.candidType).toBe("int32")
        expect(field.displayType).toBe("number")
      })
    })

    describe("Float types (display as number)", () => {
      it("should map float32 to number display type", () => {
        const field = visitor.visitFloat(IDL.Float32, "rate")

        expect(field.candidType).toBe("float32")
        expect(field.displayType).toBe("number")
      })

      it("should map float64 to number display type", () => {
        const field = visitor.visitFloat(IDL.Float64, "price")

        expect(field.candidType).toBe("float64")
        expect(field.displayType).toBe("number")
      })
    })

    describe("Number format detection", () => {
      it("should detect timestamp format from label", () => {
        const timestampField = visitor.visitFixedNat(IDL.Nat64, "created_at")
        expect(timestampField.format).toBe("timestamp")

        const dateField = visitor.visitNat(IDL.Nat, "timestamp_nanos")
        expect(dateField.format).toBe("timestamp")

        const deadlineField = visitor.visitNat(IDL.Nat, "deadline")
        expect(deadlineField.format).toBe("timestamp")
      })

      it("should detect cycle format from label", () => {
        const cycleField = visitor.visitNat(IDL.Nat, "cycles")
        expect(cycleField.format).toBe("cycle")

        // "cycle" as standalone word
        const cycleSingleField = visitor.visitNat(IDL.Nat, "cycle")
        expect(cycleSingleField.format).toBe("cycle")
      })

      it("should default to normal format", () => {
        const amountField = visitor.visitNat(IDL.Nat, "amount")
        expect(amountField.format).toBe("normal")

        const countField = visitor.visitNat(IDL.Nat, "count")
        expect(countField.format).toBe("normal")
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
      expect(field.candidType).toBe("record")
      expect(field.displayType).toBe("object")
      expect(Object.keys(field.fields)).toHaveLength(2)

      const nameField = field.fields["name"]
      if (!nameField || nameField.type !== "text") {
        throw new Error("Name field not found or not text")
      }
      expect(nameField.displayType).toBe("string")

      const ageField = field.fields["age"]
      if (!ageField || ageField.type !== "number") {
        throw new Error("Age field not found or not number")
      }
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
      const field = visitor.visitRecord(
        personType,
        [
          ["name", IDL.Text],
          ["address", addressType],
        ],
        "user"
      )

      expect(field.type).toBe("record")

      const addressField = field.fields["address"] as RecordNode
      if (!addressField || addressField.type !== "record") {
        throw new Error("Address field not found or not a record")
      }

      expect(addressField.type).toBe("record")
      expect(addressField.displayType).toBe("object")
      expect(Object.keys(addressField.fields)).toHaveLength(2)
    })

    it("should handle ICRC-1 account record", () => {
      const accountType = IDL.Record({
        owner: IDL.Principal,
        subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
      })
      const field = visitor.visitRecord(
        accountType,
        [
          ["owner", IDL.Principal],
          ["subaccount", IDL.Opt(IDL.Vec(IDL.Nat8))],
        ],
        "account"
      )

      expect(field.type).toBe("record")

      const ownerField = field.fields["owner"]
      if (!ownerField || ownerField.type !== "principal") {
        throw new Error("Owner field not found or not principal")
      }
      expect(ownerField.type).toBe("principal")
      expect(ownerField.displayType).toBe("string")

      const subaccountField = field.fields["subaccount"] as OptionalNode
      if (!subaccountField || subaccountField.type !== "optional") {
        throw new Error("Subaccount field not found or not optional")
      }
      expect(subaccountField.type).toBe("optional")
      // Resolve an example value to validate inner blob type
      const subaccountResolved = subaccountField.resolve([
        new Uint8Array([1, 2, 3]),
      ])
      expect((subaccountResolved.value as ResolvedNode).type).toBe("blob")
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
          ["Active", IDL.Null],
          ["Inactive", IDL.Null],
          ["Pending", IDL.Null],
        ],
        "status"
      )

      expect(field.type).toBe("variant")
      expect(field.candidType).toBe("variant")
      expect(field.displayType).toBe("variant")
      // Validate options by resolving each option
      const resolvedActive = field.resolve({ Active: null })
      expect(resolvedActive.selected).toBe("Active")
      expect(resolvedActive.selectedOption.type).toBe("null")
      const resolvedInactive = field.resolve({ Inactive: null })
      expect(resolvedInactive.selected).toBe("Inactive")
      const resolvedPending = field.resolve({ Pending: null })
      expect(resolvedPending.selected).toBe("Pending")
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
      const field = visitor.visitVariant(
        eventType,
        [
          [
            "Transfer",
            IDL.Record({
              from: IDL.Principal,
              to: IDL.Principal,
              amount: IDL.Nat,
            }),
          ],
          ["Approve", IDL.Nat],
          [
            "Mint",
            IDL.Record({
              to: IDL.Principal,
              amount: IDL.Nat,
            }),
          ],
        ],
        "event"
      )

      expect(field.type).toBe("variant")
      // Validate Transfer payload
      const transferResolved = field.resolve({
        Transfer: { from: "aaaaa-aa", to: "bbbbb-bb", amount: BigInt(1) },
      })
      expect(transferResolved.selected).toBe("Transfer")
      expect(transferResolved.selectedOption.type).toBe("record")
      expect(
        Object.keys((transferResolved.selectedOption as RecordNode).fields)
      ).toHaveLength(3)

      const approveResolved = field.resolve({ Approve: BigInt(5) })
      expect(approveResolved.selected).toBe("Approve")
      expect(approveResolved.selectedOption.type).toBe("number")
    })

    it("should detect Result variant (Ok/Err)", () => {
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
      expect(field.displayType).toBe("result") // Special result type

      const okResolved = field.resolve({ Ok: BigInt(1) })
      expect(okResolved.selected).toBe("Ok")
      expect(okResolved.selectedOption.type).toBe("number")
      expect(okResolved.selectedOption.displayType).toBe("string")

      const errResolved = field.resolve({ Err: "error" })
      expect(errResolved.selected).toBe("Err")
      expect(errResolved.selectedOption.type).toBe("text")
      expect(errResolved.selectedOption.displayType).toBe("string")
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
      const field = visitor.visitVariant(
        resultType,
        [
          [
            "Ok",
            IDL.Record({
              id: IDL.Nat,
              data: IDL.Vec(IDL.Nat8),
            }),
          ],
          [
            "Err",
            IDL.Variant({
              NotFound: IDL.Null,
              Unauthorized: IDL.Null,
              InvalidInput: IDL.Text,
            }),
          ],
        ],
        "result"
      )

      expect(field.displayType).toBe("result")

      const okResolved = field.resolve({
        Ok: { id: BigInt(1), data: new Uint8Array([1, 2, 3]) },
      })
      expect(okResolved.selected).toBe("Ok")
      expect(okResolved.selectedOption.type).toBe("record")

      const errResolved = field.resolve({ Err: { NotFound: null } })
      expect(errResolved.selected).toBe("Err")
      expect(errResolved.selectedOption.type).toBe("variant")
    })

    it("should not detect non-Result variant with Ok and other options", () => {
      const weirdType = IDL.Variant({
        Ok: IDL.Nat,
        Pending: IDL.Null,
        Processing: IDL.Text,
      })
      const field = visitor.visitVariant(
        weirdType,
        [
          ["Ok", IDL.Nat],
          ["Pending", IDL.Null],
          ["Processing", IDL.Text],
        ],
        "status"
      )

      expect(field.displayType).toBe("variant")
    })
  })

  describe("Tuple Types", () => {
    it("should handle simple tuple", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const field = visitor.visitTuple(tupleType, [IDL.Text, IDL.Nat], "pair")

      expect(field.type).toBe("tuple")
      expect(field.candidType).toBe("tuple")
      expect(field.displayType).toBe("array")
      expect(field.items).toHaveLength(2)
      expect(field.items[0].type).toBe("text")
      expect(field.items[1].type).toBe("number")
    })

    it("should handle tuple with mixed types", () => {
      const tupleType = IDL.Tuple(
        IDL.Principal,
        IDL.Nat64,
        IDL.Bool,
        IDL.Vec(IDL.Nat8)
      )
      const field = visitor.visitTuple(
        tupleType,
        [IDL.Principal, IDL.Nat64, IDL.Bool, IDL.Vec(IDL.Nat8)],
        "data"
      )

      expect(field.items).toHaveLength(4)
      expect(field.items[0].type).toBe("principal")
      expect(field.items[1].type).toBe("number")
      const numField = field.items[1]
      if (numField.type === "number") {
        expect(numField.displayType).toBe("string") // nat64 → string
      } else {
        throw new Error("Expected number field")
      }
      expect(field.items[2].type).toBe("boolean")
      expect(field.items[3].type).toBe("blob")
    })
  })

  describe("Optional Types", () => {
    it("should handle optional primitive", () => {
      const optType = IDL.Opt(IDL.Text)
      const field = visitor.visitOpt(optType, IDL.Text, "nickname")

      expect(field.type).toBe("optional")
      expect(field.candidType).toBe("opt")
      expect(field.displayType).toBe("nullable") // opt T → T | null
      // Validate inner by resolving a value
      const optResolved = field.resolve(["Bob"])
      expect((optResolved.value as ResolvedNode).type).toBe("text")
    })

    it("should handle optional record", () => {
      const recordInOpt = IDL.Record({
        name: IDL.Text,
        value: IDL.Nat,
      })
      const optType = IDL.Opt(recordInOpt)
      const field = visitor.visitOpt(optType, recordInOpt, "metadata")

      expect(field.type).toBe("optional")
      // Validate inner by resolving a record
      const metaResolved = field.resolve([{ name: "x", value: BigInt(1) }])
      expect((metaResolved.value as ResolvedNode).type).toBe("record")
    })

    it("should handle nested optional", () => {
      const innerOpt = IDL.Opt(IDL.Nat)
      const optType = IDL.Opt(innerOpt)
      const field = visitor.visitOpt(optType, innerOpt, "maybeNumber")

      expect(field.type).toBe("optional")
      // Validate nested optional by resolving a nested array
      const nestedResolved = field.resolve([[BigInt(1)]])
      expect((nestedResolved.value as ResolvedNode).type).toBe("optional")
      const innerResolved = nestedResolved.value as OptionalNode
      expect((innerResolved.value as ResolvedNode).type).toBe("number")
    })
  })

  describe("Vector Types", () => {
    it("should handle vector of primitives", () => {
      const vecType = IDL.Vec(IDL.Text)
      const field = visitor.visitVec(vecType, IDL.Text, "tags")

      expect(field.type).toBe("vector")
      expect(field.candidType).toBe("vec")
      expect(field.displayType).toBe("array")
      // Validate items by resolving
      const vecResolved = field.resolve(["a", "b", "c"]) as VectorNode
      expect(vecResolved.items).toHaveLength(3)
      expect(vecResolved.items[0].value).toBe("a")
    })

    it("should handle vector of records", () => {
      const recType = IDL.Record({
        id: IDL.Nat,
        name: IDL.Text,
      })
      const vecType = IDL.Vec(recType)
      const field = visitor.visitVec(vecType, recType, "items")

      expect(field.type).toBe("vector")
      // Validate by resolving
      const itemsResolved = field.resolve([
        { id: BigInt(1), name: "x" },
      ]) as VectorNode
      expect(itemsResolved.items[0].type).toBe("record")
    })

    it("should handle blob (vec nat8)", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "data")

      expect(field.type).toBe("blob")
      expect(field.candidType).toBe("blob")
      expect(field.displayType).toBe("string") // Blob → hex string
      // Validate by resolving a Uint8Array
      const blobResolved = field.resolve(
        new Uint8Array([0x12, 0x34, 0xab, 0xcd])
      ) as ResolvedNode<"blob">
      expect(blobResolved.value).toBe("1234abcd")
      expect(blobResolved.hash).toBeDefined()
      expect(blobResolved.hash).toHaveLength(64)
    })

    it("should handle large blob (> 512 bytes)", () => {
      const blobType = IDL.Vec(IDL.Nat8)
      const field = visitor.visitVec(blobType, IDL.Nat8, "large_data")

      expect(field.type).toBe("blob")
      // Create a large Uint8Array
      const largeData = new Uint8Array(513).fill(0xaa)
      const blobResolved = field.resolve(largeData) as ResolvedNode<"blob">

      expect(blobResolved.value).toBeInstanceOf(Uint8Array)
      expect(blobResolved.displayType).toBe("blob")
      expect(blobResolved.value).toHaveLength(513)
    })

    it("should handle nested vectors", () => {
      const innerVec = IDL.Vec(IDL.Nat)
      const nestedVecType = IDL.Vec(innerVec)
      const field = visitor.visitVec(nestedVecType, innerVec, "matrix")

      expect(field.type).toBe("vector")
      // Validate nested items via resolve
      const nestedResolved = field.resolve([[BigInt(1)]]) as VectorNode
      expect(nestedResolved.items[0].type).toBe("vector")
    })

    it("should handle vec of tuples (Map-like)", () => {
      const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
      const mapType = IDL.Vec(tupleType)
      const field = visitor.visitVec(
        mapType,
        tupleType,
        "metadata"
      ) as VectorNode

      expect(field.type).toBe("vector")
      // Validate by resolving a tuple item
      const vecTupleResolved = field.resolve([["a", BigInt(1)]])
      expect(vecTupleResolved.items[0].type).toBe("tuple")
      const item = vecTupleResolved.items[0] as TupleNode
      if (item.type === "tuple") {
        expect(item.items).toHaveLength(2)
      } else {
        throw new Error("Item field is not tuple")
      }
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
      expect(field.candidType).toBe("rec")
      expect(field.displayType).toBe("recursive")
      // Resolve to inspect inner schema
      const treeResolved = field.resolve({ Leaf: BigInt(1) }) as RecursiveNode
      expect(treeResolved.inner.type).toBe("variant")
      expect((treeResolved.inner as VariantNode).selected).toBe("Leaf")
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

      const listResolved = field.resolve({ Nil: null }) as RecursiveNode
      expect(listResolved.inner.type).toBe("variant")
      expect((listResolved.inner as VariantNode).selected).toBe("Nil")
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // Function Types
  // ════════════════════════════════════════════════════════════════════════

  describe("Function Types", () => {
    it("should handle query function with single return", () => {
      const funcType = IDL.Func([IDL.Principal], [IDL.Nat], ["query"])
      const meta = visitor.visitFunc(funcType, "get_balance")

      expect(meta.functionType).toBe("query")
      expect(meta.functionName).toBe("get_balance")
      expect(meta.returnCount).toBe(1)
      expect(meta.returns).toHaveLength(1)

      expect(meta.returns).toHaveLength(1)

      const returnField = meta.returns[0]
      if (returnField.type === "number") {
        expect(returnField.candidType).toBe("nat")
        expect(returnField.displayType).toBe("string")
      } else {
        throw new Error("Return field is not number")
      }
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
      const meta = visitor.visitFunc(funcType, "transfer")

      expect(meta.functionType).toBe("update")
      expect(meta.returnCount).toBe(1)

      const resultField = meta.returns[0]
      if (resultField.type === "variant") {
        expect(resultField.displayType).toBe("result")
      } else {
        throw new Error("Result field is not variant")
      }
    })

    it("should handle function with multiple returns", () => {
      const funcType = IDL.Func([], [IDL.Text, IDL.Nat, IDL.Bool], ["query"])
      const meta = visitor.visitFunc(funcType, "get_info")

      expect(meta.returnCount).toBe(3)
      expect(meta.returns).toHaveLength(3)
      expect(meta.returns[0].type).toBe("text")
      expect(meta.returns[1].type).toBe("number")
      expect(meta.returns[2].type).toBe("boolean")
    })

    it("should handle function with no returns", () => {
      const funcType = IDL.Func([IDL.Text], [], [])
      const meta = visitor.visitFunc(funcType, "log")

      expect(meta.returnCount).toBe(0)
      expect(meta.returns).toHaveLength(0)
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

      // Check get_balance
      const getBalanceMeta = serviceMeta["get_balance"]
      expect(getBalanceMeta.functionType).toBe("query")
      expect(getBalanceMeta.returnCount).toBe(1)
      expect(getBalanceMeta.returns[0].type).toBe("number")
      const balanceField = getBalanceMeta.returns[0]
      if (balanceField.type === "number") {
        expect(balanceField.displayType).toBe("string")
      } else {
        throw new Error("Balance field is not number")
      }

      // Check transfer
      const transferMeta = serviceMeta["transfer"]
      expect(transferMeta.functionType).toBe("update")
      expect(transferMeta.returnCount).toBe(1)
      // Check get_metadata
      const getMetadataMeta = serviceMeta["get_metadata"]
      expect(getMetadataMeta.returnCount).toBe(1)
      expect(getMetadataMeta.returns[0].type).toBe("vector")
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
      const meta = visitor.visitFunc(funcType, "icrc1_balance_of")

      expect(meta.functionType).toBe("query")
      expect(meta.returnCount).toBe(1)

      const balanceField = meta.returns[0]
      if (balanceField.type === "number") {
        expect(balanceField.candidType).toBe("nat")
        expect(balanceField.displayType).toBe("string")
      } else {
        throw new Error("Balance field is not number")
      }
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

      const field = visitor.visitVariant(
        TransferResult,
        [
          ["Ok", IDL.Nat], // Block index
          [
            "Err",
            IDL.Variant({
              BadFee: IDL.Record({ expected_fee: IDL.Nat }),
              BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
              InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
              TooOld: IDL.Null,
              CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
              Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
              TemporarilyUnavailable: IDL.Null,
              GenericError: IDL.Record({
                error_code: IDL.Nat,
                message: IDL.Text,
              }),
            }),
          ],
        ],
        "result"
      )

      expect(field.displayType).toBe("result")

      const okResolved = field.resolve({ Ok: BigInt(123) })
      if ((okResolved.selectedOption as ResolvedNode).type !== "number") {
        throw new Error("Ok field is not number")
      }
      expect((okResolved.selectedOption as ResolvedNode).candidType).toBe("nat")
      expect((okResolved.selectedOption as ResolvedNode).displayType).toBe(
        "string"
      )

      const errResolved = field.resolve({
        Err: { InsufficientFunds: { balance: BigInt(0) } },
      })
      const innerErr = errResolved.selectedOption as ResolvedNode
      expect(innerErr.type).toBe("variant")
      const insufficient = (innerErr as any).resolve({
        InsufficientFunds: { balance: BigInt(0) },
      })
      expect(insufficient.selected).toBe("InsufficientFunds")
      const generic = (innerErr as any).resolve({
        GenericError: { error_code: BigInt(1), message: "err" },
      })
      expect(generic.selected).toBe("GenericError")
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

      const field = visitor.visitRecord(
        CanisterStatusResponse,
        [
          [
            "status",
            IDL.Variant({
              running: IDL.Null,
              stopping: IDL.Null,
              stopped: IDL.Null,
            }),
          ],
          [
            "settings",
            IDL.Record({
              controllers: IDL.Vec(IDL.Principal),
              compute_allocation: IDL.Nat,
              memory_allocation: IDL.Nat,
              freezing_threshold: IDL.Nat,
            }),
          ],
          ["module_hash", IDL.Opt(IDL.Vec(IDL.Nat8))],
          ["memory_size", IDL.Nat],
          ["cycles", IDL.Nat],
          ["idle_cycles_burned_per_day", IDL.Nat],
        ],
        "status"
      )

      expect(field.type).toBe("record")

      // Check status variant
      const statusField = field.fields["status"] as VariantNode
      if (!statusField || statusField.type !== "variant") {
        throw new Error("Status field not found or not variant")
      }
      expect(statusField.type).toBe("variant")
      expect(statusField.displayType).toBe("variant")
      // Validate via resolving options
      const statusResolved = statusField.resolve({ running: null })
      expect(statusResolved.selected).toBe("running")

      // Check settings record
      const settingsField = field.fields["settings"] as RecordNode
      if (!settingsField || settingsField.type !== "record") {
        throw new Error("Settings field not found or not record")
      }
      expect(settingsField.type).toBe("record")
      expect(settingsField.displayType).toBe("object")

      const controllersField = settingsField.fields["controllers"] as VectorNode
      if (!controllersField || controllersField.type !== "vector") {
        throw new Error("Controllers field not found or not vector")
      }
      expect(controllersField.type).toBe("vector")
      // Validate item type via resolve
      const controllersResolved = controllersField.resolve(["aaaaa-aa"])
      expect(controllersResolved.items[0].type).toBe("principal")

      // Check cycles - should detect special format
      const cyclesField = field.fields["cycles"] as NumberNode
      if (!cyclesField || cyclesField.type !== "number") {
        throw new Error("Cycles field not found or not number")
      }
      expect(cyclesField.format).toBe("cycle")

      // Check module_hash - optional blob
      const moduleHashField = field.fields["module_hash"] as OptionalNode
      expect(moduleHashField.type).toBe("optional")
      // Validate via resolving a sample blob
      const moduleHashResolved = moduleHashField.resolve([new Uint8Array([1])])
      expect((moduleHashResolved.value as ResolvedNode).type).toBe("blob")
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

      const field = visitor.visitRecord(
        ProposalInfo,
        [
          ["id", IDL.Opt(IDL.Record({ id: IDL.Nat64 }))],
          ["status", IDL.Nat32],
          ["topic", IDL.Nat32],
          [
            "failure_reason",
            IDL.Opt(
              IDL.Record({ error_type: IDL.Nat32, error_message: IDL.Text })
            ),
          ],
          [
            "ballots",
            IDL.Vec(
              IDL.Tuple(
                IDL.Nat64,
                IDL.Record({
                  vote: IDL.Nat32,
                  voting_power: IDL.Nat64,
                })
              )
            ),
          ],
          ["proposal_timestamp_seconds", IDL.Nat64],
          ["reward_event_round", IDL.Nat64],
          ["deadline_timestamp_seconds", IDL.Opt(IDL.Nat64)],
          ["executed_timestamp_seconds", IDL.Nat64],
          ["reject_cost_e8s: IDL.Nat64", IDL.Nat64], // Fixed label in original
          ["proposer", IDL.Opt(IDL.Record({ id: IDL.Nat64 }))],
          ["reward_status", IDL.Nat32],
        ],
        "proposal"
      )

      expect(field.type).toBe("record")
      expect(Object.keys(field.fields)).toHaveLength(12)

      // Check timestamp field (note: the label pattern matching may not match "proposal_timestamp_seconds")
      const timestampField = field.fields["proposal_timestamp_seconds"]
      if (!timestampField || timestampField.type !== "number") {
        throw new Error("Timestamp field not found or not number")
      }
      expect(timestampField.type).toBe("number")
      expect(timestampField.displayType).toBe("string") // nat64 → string

      // Check ballots - vec of tuples
      const ballotsField = field.fields["ballots"]
      if (!ballotsField || ballotsField.type !== "vector") {
        throw new Error("Ballots field not found or not vector")
      }
      expect(ballotsField.type).toBe("vector")
      // Validate via resolve
      const ballotsResolved = ballotsField.resolve([
        [BigInt(1), { vote: 1, voting_power: BigInt(2) }],
      ]) as TupleNode
      expect(ballotsResolved.items).toHaveLength(1)
      const ballotTuple = ballotsResolved.items[0] as TupleNode
      if (ballotTuple.type !== "tuple") {
        throw new Error("Ballot item is not tuple")
      }
      expect(ballotTuple.items).toHaveLength(2)
      expect(ballotTuple.items[0].type).toBe("number") // nat64
      expect(ballotTuple.items[1].type).toBe("record") // ballot record
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
        const field = type.accept(visitor, "test")
        if (typeof field === "object" && "displayType" in field) {
          expect(field.displayType).toBe(expectedDisplay)
        } else {
          throw new Error("Expected as ResultNode")
        }
      })
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // resolve() Method Tests
  // ════════════════════════════════════════════════════════════════════════

  describe("resolve() Method", () => {
    describe("Primitive Types", () => {
      it("should resolve text field with value", () => {
        const field = visitor.visitText(IDL.Text, "message")
        const resolved = field.resolve("Hello World")
        expect(resolved.value).toBe("Hello World")
      })

      it("should resolve number field with value", () => {
        const field = visitor.visitNat(IDL.Nat, "amount")
        const resolved = field.resolve(BigInt(1000000))
        expect(resolved.value).toBe("1000000")
      })

      it("should resolve boolean field with value", () => {
        const field = visitor.visitBool(IDL.Bool, "active")
        const resolved = field.resolve(true)
        expect(resolved.value).toBe(true)
      })

      it("should resolve null field", () => {
        const field = visitor.visitNull(IDL.Null, "empty")
        const resolved = field.resolve(null)
        expect(resolved.value).toBe(null)
      })

      it("should resolve principal field with string value", () => {
        const field = visitor.visitPrincipal(IDL.Principal, "owner")
        const resolved = field.resolve("aaaaa-aa")
        expect(resolved.value).toBe("aaaaa-aa")
      })
    })

    describe("Record Type", () => {
      it("should resolve record with nested field values", () => {
        const recordType = IDL.Record({
          name: IDL.Text,
          age: IDL.Nat32,
          active: IDL.Bool,
        })
        const field = visitor.visitRecord(
          recordType,
          [
            ["name", IDL.Text],
            ["age", IDL.Nat32],
            ["active", IDL.Bool],
          ],
          "user"
        )

        const resolved = field.resolve({
          name: "Alice",
          age: 30,
          active: true,
        })

        expect(resolved.type).toBe(field.type)
        const value = resolved.fields as Record<string, ResolvedNode>
        expect(value["name"].value).toBe("Alice")
        expect(value["age"].value).toBe(30)
        expect(value["active"].value).toBe(true)
      })

      it("should handle null record value", () => {
        const recordType = IDL.Record({ name: IDL.Text })
        const field = visitor.visitRecord(
          recordType,
          [["name", IDL.Text]],
          "user"
        )

        expect(() => field.resolve(null)).toThrow(
          "Expected record for field user, but got null"
        )
      })
    })

    describe("Variant Type", () => {
      it("should resolve variant with active option", () => {
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

        const resolved = field.resolve({ Ok: "Success" })
        expect(resolved.type).toBe(field.type)
        expect(resolved.selected).toBe("Ok")
        const data = resolved.selectedOption as ResolvedNode
        expect(data.value).toBe("Success")
      })

      it("should resolve variant with Err option", () => {
        const variantType = IDL.Variant({
          Ok: IDL.Nat,
          Err: IDL.Text,
        })
        const field = visitor.visitVariant(
          variantType,
          [
            ["Ok", IDL.Nat],
            ["Err", IDL.Text],
          ],
          "result"
        )

        const resolved = field.resolve({ Err: "Something went wrong" })

        expect(resolved.selected).toBe("Err")
        const data = resolved.selectedOption as ResolvedNode
        expect(data.value).toBe("Something went wrong")
      })

      it("should handle null variant value", () => {
        const variantType = IDL.Variant({ A: IDL.Null, B: IDL.Text })
        const field = visitor.visitVariant(
          variantType,
          [
            ["A", IDL.Null],
            ["B", IDL.Text],
          ],
          "choice"
        )

        expect(() => field.resolve(null)).toThrow(
          "Expected variant for field choice, but got null"
        )
      })
    })

    describe("Tuple Type", () => {
      it("should resolve tuple with indexed values", () => {
        const tupleType = IDL.Tuple(IDL.Text, IDL.Nat, IDL.Bool)
        const field = visitor.visitTuple(
          tupleType,
          [IDL.Text, IDL.Nat, IDL.Bool],
          "data"
        )

        const resolved = field.resolve(["hello", 123n, true])

        expect(resolved.type).toBe(field.type)
        const value = resolved.items as ResolvedNode[]
        expect(value).toHaveLength(3)
        expect(value[0].value).toBe("hello")
        expect(value[1].value).toBe("123")
        expect(value[2].value).toBe(true)
      })

      it("should handle null tuple value", () => {
        const tupleType = IDL.Tuple(IDL.Text, IDL.Nat)
        const field = visitor.visitTuple(tupleType, [IDL.Text, IDL.Nat], "pair")

        expect(() => field.resolve(null)).toThrow(
          "Expected tuple for field pair, but got null"
        )
      })
    })

    describe("Optional Type", () => {
      it("should resolve optional with value", () => {
        const optType = IDL.Opt(IDL.Text)
        const field = visitor.visitOpt(optType, IDL.Text, "nickname")

        const resolved = field.resolve(["Bob"])

        expect(resolved.type).toBe(field.type)
        const inner = resolved.value as ResolvedNode
        expect(inner.value).toBe("Bob")
      })

      it("should resolve optional with null", () => {
        const optType = IDL.Opt(IDL.Text)
        const field = visitor.visitOpt(optType, IDL.Text, "nickname")

        const resolved = field.resolve(null)
        expect(resolved.value).toBe(null)
      })
    })

    describe("Vector Type", () => {
      it("should resolve vector with array of values", () => {
        const vecType = IDL.Vec(IDL.Text)
        const field = visitor.visitVec(vecType, IDL.Text, "tags")

        const resolved = field.resolve(["a", "b", "c"]) as VectorNode

        expect(resolved.type).toBe(field.type)
        const value = resolved.items as ResolvedNode[]
        expect(value).toHaveLength(3)
        expect(value[0].value).toBe("a")
        expect(value[1].value).toBe("b")
        expect(value[2].value).toBe("c")
      })

      it("should handle empty vector", () => {
        const vecType = IDL.Vec(IDL.Nat)
        const field = visitor.visitVec(vecType, IDL.Nat, "numbers")

        const resolved = field.resolve([]) as VectorNode

        expect(resolved.type).toBe(field.type)

        const value = resolved.items as ResolvedNode[]
        expect(value).toHaveLength(0)
      })

      it("should handle null vector value", () => {
        const vecType = IDL.Vec(IDL.Text)
        const field = visitor.visitVec(vecType, IDL.Text, "items")

        expect(() => field.resolve(null)).toThrow(
          "Expected vector for field items, but got null"
        )
      })
    })

    describe("Blob Type", () => {
      it("should resolve blob with hex string value", () => {
        const blobType = IDL.Vec(IDL.Nat8)
        const field = visitor.visitVec(blobType, IDL.Nat8, "data")

        const resolved = field.resolve(new Uint8Array([0x12, 0x34, 0xab, 0xcd]))

        expect(resolved.type).toBe(field.type)
        expect(resolved.value).toBe("1234abcd")
      })
    })

    describe("Recursive Type", () => {
      it("should resolve recursive type", () => {
        const Node = IDL.Rec()
        Node.fill(
          IDL.Record({
            value: IDL.Nat,
            children: IDL.Vec(Node),
          })
        )

        const field = visitor.visitRec(
          Node,
          // We can just pass null or the constructed type if available, but visitRec implementation calls extract which calls accept on the internal type.
          IDL.Record({
            value: IDL.Nat,
            children: IDL.Vec(Node),
          }),
          "tree"
        )

        const resolved = field.resolve({
          value: BigInt(42),
          children: [],
        })

        // The recursive type should delegate to its inner record type
        expect(resolved.type).toBe("recursive")
      })
    })

    describe("Nested Structures", () => {
      it("should resolve deeply nested structure", () => {
        const nestedType = IDL.Record({
          user: IDL.Record({
            profile: IDL.Record({
              name: IDL.Text,
              verified: IDL.Bool,
            }),
          }),
        })

        const field = visitor.visitRecord(
          nestedType,
          [
            [
              "user",
              IDL.Record({
                profile: IDL.Record({
                  name: IDL.Text,
                  verified: IDL.Bool,
                }),
              }),
            ],
          ],
          "data"
        )

        const resolved = field.resolve({
          user: {
            profile: {
              name: "Alice",
              verified: true,
            },
          },
        })

        const value = resolved.fields as Record<string, ResolvedNode>
        const userNode = value.user as RecordNode
        if (userNode.type !== "record") {
          throw new Error("User node is not a record")
        }
        const profileNode = userNode.fields["profile"] as RecordNode
        const profileFields = profileNode.fields as Record<string, ResolvedNode>
        expect(profileFields["name"].value).toBe("Alice")
        expect(profileFields["verified"].value).toBe(true)
      })
    })
  })

  // ════════════════════════════════════════════════════════════════════════
  // resolve() Method Tests
  // ════════════════════════════════════════════════════════════════════════

  describe("resolve() Method", () => {
    it("should generate metadata for single return value", () => {
      const service = IDL.Service({
        getName: IDL.Func([], [IDL.Text], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getName"]

      const result = methodMeta.resolve("Alice")

      expect(result.functionName).toBe("getName")
      expect(result.functionType).toBe("query")
      expect(result.results).toHaveLength(1)
      expect(result.results[0].value).toBe("Alice")
      expect(result.results[0].type).toBe("text")
    })

    it("should generate metadata for multiple return values", () => {
      const service = IDL.Service({
        getStats: IDL.Func([], [IDL.Nat, IDL.Nat, IDL.Text], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getStats"]

      const result = methodMeta.resolve([BigInt(100), BigInt(200), "active"])

      expect(result.results).toHaveLength(3)
      expect(result.results[0].value).toBe("100")
      expect(result.results[0].type).toBe("number")
      expect(result.results[1].value).toBe("200")
      expect(result.results[2].value).toBe("active")
      expect(result.results[2].type).toBe("text")
    })

    it("should generate metadata for record return value", () => {
      const service = IDL.Service({
        getUser: IDL.Func(
          [],
          [IDL.Record({ name: IDL.Text, balance: IDL.Nat })],
          ["query"]
        ),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getUser"]

      const result = methodMeta.resolve({
        name: "Bob",
        balance: BigInt(1000),
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].type).toBe("record")

      const recordNode = result.results[0] as RecordNode
      if (recordNode.type !== "record") {
        throw new Error("Expected record node")
      }
      const val = recordNode.fields as Record<string, ResolvedNode>
      expect(val.name.value).toBe("Bob")
      expect(val.balance.value).toBe("1000")
    })

    it("should generate metadata for Result variant", () => {
      const service = IDL.Service({
        transfer: IDL.Func(
          [],
          [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
          []
        ),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["transfer"]

      // Test Ok case
      const okResult = methodMeta.resolve({ Ok: BigInt(12345) })
      expect(okResult.results[0].type).toBe("variant")
      if (okResult.results[0].type === "variant") {
        expect(okResult.results[0].displayType).toBe("result")
      } else {
        throw new Error("Expected variant field")
      }

      const okValue = okResult.results[0] as ResolvedNode
      expect((okValue as any).selected).toBe("Ok")
      expect(((okValue as any).selectedOption as ResolvedNode).value).toBe(
        "12345"
      )

      // Test Err case
      const errResult = methodMeta.resolve({
        Err: "Insufficient funds",
      })
      const errValue = errResult.results[0] as ResolvedNode
      expect((errValue as any).selected).toBe("Err")
      expect(((errValue as any).selectedOption as ResolvedNode).value).toBe(
        "Insufficient funds"
      )
    })

    it("should generate metadata for optional return value", () => {
      const service = IDL.Service({
        findUser: IDL.Func([], [IDL.Opt(IDL.Text)], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["findUser"]

      // Test with value - Optional is [value]
      const foundResult = methodMeta.resolve(["Alice"])
      expect(foundResult.results[0].type).toBe("optional")
      const foundInner = foundResult.results[0] as OptionalNode
      expect(foundInner.value?.value).toBe("Alice")

      // Test with null - optional is []
      const notFoundResult = methodMeta.resolve([])
      expect(notFoundResult.results[0].value).toBe(null)
    })

    it("should generate metadata for vector return value", () => {
      const service = IDL.Service({
        getItems: IDL.Func([], [IDL.Vec(IDL.Text)], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getItems"]

      const result = methodMeta.resolve(["item1", "item2", "item3"])

      expect(result.results[0].type).toBe("vector")
      const vecNode = result.results[0] as ResolvedNode
      const vecItems = (vecNode as any).items as ResolvedNode[]
      expect(vecItems).toHaveLength(3)
      expect(vecItems[0].value).toBe("item1")
      expect(vecItems[1].value).toBe("item2")
      expect(vecItems[2].value).toBe("item3")
    })

    it("should generate metadata for update function", () => {
      const service = IDL.Service({
        setName: IDL.Func([IDL.Text], [IDL.Bool], []),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["setName"]

      expect(methodMeta.functionType).toBe("update")

      const rawData = [true]
      const result = methodMeta.resolve(rawData[0])

      expect(result.functionType).toBe("update")
      expect(result.functionName).toBe("setName")
      expect(result.results[0].value).toBe(true)
      expect(result.results[0].raw).toBe(true)
    })

    it("should generate metadata for complex ICRC-1 like response", () => {
      const Account = IDL.Record({
        owner: IDL.Principal,
        subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
      })

      const TransferResult = IDL.Variant({
        Ok: IDL.Nat,
        Err: IDL.Variant({
          InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
          InvalidAccount: IDL.Null,
          TooOld: IDL.Null,
        }),
      })

      const service = IDL.Service({
        icrc1_transfer: IDL.Func([], [TransferResult], []),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["icrc1_transfer"]

      // Test successful transfer
      const successResult = methodMeta.resolve({ Ok: BigInt(1000) })
      console.log(
        "🚀 ~ result:",
        JSON.stringify(
          successResult,
          (_, v) => (typeof v === "bigint" ? `${v}n` : v),
          2
        )
      )

      const successValue = successResult.results[0] as ResolvedNode
      expect((successValue as any).selected).toBe("Ok")
      expect(((successValue as any).selectedOption as ResolvedNode).value).toBe(
        "1000"
      )

      // Test error case
      const errorResult = methodMeta.resolve({
        Err: { InsufficientFunds: { balance: BigInt(50) } },
      })
      const errorValue = errorResult.results[0] as ResolvedNode
      expect((errorValue as any).selected).toBe("Err")

      const val = (errorValue as any).selectedOption as ResolvedNode
      if (typeof val !== "object" || val === null || !("selected" in val)) {
        throw new Error("Expected variant value object")
      }
      expect((val as any).selected).toBe("InsufficientFunds")
    })

    it("should handle empty return", () => {
      const service = IDL.Service({
        doSomething: IDL.Func([], [], []),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["doSomething"]

      expect(methodMeta.returnCount).toBe(0)

      const result = methodMeta.resolve([])
      expect(result.results).toHaveLength(0)
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // resolve() Method Tests
  // ════════════════════════════════════════════════════════════════════════════

  describe("resolve() Method", () => {
    it("should include both raw and display values for single return", () => {
      const service = IDL.Service({
        getBalance: IDL.Func([], [IDL.Nat], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getBalance"]

      // Simulate raw BigInt and display string
      const rawData = [BigInt(1000000)]

      const result = methodMeta.resolve(rawData[0])

      expect(result.functionName).toBe("getBalance")
      expect(result.functionType).toBe("query")
      expect(result.results).toHaveLength(1)
      expect(result.results[0].raw).toBe(BigInt(1000000))
      expect(result.results[0].value).toBe("1000000")
      expect(result.results[0].raw).toBe(BigInt(1000000))
      expect(result.results[0].type).toBe("number")
    })

    it("should include both raw and display values for multiple returns", () => {
      const service = IDL.Service({
        getStats: IDL.Func([], [IDL.Nat64, IDL.Text, IDL.Bool], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getStats"]

      // Use BigInt with string to safe safe integer
      const rawData = [BigInt("9007199254740993"), "active", true]

      const result = methodMeta.resolve(rawData)

      expect(result.results).toHaveLength(3)

      // nat64 → string display, BigInt raw
      expect(result.results[0].value).toBe("9007199254740993")
      expect(result.results[0].raw).toBe(BigInt("9007199254740993"))
      expect(result.results[0].candidType).toBe("nat64")

      // text → same for both
      expect(result.results[1].value).toBe("active")
      expect(result.results[1].raw).toBe("active")

      // bool → same for both
      expect(result.results[2].value).toBe(true)
      expect(result.results[2].raw).toBe(true)
    })

    it("should handle record with raw and display values", () => {
      const service = IDL.Service({
        getUser: IDL.Func(
          [],
          [IDL.Record({ name: IDL.Text, balance: IDL.Nat })],
          ["query"]
        ),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getUser"]

      const rawData = [{ name: "Alice", balance: BigInt(500) }]
      const result = methodMeta.resolve(rawData[0])

      expect(result.results[0].raw).toEqual({
        name: "Alice",
        balance: BigInt(500),
      })

      const recordNode = result.results[0] as RecordNode
      if (recordNode.type !== "record") {
        throw new Error("Expected record node")
      }
      const val = recordNode.fields as Record<string, ResolvedNode>
      expect(val.name.value).toBe("Alice")
      expect(val.balance.value).toBe("500")
    })

    it("should handle Result variant with raw and display values", () => {
      const service = IDL.Service({
        transfer: IDL.Func(
          [],
          [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
          []
        ),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["transfer"]

      // Test Ok case with raw BigInt
      const rawData = [{ Ok: BigInt(12345) }]

      const result = methodMeta.resolve(rawData[0])

      expect(result.results[0].raw).toEqual({ Ok: BigInt(12345) })

      const variantValue = result.results[0] as ResolvedNode
      expect((variantValue as any).selected).toBe("Ok")
      const innerVal = (variantValue as any).selectedOption as ResolvedNode
      expect(innerVal.value).toBe("12345")
    })

    it("should preserve raw Principal object", () => {
      const { Principal } = require("@icp-sdk/core/principal")

      const service = IDL.Service({
        getOwner: IDL.Func([], [IDL.Principal], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getOwner"]

      const principal = Principal.fromText("aaaaa-aa")
      const rawData = [principal]

      const result = methodMeta.resolve(rawData[0])

      expect(result.results[0].value).toBe("aaaaa-aa")
      expect(result.results[0].raw).toBe(principal)
      expect(result.results[0].type).toBe("principal")
    })

    it("should handle vector with raw and display values", () => {
      const service = IDL.Service({
        getAmounts: IDL.Func([], [IDL.Vec(IDL.Nat)], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["getAmounts"]

      const rawData = [[BigInt(100), BigInt(200), BigInt(300)]]

      const result = methodMeta.resolve(rawData[0])

      const vecNode = result.results[0] as ResolvedNode
      const vecValue = (vecNode as any).items as ResolvedNode[]
      expect(vecValue).toHaveLength(3)
      expect(vecValue[0].value).toBe("100")
      expect(vecValue[1].value).toBe("200")
      expect(vecValue[2].value).toBe("300")
    })

    it("should handle optional with raw and display values", () => {
      const service = IDL.Service({
        findBalance: IDL.Func([], [IDL.Opt(IDL.Nat)], ["query"]),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["findBalance"]

      // Test with value - Optional is [value]
      const rawDataWithValue = [[BigInt(999)]]

      const resultWithValue = methodMeta.resolve(rawDataWithValue[0])

      expect(resultWithValue.results[0].raw).toEqual([BigInt(999)])
      const innerValue = resultWithValue.results[0].value
      if (
        typeof innerValue !== "object" ||
        innerValue === null ||
        !("value" in innerValue)
      ) {
        throw new Error("Expected optional value object")
      }
      expect((innerValue as any).value).toBe("999")

      // Test with null - Optional is []
      const rawDataNull = [[]]

      const resultNull = methodMeta.resolve(rawDataNull[0])
      expect(resultNull.results[0].raw).toEqual([])
      expect(resultNull.results[0].value).toBe(null)
    })

    it("should handle empty return", () => {
      const service = IDL.Service({
        doNothing: IDL.Func([], [], []),
      })

      const serviceMeta = visitor.visitService(
        service as unknown as IDL.ServiceClass
      )
      const methodMeta = serviceMeta["doNothing"]

      const result = methodMeta.resolve([])

      expect(result.results).toHaveLength(0)
    })
  })
})

describe("ResultFieldVisitor Reproduction - User reported issue", () => {
  const visitor = new ResultFieldVisitor()

  it("should handle record data provided as an array (tuple-like) even if IDL has names", () => {
    const Rule = IDL.Variant({
      Quorum: IDL.Record({
        min_approved: IDL.Nat,
        approvers: IDL.Variant({ Group: IDL.Vec(IDL.Principal) }),
      }),
    })

    const NamedRule = IDL.Record({
      description: IDL.Opt(IDL.Text),
      id: IDL.Text,
      name: IDL.Text,
      rule: Rule,
    })

    const field = visitor.visitRecord(
      NamedRule,
      [
        ["description", IDL.Opt(IDL.Text)],
        ["id", IDL.Text],
        ["name", IDL.Text],
        ["rule", Rule],
      ],
      "NamedRule"
    )

    // Simulate lib-agent returning an array for a named record
    const arrayData = [
      [], // description (empty opt)
      "1253ec41-ef1d-4317-bb82-2366fc34f37c", // id
      "Admin approval", // name
      { Quorum: { min_approved: BigInt(1), approvers: { Group: [] } } }, // rule
    ]

    // Before the fix, this would throw because arrayData["rule"] is undefined
    const resolved = field.resolve(arrayData)

    expect(resolved.fields.id.value).toBe(
      "1253ec41-ef1d-4317-bb82-2366fc34f37c"
    )
    expect(resolved.fields.name.value).toBe("Admin approval")

    const ruleNode = resolved.fields.rule as VariantNode
    expect(ruleNode.selected).toBe("Quorum")
  })

  it("should handle already transformed variant data with _type", () => {
    const Rule = IDL.Variant({
      Quorum: IDL.Text,
    })

    const field = visitor.visitVariant(Rule, [["Quorum", IDL.Text]], "Rule")

    // Data transformed by DisplayCodecVisitor
    const transformedData = {
      _type: "Quorum",
      Quorum: "some text",
    }

    // Before the fix, this would throw because transformedData["Quorum"] is there but
    // Object.keys(transformedData)[0] is "_type"
    const resolved = field.resolve(transformedData)

    expect(resolved.selected).toBe("Quorum")
    expect(resolved.selectedOption.value).toBe("some text")
  })

  it("should handle already transformed optional data (unwrapped)", () => {
    const OptText = IDL.Opt(IDL.Text)
    const field = visitor.visitOpt(OptText, IDL.Text, "maybeText")

    // Raw format is [value]
    expect(field.resolve(["hello"]).value?.value).toBe("hello")
    expect(field.resolve([]).value).toBeNull()

    // Transformed format is just the value
    expect(field.resolve("hello").value?.value).toBe("hello")
    expect(field.resolve(null).value).toBeNull()
    expect(field.resolve(undefined).value).toBeNull()
  })

  it("should provide a better error message when an option is missing", () => {
    const MyVariant = IDL.Variant({ A: IDL.Null, B: IDL.Null })
    const field = visitor.visitVariant(
      MyVariant,
      [
        ["A", IDL.Null],
        ["B", IDL.Null],
      ],
      "MyVariant"
    )

    expect(() => field.resolve({ C: null })).toThrow(
      /Option C not found in variant MyVariant. Available options: A, B/
    )
  })

  describe("Recursive types", () => {
    it("should handle recursive variant with transformed data", () => {
      const Rule = IDL.Rec()
      const RuleType = IDL.Variant({
        Quorum: IDL.Record({
          min_approved: IDL.Nat,
        }),
        Nested: Rule,
      })
      Rule.fill(RuleType)

      const field = visitor.visitRec(Rule, RuleType, "rule")

      // Transformed data (using _type)
      const transformedData = {
        _type: "Quorum",
        Quorum: {
          min_approved: "1",
        },
      }

      // This should work because Rule.resolve calls Variant.resolve
      const resolved = field.resolve(transformedData) as RecursiveNode
      const variantNode = resolved.inner as VariantNode

      expect(variantNode.selected).toBe("Quorum")
      expect(variantNode.selectedOption.type).toBe("record")
    })

    it("should handle deeply nested recursive variant with transformed data", () => {
      const Rule = IDL.Rec()
      const RuleType = IDL.Variant({
        Quorum: IDL.Record({
          min_approved: IDL.Nat,
        }),
        Nested: Rule,
      })
      Rule.fill(RuleType)

      const field = visitor.visitRec(Rule, RuleType, "rule")

      const transformedData = {
        _type: "Nested",
        Nested: {
          _type: "Quorum",
          Quorum: {
            min_approved: "2",
          },
        },
      }

      const resolved = field.resolve(transformedData) as RecursiveNode
      const variantNode = resolved.inner as VariantNode
      expect(variantNode.selected).toBe("Nested")

      const nestedResolved = variantNode.selectedOption as RecursiveNode
      const innerVariant = nestedResolved.inner as VariantNode
      expect(innerVariant.selected).toBe("Quorum")
    })
  })
})
