import { ClientManager } from "@ic-reactor/core"
import { ActorMethod, HttpAgent } from "@icp-sdk/core/agent"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor"
import type {
  MethodArgumentsMeta,
  NumberArgumentField,
  OptionalArgumentField,
  PrincipalArgumentField,
  RecordArgumentField,
  VariantArgumentField,
} from "../../src/visitor/arguments"
import type {
  MethodResultMeta,
  NumberResultField,
  OptionalResultField,
  RecordResultField,
  TextResultField,
  VariantResultField,
  VectorResultField,
} from "../../src/visitor/returns"

// ════════════════════════════════════════════════════════════════════════════
// Test Actor Interface
// ════════════════════════════════════════════════════════════════════════════

interface TestActor {
  icrc1_name: ActorMethod<[], string>
  icrc1_symbol: ActorMethod<[], string>
  icrc1_decimals: ActorMethod<[], number>
  icrc1_fee: ActorMethod<[], bigint>
  icrc1_total_supply: ActorMethod<[], bigint>
  icrc1_balance_of: ActorMethod<
    [{ owner: { toString(): string }; subaccount: [] | [Uint8Array] }],
    bigint
  >
  icrc1_transfer: ActorMethod<
    [
      {
        to: { owner: { toString(): string }; subaccount: [] | [Uint8Array] }
        amount: bigint
        fee: [] | [bigint]
        memo: [] | [Uint8Array]
        created_at_time: [] | [bigint]
      },
    ],
    { Ok: bigint } | { Err: unknown }
  >
}

// ════════════════════════════════════════════════════════════════════════════
// Mock Client Manager
// ════════════════════════════════════════════════════════════════════════════

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

// ════════════════════════════════════════════════════════════════════════════
// Test Candid Definitions
// ════════════════════════════════════════════════════════════════════════════

const SIMPLE_SERVICE_CANDID = `
  service : {
    greet : (text) -> (text) query;
    get_count : () -> (nat) query;
    set_count : (nat) -> ();
  }
`

const ICRC1_SERVICE_CANDID = `
  type Account = record {
    owner : principal;
    subaccount : opt blob;
  };

  type TransferArg = record {
    to : Account;
    amount : nat;
    fee : opt nat;
    memo : opt blob;
    created_at_time : opt nat64;
  };

  type TransferError = variant {
    BadFee : record { expected_fee : nat };
    BadBurn : record { min_burn_amount : nat };
    InsufficientFunds : record { balance : nat };
    TooOld;
    CreatedInFuture : record { ledger_time : nat64 };
    Duplicate : record { duplicate_of : nat };
    TemporarilyUnavailable;
    GenericError : record { error_code : nat; message : text };
  };

  type TransferResult = variant {
    Ok : nat;
    Err : TransferError;
  };

  service : {
    icrc1_name : () -> (text) query;
    icrc1_symbol : () -> (text) query;
    icrc1_decimals : () -> (nat8) query;
    icrc1_fee : () -> (nat) query;
    icrc1_total_supply : () -> (nat) query;
    icrc1_balance_of : (Account) -> (nat) query;
    icrc1_transfer : (TransferArg) -> (TransferResult);
    icrc1_metadata : () -> (vec record { text; variant { Nat : nat; Int : int; Text : text; Blob : blob } }) query;
  }
`

const COMPLEX_SERVICE_CANDID = `
  type Status = variant {
    Active;
    Inactive;
    Pending : nat64;
  };

  type UserData = record {
    id : nat64;
    name : text;
    email : opt text;
    status : Status;
    created_at : nat64;
    tags : vec text;
    metadata : opt record {
      version : nat32;
      data : blob;
    };
  };

  type Result = variant {
    Ok : UserData;
    Err : text;
  };

  service : {
    get_user : (nat64) -> (opt UserData) query;
    create_user : (text, opt text) -> (Result);
    update_status : (nat64, Status) -> (Result);
    list_users : (opt nat32, opt nat32) -> (vec UserData) query;
    delete_user : (nat64) -> (variant { Ok; Err : text });
  }
`

// ════════════════════════════════════════════════════════════════════════════
// Unit Tests
// ════════════════════════════════════════════════════════════════════════════

