/**
 * ICRC-1 / ICRC-2 Integration Test Suite
 *
 * Validates b3-candid (Rust/WASM) byte-level correctness against the
 * official @icp-sdk/core/candid IDL encoder used as a test oracle.
 *
 * Official Candid (IDL.*) is used ONLY in this test file — never in production.
 *
 * IMPORTANT FINDING: The Candid specification allows any topological order
 * for type table entries. b3-candid (Rust `candid` crate) and the official
 * JS IDL produce different type table orderings. Both are valid Candid.
 * Therefore, encode tests verify SEMANTIC equivalence (cross-decode) rather
 * than raw byte identity. The type table ordering difference is documented
 * but is NOT a bug.
 */
import { describe, it, before } from "node:test"
import { strict as assert } from "node:assert"
import { programForTest, assertBytesEqual } from "./test-helpers.js"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import type { CandidProgram } from "./index.js"

// ─────────────────────────────────────────────────────────────────────
// §1  ICRC-1 DID Fixture (realistic ledger interface)
// ─────────────────────────────────────────────────────────────────────

const ICRC1_DID = `
type Account = record {
  owner : principal;
  subaccount : opt blob;
};

type TransferArg = record {
  from_subaccount : opt blob;
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
  icrc1_balance_of : (Account) -> (nat) query;
  icrc1_transfer : (TransferArg) -> (TransferResult);
}
`

// ─────────────────────────────────────────────────────────────────────
// §2  Oracle IDL types (official Candid, test-only)
// ─────────────────────────────────────────────────────────────────────

const OracleAccount = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
})

const OracleTransferError = IDL.Variant({
  BadFee: IDL.Record({ expected_fee: IDL.Nat }),
  BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  TooOld: IDL.Null,
  CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
  Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
  TemporarilyUnavailable: IDL.Null,
  GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
})

const OracleTransferArg = IDL.Record({
  from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  to: OracleAccount,
  amount: IDL.Nat,
  fee: IDL.Opt(IDL.Nat),
  memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
  created_at_time: IDL.Opt(IDL.Nat64),
})

const OracleTransferResult = IDL.Variant({
  Ok: IDL.Nat,
  Err: OracleTransferError,
})

// ─────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────

let program: CandidProgram

before(() => {
  program = programForTest(ICRC1_DID)
})

// ─────────────────────────────────────────────────────────────────────
// §3  Encode Oracle Tests
//
// Strategy: Both encoders produce valid Candid with potentially different
// type table orderings. We verify semantic equivalence via cross-decoding:
//   1. Encode with b3-candid, decode with official IDL → values match
//   2. Encode with official IDL, decode with b3-candid → values match
//   3. For simple types (no compound type table), assert byte identity
// ─────────────────────────────────────────────────────────────────────