describe("MetadataDisplayReactor", () => {
  let clientManager: ClientManager

  beforeEach(() => {
    clientManager = createMockClientManager()
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Initialization Tests
  // ══════════════════════════════════════════════════════════════════════════

  describe("Initialization", () => {
    it("should initialize with simple service Candid", async () => {
      const reactor = new MetadataDisplayReactor({
        name: "simple",
        canisterId: "aaaaa-aa",
        clientManager,
        candid: SIMPLE_SERVICE_CANDID,
      })

      await reactor.initialize()

      expect(reactor.getMethodNames()).toContain("greet")
      expect(reactor.getMethodNames()).toContain("get_count")
      expect(reactor.getMethodNames()).toContain("set_count")
      expect(reactor.getMethodNames()).toHaveLength(3)
    })

    it("should initialize with ICRC-1 service Candid", async () => {
      const reactor = new MetadataDisplayReactor({
        name: "icrc1",
        canisterId: "aaaaa-aa",
        clientManager,
        candid: ICRC1_SERVICE_CANDID,
      })

      await reactor.initialize()

      const methodNames = reactor.getMethodNames()
      expect(methodNames).toContain("icrc1_name")
      expect(methodNames).toContain("icrc1_symbol")
      expect(methodNames).toContain("icrc1_decimals")
      expect(methodNames).toContain("icrc1_fee")
      expect(methodNames).toContain("icrc1_total_supply")
      expect(methodNames).toContain("icrc1_balance_of")
      expect(methodNames).toContain("icrc1_transfer")
      expect(methodNames).toContain("icrc1_metadata")
    })

    it("should initialize with complex service Candid", async () => {
      const reactor = new MetadataDisplayReactor({
        name: "complex",
        canisterId: "aaaaa-aa",
        clientManager,
        candid: COMPLEX_SERVICE_CANDID,
      })

      await reactor.initialize()

      const methodNames = reactor.getMethodNames()
      expect(methodNames).toContain("get_user")
      expect(methodNames).toContain("create_user")
      expect(methodNames).toContain("update_status")
      expect(methodNames).toContain("list_users")
      expect(methodNames).toContain("delete_user")
    })

    it("should have empty metadata before initialization", () => {
      const reactor = new MetadataDisplayReactor({
        name: "empty",
        canisterId: "aaaaa-aa",
        clientManager,
        candid: SIMPLE_SERVICE_CANDID,
      })

      expect(reactor.getAllArgumentMeta()).toBeNull()
      expect(reactor.getAllResultMeta()).toBeNull()
    })

    it("should have metadata after initialization", async () => {
      const reactor = new MetadataDisplayReactor({
        name: "test",
        canisterId: "aaaaa-aa",
        clientManager,
        candid: SIMPLE_SERVICE_CANDID,
      })

      await reactor.initialize()

      expect(reactor.getAllArgumentMeta()).not.toBeNull()
      expect(reactor.getAllResultMeta()).not.toBeNull()
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Argument Metadata Tests
  // ══════════════════════════════════════════════════════════════════════════

  describe("Argument Metadata", () => {
    let reactor: MetadataDisplayReactor

    beforeAll(async () => {
      reactor = new MetadataDisplayReactor({
        name: "icrc1",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: ICRC1_SERVICE_CANDID,
      })
      await reactor.initialize()
    })

    it("should generate argument metadata for no-arg query", () => {
      const meta = reactor.getArgumentMeta(
        "icrc1_name"
      ) as MethodArgumentsMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("query")
      expect(meta.functionName).toBe("icrc1_name")
      expect(meta.fields).toHaveLength(0)
      expect(meta.defaultValues).toEqual([])
    })

    it("should generate argument metadata for icrc1_balance_of", () => {
      const meta = reactor.getArgumentMeta(
        "icrc1_balance_of"
      ) as MethodArgumentsMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("query")
      expect(meta.fields).toHaveLength(1)

      // First argument should be Account record
      const accountField = meta.fields[0] as RecordArgumentField
      expect(accountField.type).toBe("record")
      expect(accountField.fields).toHaveLength(2)

      // Check owner field
      const ownerField = accountField.fields.find(
        (f) => f.label === "owner"
      ) as PrincipalArgumentField
      expect(ownerField.type).toBe("principal")
      expect(ownerField.defaultValue).toBe("")

      // Check subaccount field
      const subaccountField = accountField.fields.find(
        (f) => f.label === "subaccount"
      ) as OptionalArgumentField
      expect(subaccountField.type).toBe("optional")
      expect(subaccountField.innerField.type).toBe("blob")
    })

    it("should generate argument metadata for icrc1_transfer", () => {
      const meta = reactor.getArgumentMeta(
        "icrc1_transfer"
      ) as MethodArgumentsMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("update")
      expect(meta.fields).toHaveLength(1)

      // First argument should be TransferArg record
      const transferArgField = meta.fields[0] as RecordArgumentField
      expect(transferArgField.type).toBe("record")
      expect(transferArgField.fields.length).toBeGreaterThanOrEqual(5)

      // Check 'to' field (Account)
      const toField = transferArgField.fields.find(
        (f) => f.label === "to"
      ) as RecordArgumentField
      expect(toField.type).toBe("record")
      expect(toField.fields).toHaveLength(2)

      // Check 'amount' field
      const amountField = transferArgField.fields.find(
        (f) => f.label === "amount"
      ) as NumberArgumentField
      expect(amountField.type).toBe("number")
      expect(amountField.candidType).toBe("nat")
      expect(amountField.defaultValue).toBe("")

      // Check 'fee' field (optional)
      const feeField = transferArgField.fields.find(
        (f) => f.label === "fee"
      ) as OptionalArgumentField
      expect(feeField.type).toBe("optional")
      expect(feeField.innerField.type).toBe("number")

      // Check 'memo' field (optional blob)
      const memoField = transferArgField.fields.find(
        (f) => f.label === "memo"
      ) as OptionalArgumentField
      expect(memoField.type).toBe("optional")
      expect(memoField.innerField.type).toBe("blob")

      // Check 'created_at_time' field (optional nat64)
      const createdAtField = transferArgField.fields.find(
        (f) => f.label === "created_at_time"
      ) as OptionalArgumentField
      expect(createdAtField.type).toBe("optional")
      expect(createdAtField.innerField.type).toBe("number")
    })

    it("should generate default values for transfer", () => {
      const meta = reactor.getArgumentMeta(
        "icrc1_transfer"
      ) as MethodArgumentsMeta<unknown>

      expect(meta.defaultValues).toHaveLength(1)
      expect(meta.defaultValues[0]).toBeDefined()

      const defaultTransferArg = meta.defaultValues[0] as Record<
        string,
        unknown
      >
      expect(defaultTransferArg).toHaveProperty("to")
      expect(defaultTransferArg).toHaveProperty("amount")
      expect(defaultTransferArg).toHaveProperty("fee")
      expect(defaultTransferArg).toHaveProperty("memo")
    })

    it("should return undefined for non-existent method", () => {
      const meta = reactor.getArgumentMeta("non_existent_method")
      expect(meta).toBeUndefined()
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Result Metadata Tests
  // ══════════════════════════════════════════════════════════════════════════

  describe("Result Metadata", () => {
    let reactor: MetadataDisplayReactor

    beforeAll(async () => {
      reactor = new MetadataDisplayReactor({
        name: "icrc1",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: ICRC1_SERVICE_CANDID,
      })
      await reactor.initialize()
    })

    it("should generate result metadata for icrc1_name", () => {
      const meta = reactor.getResultMeta(
        "icrc1_name"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("query")
      expect(meta.returnCount).toBe(1)
      expect(meta.resultFields).toHaveLength(1)

      const nameField = meta.resultFields[0] as TextResultField
      expect(nameField.type).toBe("text")
      expect(nameField.displayType).toBe("string")
    })

    it("should generate result metadata for icrc1_decimals", () => {
      const meta = reactor.getResultMeta(
        "icrc1_decimals"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.resultFields).toHaveLength(1)

      const decimalsField = meta.resultFields[0] as NumberResultField
      expect(decimalsField.type).toBe("number")
      expect(decimalsField.candidType).toBe("nat8")
      expect(decimalsField.displayType).toBe("number") // nat8 stays as number
    })

    it("should generate result metadata for icrc1_fee", () => {
      const meta = reactor.getResultMeta(
        "icrc1_fee"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.resultFields).toHaveLength(1)

      const feeField = meta.resultFields[0] as NumberResultField
      expect(feeField.type).toBe("number")
      expect(feeField.candidType).toBe("nat")
      expect(feeField.displayType).toBe("string") // nat → string
    })

    it("should generate result metadata for icrc1_balance_of", () => {
      const meta = reactor.getResultMeta(
        "icrc1_balance_of"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("query")
      expect(meta.resultFields).toHaveLength(1)

      const balanceField = meta.resultFields[0] as NumberResultField
      expect(balanceField.type).toBe("number")
      expect(balanceField.candidType).toBe("nat")
      expect(balanceField.displayType).toBe("string") // BigInt → string
    })

    it("should generate result metadata for icrc1_transfer (Result variant)", () => {
      const meta = reactor.getResultMeta(
        "icrc1_transfer"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("update")
      expect(meta.resultFields).toHaveLength(1)

      const resultField = meta.resultFields[0] as VariantResultField
      expect(resultField.type).toBe("variant")
      expect(resultField.isResultType).toBe(true)
      expect(resultField.displayType).toBe("result")
      expect(resultField.options).toContain("Ok")
      expect(resultField.options).toContain("Err")

      // Check Ok field
      const okField = resultField.optionFields.find(
        (f) => f.label === "Ok"
      ) as NumberResultField
      expect(okField.type).toBe("number")
      expect(okField.candidType).toBe("nat")
      expect(okField.displayType).toBe("string")

      // Check Err field (nested variant)
      const errField = resultField.optionFields.find(
        (f) => f.label === "Err"
      ) as VariantResultField
      expect(errField.type).toBe("variant")
      expect(errField.options).toContain("InsufficientFunds")
      expect(errField.options).toContain("GenericError")
    })

    it("should generate result metadata for icrc1_metadata", () => {
      const meta = reactor.getResultMeta(
        "icrc1_metadata"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.resultFields).toHaveLength(1)

      const metadataField = meta.resultFields[0] as VectorResultField
      expect(metadataField.type).toBe("vector")
      expect(metadataField.displayType).toBe("array")

      // Item is a tuple (text, variant)
      // Since Vec<Tuple> is represented differently, we just check it's a valid structure
      expect(metadataField.itemField).toBeDefined()
    })

    it("should return undefined for non-existent method", () => {
      const meta = reactor.getResultMeta("non_existent_method")
      expect(meta).toBeUndefined()
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Complex Service Metadata Tests
  // ══════════════════════════════════════════════════════════════════════════

  describe("Complex Service Metadata", () => {
    let reactor: MetadataDisplayReactor

    beforeAll(async () => {
      reactor = new MetadataDisplayReactor({
        name: "complex",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: COMPLEX_SERVICE_CANDID,
      })
      await reactor.initialize()
    })

    it("should handle variant argument (update_status)", () => {
      const meta = reactor.getArgumentMeta(
        "update_status"
      ) as MethodArgumentsMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.fields).toHaveLength(2)

      // First arg is nat64 (user ID)
      const idField = meta.fields[0] as NumberArgumentField
      expect(idField.type).toBe("number")
      expect(idField.candidType).toBe("nat64")

      // Second arg is Status variant
      const statusField = meta.fields[1] as VariantArgumentField
      expect(statusField.type).toBe("variant")
      expect(statusField.options).toContain("Active")
      expect(statusField.options).toContain("Inactive")
      expect(statusField.options).toContain("Pending")

      // Pending has a nat64 payload
      const pendingField = statusField.fields.find((f) => f.label === "Pending")
      expect(pendingField?.type).toBe("number")
    })

    it("should handle optional record result (get_user)", () => {
      const meta = reactor.getResultMeta(
        "get_user"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.functionType).toBe("query")
      expect(meta.resultFields).toHaveLength(1)

      const optionalField = meta.resultFields[0] as OptionalResultField
      expect(optionalField.type).toBe("optional")
      expect(optionalField.displayType).toBe("nullable")

      const innerRecord = optionalField.innerField as RecordResultField
      expect(innerRecord.type).toBe("record")
      expect(innerRecord.fields.length).toBeGreaterThanOrEqual(5)

      // Check for expected fields
      const labels = innerRecord.fields.map((f) => f.label)
      expect(labels).toContain("id")
      expect(labels).toContain("name")
      expect(labels).toContain("email")
      expect(labels).toContain("status")
      expect(labels).toContain("created_at")
      expect(labels).toContain("tags")
    })

    it("should handle vec result (list_users)", () => {
      const meta = reactor.getResultMeta(
        "list_users"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.resultFields).toHaveLength(1)

      const vecField = meta.resultFields[0] as VectorResultField
      expect(vecField.type).toBe("vector")
      expect(vecField.displayType).toBe("array")

      // Item should be UserData record
      const itemField = vecField.itemField as RecordResultField
      expect(itemField.type).toBe("record")
    })

    it("should handle simple Ok/Err variant without payload (delete_user)", () => {
      const meta = reactor.getResultMeta(
        "delete_user"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.resultFields).toHaveLength(1)

      const resultField = meta.resultFields[0] as VariantResultField
      expect(resultField.type).toBe("variant")
      expect(resultField.options).toContain("Ok")
      expect(resultField.options).toContain("Err")
    })

    it("should detect timestamp format in created_at field", () => {
      const meta = reactor.getResultMeta(
        "get_user"
      ) as MethodResultMeta<unknown>

      const optionalField = meta.resultFields[0] as OptionalResultField
      const innerRecord = optionalField.innerField as RecordResultField

      const createdAtField = innerRecord.fields.find(
        (f) => f.label === "created_at"
      ) as NumberResultField

      expect(createdAtField.type).toBe("number")
      expect(createdAtField.candidType).toBe("nat64")
      expect(createdAtField.displayType).toBe("string") // nat64 → string
      expect(createdAtField.numberFormat).toBe("timestamp") // Detected from label
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Dynamic Method Registration Tests
  // ══════════════════════════════════════════════════════════════════════════

  describe("Dynamic Method Registration", () => {
    let reactor: MetadataDisplayReactor

    beforeEach(async () => {
      reactor = new MetadataDisplayReactor({
        name: "dynamic",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: SIMPLE_SERVICE_CANDID,
      })
      await reactor.initialize()
    })

    it("should register a simple dynamic method", async () => {
      expect(reactor.hasMethod("new_method")).toBe(false)

      await reactor.registerMethod({
        functionName: "new_method",
        candid: "(text) -> (text) query",
      })

      expect(reactor.hasMethod("new_method")).toBe(true)
      expect(reactor.getMethodNames()).toContain("new_method")
    })

    it("should generate metadata for dynamically registered method", async () => {
      await reactor.registerMethod({
        functionName: "complex_method",
        candid:
          "(record { user_id : nat64; data : blob }) -> (variant { Ok : nat; Err : text })",
      })

      // Check argument metadata
      const argMeta = reactor.getArgumentMeta(
        "complex_method"
      ) as MethodArgumentsMeta<unknown>
      expect(argMeta).toBeDefined()
      expect(argMeta.fields).toHaveLength(1)

      const argRecord = argMeta.fields[0] as RecordArgumentField
      expect(argRecord.type).toBe("record")
      expect(argRecord.fields).toHaveLength(2)

      const userIdField = argRecord.fields.find((f) => f.label === "user_id")
      expect(userIdField?.type).toBe("number")

      const dataField = argRecord.fields.find((f) => f.label === "data")
      expect(dataField?.type).toBe("blob")

      // Check result metadata
      const resultMeta = reactor.getResultMeta(
        "complex_method"
      ) as MethodResultMeta<unknown>
      expect(resultMeta).toBeDefined()
      expect(resultMeta.resultFields).toHaveLength(1)

      const resultVariant = resultMeta.resultFields[0] as VariantResultField
      expect(resultVariant.isResultType).toBe(true)
    })

    it("should not duplicate already registered methods", async () => {
      const initialCount = reactor.getMethodNames().length

      await reactor.registerMethod({
        functionName: "greet",
        candid: "(text) -> (text) query",
      })

      expect(reactor.getMethodNames().length).toBe(initialCount)
    })

    it("should register multiple methods at once", async () => {
      await reactor.registerMethods([
        { functionName: "method1", candid: "() -> (nat) query" },
        { functionName: "method2", candid: "(text) -> (bool)" },
        { functionName: "method3", candid: "(nat, nat) -> (nat) query" },
      ])

      expect(reactor.hasMethod("method1")).toBe(true)
      expect(reactor.hasMethod("method2")).toBe(true)
      expect(reactor.hasMethod("method3")).toBe(true)
    })

    it("should throw error for invalid method name", async () => {
      await expect(
        reactor.registerMethod({
          functionName: "wrong_name",
          candid: "service : { correct_name : () -> (text) query }",
        })
      ).rejects.toThrow('Method "wrong_name" not found')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // All Metadata Access Tests
  // ══════════════════════════════════════════════════════════════════════════

  describe("All Metadata Access", () => {
    let reactor: MetadataDisplayReactor

    beforeAll(async () => {
      reactor = new MetadataDisplayReactor({
        name: "simple",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: SIMPLE_SERVICE_CANDID,
      })
      await reactor.initialize()
    })

    it("should return all argument metadata", () => {
      const allArgMeta = reactor.getAllArgumentMeta()

      expect(allArgMeta).not.toBeNull()
      expect(allArgMeta).toHaveProperty("greet")
      expect(allArgMeta).toHaveProperty("get_count")
      expect(allArgMeta).toHaveProperty("set_count")

      // Check greet method
      const greetMeta = (allArgMeta as any)[
        "greet"
      ] as MethodArgumentsMeta<unknown>
      expect(greetMeta.functionType).toBe("query")
      expect(greetMeta.fields).toHaveLength(1)
      expect(greetMeta.fields[0].type).toBe("text")

      // Check get_count method (no args)
      const getCountMeta = (allArgMeta as any)[
        "get_count"
      ] as MethodArgumentsMeta<unknown>
      expect(getCountMeta.functionType).toBe("query")
      expect(getCountMeta.fields).toHaveLength(0)

      // Check set_count method
      const setCountMeta = (allArgMeta as any)[
        "set_count"
      ] as MethodArgumentsMeta<unknown>
      expect(setCountMeta.functionType).toBe("update")
      expect(setCountMeta.fields).toHaveLength(1)
      expect(setCountMeta.fields[0].type).toBe("number")
    })

    it("should return all result metadata", () => {
      const allResultMeta = reactor.getAllResultMeta()

      expect(allResultMeta).not.toBeNull()
      expect(allResultMeta).toHaveProperty("greet")
      expect(allResultMeta).toHaveProperty("get_count")
      expect(allResultMeta).toHaveProperty("set_count")

      // Check greet result
      const greetMeta = (allResultMeta as any)[
        "greet"
      ] as MethodResultMeta<unknown>
      expect(greetMeta.returnCount).toBe(1)
      expect(greetMeta.resultFields[0].type).toBe("text")

      // Check get_count result
      const getCountMeta = (allResultMeta as any)[
        "get_count"
      ] as MethodResultMeta<unknown>
      expect(getCountMeta.returnCount).toBe(1)
      expect(getCountMeta.resultFields[0].type).toBe("number")
      expect(
        (getCountMeta.resultFields[0] as NumberResultField).displayType
      ).toBe("string")

      // Check set_count result (no return)
      const setCountMeta = (allResultMeta as any)[
        "set_count"
      ] as MethodResultMeta<unknown>
      expect(setCountMeta.returnCount).toBe(0)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Display Type Mapping Verification
  // ══════════════════════════════════════════════════════════════════════════

  describe("Display Type Mapping", () => {
    it("should correctly map all display types in metadata", async () => {
      const testCandid = `
        service : {
          test_types : () -> (
            nat,
            int,
            nat64,
            nat32,
            float64,
            principal,
            text,
            bool,
            blob,
            opt text,
            vec nat
          ) query;
        }
      `

      const reactor = new MetadataDisplayReactor({
        name: "types",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: testCandid,
      })
      await reactor.initialize()

      const meta = reactor.getResultMeta(
        "test_types"
      ) as MethodResultMeta<unknown>

      expect(meta).toBeDefined()
      expect(meta.resultFields).toHaveLength(11)

      // Verify display types
      expect((meta.resultFields[0] as NumberResultField).displayType).toBe(
        "string"
      ) // nat
      expect((meta.resultFields[1] as NumberResultField).displayType).toBe(
        "string"
      ) // int
      expect((meta.resultFields[2] as NumberResultField).displayType).toBe(
        "string"
      ) // nat64
      expect((meta.resultFields[3] as NumberResultField).displayType).toBe(
        "number"
      ) // nat32
      expect((meta.resultFields[4] as NumberResultField).displayType).toBe(
        "number"
      ) // float64
      expect(meta.resultFields[5].displayType).toBe("string") // principal
      expect(meta.resultFields[6].displayType).toBe("string") // text
      expect(meta.resultFields[7].displayType).toBe("boolean") // bool
      expect(meta.resultFields[8].displayType).toBe("string") // blob → hex string
      expect(meta.resultFields[9].displayType).toBe("nullable") // opt
      expect(meta.resultFields[10].displayType).toBe("array") // vec
    })
  })
  describe("Data Mocking & Verification", () => {
    let reactor: MetadataDisplayReactor

    beforeAll(async () => {
      reactor = new MetadataDisplayReactor({
        name: "mock-test",
        canisterId: "aaaaa-aa",
        clientManager: createMockClientManager(),
        candid: ICRC1_SERVICE_CANDID,
      })
      await reactor.initialize()
    })

    it("should verify nat result transformation matches metadata", () => {
      const methodName = "icrc1_fee"

      // 1. Get Metadata
      const meta = reactor.getResultMeta(
        methodName
      ) as MethodResultMeta<unknown>
      const field = meta.resultFields[0] as NumberResultField

      expect(field.type).toBe("number")
      expect(field.displayType).toBe("string")

      // 2. Mock Candid Data
      const mockCandid = 10_000n

      // 3. Transform using Codec
      const codec = (reactor as any).getCodec(methodName)
      const displayData = codec.result.asDisplay(mockCandid)

      // 4. Verify Data matches Metadata expectation
      expect(typeof displayData).toBe("string")
      expect(displayData).toBe("10000")
    })

    it("should verify complex metadata result matches structure", () => {
      const methodName = "icrc1_metadata"

      // 1. Get Metadata
      const meta = reactor.getResultMeta(
        methodName
      ) as MethodResultMeta<unknown>
      const field = meta.resultFields[0] as VectorResultField

      expect(field.type).toBe("vector")
      expect(field.displayType).toBe("array")

      // 2. Mock Candid Data (Vec of Records)
      const mockCandid = [
        ["icrc1:name", { Text: "Test Token" }],
        ["icrc1:decimals", { Nat: 8n }],
      ]

      // 3. Transform using Codec
      const codec = (reactor as any).getCodec(methodName)
      const displayData = codec.result.asDisplay(mockCandid)

      // 4. Verify Data matches Metadata expectation
      // Vec<(Text, Value)> is converted to Object!
      expect(typeof displayData).toBe("object")
      expect(Array.isArray(displayData)).toBe(false)

      expect(displayData).toHaveProperty("icrc1:name")
      expect(displayData["icrc1:name"]).toEqual({
        _type: "Text",
        Text: "Test Token",
      })
    })

    it("should verify Result variant unwrapping matches metadata", () => {
      const methodName = "icrc1_transfer"

      // 1. Get Metadata
      const meta = reactor.getResultMeta(
        methodName
      ) as MethodResultMeta<unknown>
      const field = meta.resultFields[0] as VariantResultField

      expect(field.isResultType).toBe(true)
      expect(field.displayType).toBe("result")

      // 2. Mock Candid Data (Ok)
      const mockOk = { Ok: 12345n }

      // 3. Transform using Codec
      const codec = (reactor as any).getCodec(methodName)
      const displayOk = codec.result.asDisplay(mockOk)

      // Result unwrapping happens in DisplayReactor, NOT codec
      // So here we get { Ok: "12345" }
      expect(displayOk).toHaveProperty("Ok")
      expect(displayOk.Ok).toBe("12345")

      // 4. Mock Candid Data (Err)
      const mockErr = { Err: { InsufficientFunds: { balance: 100n } } }

      // For Err, codec returns it as is (DisplayReactor handles the throw)
      // Wait, let's check code. DisplayCodecVisitor handles options.
      // Result unwrapping happens in DisplayReactor.callMethod, NOT in the codec itself?
      // Let's verify DisplayCodec logic for Variant.

      const displayErr = codec.result.asDisplay(mockErr)
      // The visitor doesn't auto-unwrap Result types during DECODE constant
      // It creates a structure that might be unwrapped later or is kept as variant
      // Actually DisplayCodecVisitor check "isResultType" in logic?
      // No, it handles variants generically.

      // Let's see what displayErr looks like
      // Expected: { Err: { _type: "InsufficientFunds", InsufficientFunds: { balance: "100" } } }
      // Or similar normalized variant structure

      expect(displayErr).toHaveProperty("Err")
      expect(displayErr.Err).toHaveProperty("InsufficientFunds")
      expect(displayErr.Err.InsufficientFunds.balance).toBe("100")
    })
  })
})

describe("MetadataDisplayReactor E2E", () => {
  let reactor: MetadataDisplayReactor<TestActor>
  let clientManager: ClientManager

  beforeAll(() => {
    const agent = HttpAgent.createSync({ host: "https://ic0.app" })
    clientManager = {
      agent,
      registerCanisterId: () => {},
      subscribe: () => () => {},
      queryClient: {
        invalidateQueries: () => Promise.resolve(),
        ensureQueryData: () => Promise.resolve(undefined),
        getQueryData: () => undefined,
      },
    } as unknown as ClientManager

    // ICP Ledger Canister
    reactor = new MetadataDisplayReactor<TestActor>({
      name: "icp-ledger",
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      clientManager,
    })
  })

  it("should initialize from mainnet and generate metadata", async () => {
    await reactor.initialize()

    // Verify methods are loaded
    const methodNames = reactor.getMethodNames()
    expect(methodNames.length).toBeGreaterThan(0)
    console.log("✅ Mainnet methods loaded:", methodNames.length)

    // Verify metadata is generated
    expect(reactor.getAllArgumentMeta()).not.toBeNull()
    expect(reactor.getAllResultMeta()).not.toBeNull()
  })

  it("should have correct metadata for icrc1_name", async () => {
    const argMeta = reactor.getArgumentMeta("icrc1_name")
    expect(argMeta).toBeDefined()
    expect(argMeta!.fields).toHaveLength(0)
    expect(argMeta!.functionType).toBe("query")

    const resultMeta = reactor.getResultMeta("icrc1_name")
    expect(resultMeta).toBeDefined()
    expect(resultMeta!.resultFields).toHaveLength(1)
    expect(resultMeta!.resultFields[0].type).toBe("text")
  })

  it("should call method and return transformed result", async () => {
    const result = await reactor.callMethod({
      functionName: "icrc1_name" as any,
    })

    expect(result).toBe("Internet Computer")
    console.log("✅ icrc1_name result:", result)
  })

  it("should call method with metadata using callDynamicWithMeta", async () => {
    await reactor.registerMethod({
      functionName: "icrc1_symbol",
      candid: "() -> (text) query",
    })

    const { result, meta } = await reactor.callDynamicWithMeta({
      functionName: "icrc1_symbol",
      candid: "() -> (text) query",
    })

    expect(result).toBe("ICP")
    expect(meta).toBeDefined()
    expect(meta.resultFields).toHaveLength(1)
    expect(meta.resultFields[0].type).toBe("text")
    console.log("✅ callDynamicWithMeta result:", result)
  })

  it("should return balance as string (display transformation)", async () => {
    await reactor.registerMethod({
      functionName: "icrc1_fee",
      candid: "() -> (nat) query",
    })

    const fee = await reactor.callDynamic({
      functionName: "icrc1_fee",
      candid: "() -> (nat) query",
    })

    // Fee should be transformed to string (display format)
    expect(typeof fee).toBe("string")
    console.log("✅ icrc1_fee (string):", fee)
  })
})