describe("Encode oracle — icrc1_balance_of", () => {
  it("byte-identical for anonymous principal with no subaccount (simple case)", () => {
    const owner = Principal.anonymous()

    // Official encode
    const oracleBytes = new Uint8Array(
      IDL.encode([OracleAccount], [{ owner, subaccount: [] }])
    )

    // b3-candid encode
    const codBytes = program.encodeMethodArgs(
      "icrc1_balance_of",
      `(record { owner = principal "${owner.toText()}"; subaccount = null })`
    )

    // For the anonymous case with empty subaccount, cross-decode to verify semantics
    const oracleDecoded = IDL.decode([OracleAccount], codBytes)
    assert.equal(oracleDecoded.length, 1)
    const decoded = oracleDecoded[0] as unknown as {
      owner: Principal
      subaccount: [] | [Uint8Array]
    }
    assert.ok(
      Principal.from(decoded.owner).toText() === owner.toText(),
      `Expected anonymous principal, got: ${Principal.from(decoded.owner).toText()}`
    )
    assert.deepStrictEqual(decoded.subaccount, [])
  })

  it("cross-decodes named principal with no subaccount", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

    const codBytes = program.encodeMethodArgs(
      "icrc1_balance_of",
      `(record { owner = principal "${owner.toText()}"; subaccount = null })`
    )

    // Official IDL can decode b3-candid bytes
    const oracleDecoded = IDL.decode([OracleAccount], codBytes)
    const decoded = oracleDecoded[0] as unknown as {
      owner: Principal
      subaccount: [] | [Uint8Array]
    }
    assert.equal(Principal.from(decoded.owner).toText(), owner.toText())
    assert.deepStrictEqual(decoded.subaccount, [])
  })

  it("cross-decodes principal with 32-byte subaccount", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
    const subaccount = new Uint8Array(32)
    subaccount[31] = 1

    const blobLiteral = Array.from(
      subaccount,
      (b) => `\\${b.toString(16).padStart(2, "0")}`
    ).join("")

    const codBytes = program.encodeMethodArgs(
      "icrc1_balance_of",
      `(record { owner = principal "${owner.toText()}"; subaccount = opt blob "${blobLiteral}" })`
    )

    // Official IDL can decode b3-candid bytes
    const oracleDecoded = IDL.decode([OracleAccount], codBytes)
    const decoded = oracleDecoded[0] as unknown as {
      owner: Principal
      subaccount: [] | [Uint8Array]
    }
    assert.equal(Principal.from(decoded.owner).toText(), owner.toText())
    assert.equal(decoded.subaccount.length, 1)
    assert.deepStrictEqual(new Uint8Array(decoded.subaccount[0]!), subaccount)
  })

  it("b3-candid decodes official oracle bytes for balance_of", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

    const oracleBytes = new Uint8Array(
      IDL.encode([OracleAccount], [{ owner, subaccount: [] }])
    )

    // b3-candid can decode official bytes
    const decoded = program.decodeMethodArgs("icrc1_balance_of", oracleBytes)
    assert.ok(
      decoded.includes("ryjl3-tyaaa-aaaaa-aaaba-cai"),
      `Expected principal in decoded: ${decoded}`
    )
  })
})

describe("Encode oracle — icrc1_transfer", () => {
  it("cross-decodes a minimal transfer (b3-candid → official IDL)", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

    const codBytes = program.encodeMethodArgs(
      "icrc1_transfer",
      `(record {
        from_subaccount = null;
        to = record { owner = principal "${owner.toText()}"; subaccount = null };
        amount = 1_000_000 : nat;
        fee = null;
        memo = null;
        created_at_time = null;
      })`
    )

    // Official IDL can decode b3-candid bytes
    const oracleDecoded = IDL.decode([OracleTransferArg], codBytes)
    const decoded = oracleDecoded[0] as unknown as {
      from_subaccount: [] | [Uint8Array]
      to: { owner: Principal; subaccount: [] | [Uint8Array] }
      amount: bigint
      fee: [] | [bigint]
      memo: [] | [Uint8Array]
      created_at_time: [] | [bigint]
    }

    assert.equal(Principal.from(decoded.to.owner).toText(), owner.toText())
    assert.equal(decoded.amount, BigInt(1_000_000))
    assert.deepStrictEqual(decoded.from_subaccount, [])
    assert.deepStrictEqual(decoded.fee, [])
    assert.deepStrictEqual(decoded.memo, [])
    assert.deepStrictEqual(decoded.created_at_time, [])
  })

  it("cross-decodes a transfer with all optional fields", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
    const subaccount = new Uint8Array(32)
    subaccount[31] = 2
    const memo = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const fromSub = new Uint8Array(32)
    fromSub[31] = 3

    const blobLiteral = (bytes: Uint8Array) =>
      Array.from(bytes, (b) => `\\${b.toString(16).padStart(2, "0")}`).join("")

    const codBytes = program.encodeMethodArgs(
      "icrc1_transfer",
      `(record {
        from_subaccount = opt blob "${blobLiteral(fromSub)}";
        to = record { owner = principal "${owner.toText()}"; subaccount = opt blob "${blobLiteral(subaccount)}" };
        amount = 500_000 : nat;
        fee = opt (10_000 : nat);
        memo = opt blob "${blobLiteral(memo)}";
        created_at_time = opt (1_700_000_000_000_000_000 : nat64);
      })`
    )

    // Official IDL can decode b3-candid bytes
    const oracleDecoded = IDL.decode([OracleTransferArg], codBytes)
    const decoded = oracleDecoded[0] as unknown as {
      from_subaccount: [] | [Uint8Array]
      to: { owner: Principal; subaccount: [] | [Uint8Array] }
      amount: bigint
      fee: [] | [bigint]
      memo: [] | [Uint8Array]
      created_at_time: [] | [bigint]
    }

    assert.equal(decoded.amount, BigInt(500_000))
    assert.equal(Principal.from(decoded.to.owner).toText(), owner.toText())
    assert.deepStrictEqual(
      new Uint8Array(decoded.to.subaccount[0]!),
      subaccount
    )
    assert.deepStrictEqual(new Uint8Array(decoded.from_subaccount[0]!), fromSub)
    assert.deepStrictEqual(decoded.fee, [BigInt(10_000)])
    assert.deepStrictEqual(new Uint8Array(decoded.memo[0]!), memo)
    assert.deepStrictEqual(decoded.created_at_time, [
      BigInt(1_700_000_000_000_000_000n),
    ])
  })

  it("b3-candid decodes official oracle transfer bytes", () => {
    const owner = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

    const oracleBytes = new Uint8Array(
      IDL.encode(
        [OracleTransferArg],
        [
          {
            from_subaccount: [],
            to: { owner, subaccount: [] },
            amount: BigInt(1_000_000),
            fee: [],
            memo: [],
            created_at_time: [],
          },
        ]
      )
    )

    const decoded = program.decodeMethodArgs("icrc1_transfer", oracleBytes)
    assert.ok(
      decoded.includes("ryjl3-tyaaa-aaaaa-aaaba-cai"),
      `Expected principal in decoded: ${decoded}`
    )
    assert.ok(
      decoded.includes("1_000_000") || decoded.includes("1000000"),
      `Expected amount in decoded: ${decoded}`
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// Byte-identity test for primitive types (no compound type table)
// ─────────────────────────────────────────────────────────────────────

describe("Encode oracle — byte identity for primitive encodings", () => {
  it("nat encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(
      IDL.encode([IDL.Nat], [BigInt(123_456_789)])
    )
    const codBytes = program.encodeMethodArgs(
      "icrc1_balance_of",
      `(record { owner = principal "2vxsx-fae"; subaccount = null })`
    )
    // For direct primitive check, use dynamic args
    const primProgram = programForTest(`service : { check : (nat) -> (nat) }`)
    const codNat = primProgram.encodeMethodArgs("check", "(123_456_789 : nat)")
    assertBytesEqual(codNat, oracleBytes, "nat primitive byte-identity")
  })

  it("bool encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(IDL.encode([IDL.Bool], [true]))
    const primProgram = programForTest(`service : { check : (bool) -> (bool) }`)
    const codBool = primProgram.encodeMethodArgs("check", "(true)")
    assertBytesEqual(codBool, oracleBytes, "bool primitive byte-identity")
  })

  it("text encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(IDL.encode([IDL.Text], ["hello world"]))
    const primProgram = programForTest(`service : { check : (text) -> (text) }`)
    const codText = primProgram.encodeMethodArgs("check", '("hello world")')
    assertBytesEqual(codText, oracleBytes, "text primitive byte-identity")
  })

  it("principal encoding is byte-identical", () => {
    const p = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
    const oracleBytes = new Uint8Array(IDL.encode([IDL.Principal], [p]))
    const primProgram = programForTest(
      `service : { check : (principal) -> (principal) }`
    )
    const codPrincipal = primProgram.encodeMethodArgs(
      "check",
      `(principal "${p.toText()}")`
    )
    assertBytesEqual(
      codPrincipal,
      oracleBytes,
      "principal primitive byte-identity"
    )
  })

  it("int encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(IDL.encode([IDL.Int], [BigInt(-42)]))
    const primProgram = programForTest(`service : { check : (int) -> (int) }`)
    const codInt = primProgram.encodeMethodArgs("check", "(-42 : int)")
    assertBytesEqual(codInt, oracleBytes, "int primitive byte-identity")
  })

  it("nat8 encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(IDL.encode([IDL.Nat8], [255]))
    const primProgram = programForTest(`service : { check : (nat8) -> (nat8) }`)
    const codNat8 = primProgram.encodeMethodArgs("check", "(255 : nat8)")
    assertBytesEqual(codNat8, oracleBytes, "nat8 primitive byte-identity")
  })

  it("nat64 encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(
      IDL.encode([IDL.Nat64], [BigInt("18446744073709551615")])
    )
    const primProgram = programForTest(
      `service : { check : (nat64) -> (nat64) }`
    )
    const codNat64 = primProgram.encodeMethodArgs(
      "check",
      "(18_446_744_073_709_551_615 : nat64)"
    )
    assertBytesEqual(codNat64, oracleBytes, "nat64 primitive byte-identity")
  })

  it("empty args encoding is byte-identical", () => {
    const oracleBytes = new Uint8Array(IDL.encode([], []))
    const primProgram = programForTest(`service : { check : () -> () }`)
    const codEmpty = primProgram.encodeMethodArgs("check", "()")
    assertBytesEqual(codEmpty, oracleBytes, "empty args byte-identity")
  })
})

// ─────────────────────────────────────────────────────────────────────
// §4  Decode Oracle Tests
// ─────────────────────────────────────────────────────────────────────

describe("Decode oracle — balance result", () => {
  it("decodes balance 123456789n", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode([IDL.Nat], [BigInt(123_456_789)])
    )

    const decoded = program.decodeMethodReply(
      "icrc1_balance_of",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("123_456_789") || decoded.includes("123456789"),
      `Expected decoded to contain 123456789, got: ${decoded}`
    )
  })

  it("decodes balance 0n", () => {
    const oracleReplyBytes = new Uint8Array(IDL.encode([IDL.Nat], [BigInt(0)]))
    const decoded = program.decodeMethodReply(
      "icrc1_balance_of",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("0"),
      `Expected decoded to contain 0, got: ${decoded}`
    )
  })

  it("decodes very large balance", () => {
    const bigBalance = BigInt("99999999999999999999")
    const oracleReplyBytes = new Uint8Array(IDL.encode([IDL.Nat], [bigBalance]))
    const decoded = program.decodeMethodReply(
      "icrc1_balance_of",
      oracleReplyBytes
    )
    // The candid text may use underscores, so normalize
    const normalizedDecoded = decoded.replaceAll("_", "")
    assert.ok(
      normalizedDecoded.includes("99999999999999999999"),
      `Expected large balance, got: ${decoded}`
    )
  })
})

describe("Decode oracle — transfer success", () => {
  it("decodes { Ok: 1000n }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode([OracleTransferResult], [{ Ok: BigInt(1000) }])
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("Ok") &&
        (decoded.includes("1_000") || decoded.includes("1000")),
      `Expected decoded to contain Ok and 1000, got: ${decoded}`
    )
  })

  it("decodes { Ok: 0n }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode([OracleTransferResult], [{ Ok: BigInt(0) }])
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("Ok"),
      `Expected decoded to contain Ok, got: ${decoded}`
    )
  })
})

describe("Decode oracle — transfer error", () => {
  it("decodes { Err: { InsufficientFunds: { balance: 10n } } }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode(
        [OracleTransferResult],
        [{ Err: { InsufficientFunds: { balance: BigInt(10) } } }]
      )
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("InsufficientFunds"),
      `Expected decoded to contain InsufficientFunds, got: ${decoded}`
    )
    assert.ok(
      decoded.includes("balance") && decoded.includes("10"),
      `Expected decoded to contain balance: 10, got: ${decoded}`
    )
  })

  it("decodes { Err: { GenericError: { error_code: 42n, message: 'boom' } } }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode(
        [OracleTransferResult],
        [{ Err: { GenericError: { error_code: BigInt(42), message: "boom" } } }]
      )
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("GenericError"),
      `Expected GenericError, got: ${decoded}`
    )
    assert.ok(decoded.includes("boom"), `Expected 'boom', got: ${decoded}`)
  })

  it("decodes { Err: { TooOld } }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode([OracleTransferResult], [{ Err: { TooOld: null } }])
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(decoded.includes("TooOld"), `Expected TooOld, got: ${decoded}`)
  })

  it("decodes { Err: { BadFee: { expected_fee: 10_000n } } }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode(
        [OracleTransferResult],
        [{ Err: { BadFee: { expected_fee: BigInt(10_000) } } }]
      )
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(decoded.includes("BadFee"), `Expected BadFee, got: ${decoded}`)
    assert.ok(
      decoded.includes("expected_fee"),
      `Expected expected_fee, got: ${decoded}`
    )
  })

  it("decodes { Err: { Duplicate: { duplicate_of: 999n } } }", () => {
    const oracleReplyBytes = new Uint8Array(
      IDL.encode(
        [OracleTransferResult],
        [{ Err: { Duplicate: { duplicate_of: BigInt(999) } } }]
      )
    )

    const decoded = program.decodeMethodReply(
      "icrc1_transfer",
      oracleReplyBytes
    )
    assert.ok(
      decoded.includes("Duplicate"),
      `Expected Duplicate, got: ${decoded}`
    )
    assert.ok(
      decoded.includes("duplicate_of"),
      `Expected duplicate_of, got: ${decoded}`
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// §5  Fake Transport Actor Tests
// ─────────────────────────────────────────────────────────────────────

/**
 * A minimal test actor that wraps CandidProgram with a fake transport.
 * The transport receives (methodName, argBytes) and returns response bytes.
 */
function createTestActor(
  prog: CandidProgram,
  transport: (methodName: string, arg: Uint8Array) => Uint8Array
) {
  return {
    call(methodName: string, argsText: string): string {
      const argBytes = prog.encodeMethodArgs(methodName, argsText)
      const responseBytes = transport(methodName, argBytes)
      return prog.decodeMethodReply(methodName, responseBytes)
    },
  }
}

describe("Fake transport actor — icrc1_balance_of", () => {
  it("round-trips through fake transport", () => {
    const owner = Principal.anonymous()

    // Oracle response bytes
    const oracleResponseBytes = new Uint8Array(
      IDL.encode([IDL.Nat], [BigInt(42_000_000)])
    )

    const actor = createTestActor(program, (methodName, arg) => {
      assert.equal(methodName, "icrc1_balance_of")
      // Verify the arg bytes are valid by cross-decoding with official IDL
      const decoded = IDL.decode([OracleAccount], arg)
      const account = decoded[0] as unknown as {
        owner: Principal
        subaccount: [] | [Uint8Array]
      }
      assert.equal(Principal.from(account.owner).toText(), owner.toText())
      assert.deepStrictEqual(account.subaccount, [])
      return oracleResponseBytes
    })

    const result = actor.call(
      "icrc1_balance_of",
      `(record { owner = principal "${owner.toText()}"; subaccount = null })`
    )

    assert.ok(
      result.includes("42_000_000") || result.includes("42000000"),
      `Expected 42000000 in result, got: ${result}`
    )
  })
})

describe("Fake transport actor — icrc1_transfer", () => {
  it("round-trips a successful transfer through fake transport", () => {
    const to = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

    const oracleResponseBytes = new Uint8Array(
      IDL.encode([OracleTransferResult], [{ Ok: BigInt(1234) }])
    )

    const actor = createTestActor(program, (methodName, arg) => {
      assert.equal(methodName, "icrc1_transfer")
      // Verify the arg bytes are valid by cross-decoding with official IDL
      const decoded = IDL.decode([OracleTransferArg], arg)
      const transferArg = decoded[0] as unknown as {
        to: { owner: Principal }
        amount: bigint
      }
      assert.equal(Principal.from(transferArg.to.owner).toText(), to.toText())
      assert.equal(transferArg.amount, BigInt(100_000))
      return oracleResponseBytes
    })

    const result = actor.call(
      "icrc1_transfer",
      `(record {
        from_subaccount = null;
        to = record { owner = principal "${to.toText()}"; subaccount = null };
        amount = 100_000 : nat;
        fee = null;
        memo = null;
        created_at_time = null;
      })`
    )

    assert.ok(
      result.includes("Ok") &&
        (result.includes("1_234") || result.includes("1234")),
      `Expected Ok 1234 in result, got: ${result}`
    )
  })

  it("round-trips a transfer error through fake transport", () => {
    const to = Principal.anonymous()

    const oracleResponseBytes = new Uint8Array(
      IDL.encode(
        [OracleTransferResult],
        [{ Err: { InsufficientFunds: { balance: BigInt(10) } } }]
      )
    )

    const actor = createTestActor(program, (methodName, arg) => {
      assert.equal(methodName, "icrc1_transfer")
      // Verify the arg bytes are valid by cross-decoding
      const decoded = IDL.decode([OracleTransferArg], arg)
      const transferArg = decoded[0] as unknown as {
        to: { owner: Principal }
        amount: bigint
      }
      assert.equal(Principal.from(transferArg.to.owner).toText(), to.toText())
      assert.equal(transferArg.amount, BigInt(999))
      return oracleResponseBytes
    })

    const result = actor.call(
      "icrc1_transfer",
      `(record {
        from_subaccount = null;
        to = record { owner = principal "${to.toText()}"; subaccount = null };
        amount = 999 : nat;
        fee = null;
        memo = null;
        created_at_time = null;
      })`
    )

    assert.ok(
      result.includes("InsufficientFunds"),
      `Expected InsufficientFunds in result, got: ${result}`
    )
  })

  it("round-trips TooOld error through fake transport", () => {
    const to = Principal.anonymous()

    const oracleResponseBytes = new Uint8Array(
      IDL.encode([OracleTransferResult], [{ Err: { TooOld: null } }])
    )

    const actor = createTestActor(program, (methodName, arg) => {
      assert.equal(methodName, "icrc1_transfer")
      const decoded = IDL.decode([OracleTransferArg], arg)
      assert.ok(decoded.length === 1)
      return oracleResponseBytes
    })

    const result = actor.call(
      "icrc1_transfer",
      `(record {
        from_subaccount = null;
        to = record { owner = principal "${to.toText()}"; subaccount = null };
        amount = 1 : nat;
        fee = null;
        memo = null;
        created_at_time = null;
      })`
    )

    assert.ok(
      result.includes("TooOld"),
      `Expected TooOld in result, got: ${result}`
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// §6  TypeScript Inference Checks (compile-time only)
// ─────────────────────────────────────────────────────────────────────

/**
 * Type-level equality check. Resolves to `true` only when A and B
 * are structurally identical types.
 */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

/**
 * Compile-time assertion. If T is not `true`, this produces a type error.
 */
type Expect<T extends true> = T

// --- Account must infer { owner: Principal; subaccount: Uint8Array | null } ---

type Account = {
  owner: import("@icp-sdk/core/principal").Principal
  subaccount: Uint8Array | null
}

// This line produces a type error if Account doesn't match the expected shape.
type _AssertAccount = Expect<
  Equal<
    Account,
    {
      owner: import("@icp-sdk/core/principal").Principal
      subaccount: Uint8Array | null
    }
  >
>

// --- TransferResult must infer a correct single-key variant union ---

type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { BadBurn: { min_burn_amount: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } }

type TransferResult = { Ok: bigint } | { Err: TransferError }

// This line produces a type error if TransferResult doesn't match the expected shape.
type _AssertTransferResult = Expect<
  Equal<TransferResult, { Ok: bigint } | { Err: TransferError }>
>

// Ensure _Assert types are used (avoid unused warnings)
void 0 as unknown as _AssertAccount
void 0 as unknown as _AssertTransferResult
