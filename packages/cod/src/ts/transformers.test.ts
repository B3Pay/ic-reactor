/// <reference types="node" />
import { before, describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { c, type AgentLike } from "./index.js"
import {
  assertBytesEqual,
  initWasmForTest,
  programForTest,
} from "./test-helpers.js"

type Equal<Actual, Expected> =
  (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected
    ? 1
    : 2
    ? true
    : false
type Expect<T extends true> = T
type Simplify<T> = { [Key in keyof T]: T[Key] }

const PrincipalText = c.principal().asText()
type PrincipalTextInference = Expect<
  Equal<c.Infer<typeof PrincipalText>, string>
>

const HexBlob = c.blob().asHex()
type HexBlobInference = Expect<Equal<c.Infer<typeof HexBlob>, string>>

const NatString = c.nat().asString()
type NatStringInference = Expect<Equal<c.Infer<typeof NatString>, string>>

const OptHexBlob = c.opt(c.blob().asHex())
type OptHexBlobInference = Expect<
  Equal<c.Infer<typeof OptHexBlob>, string | null>
>

const OptionalText = c.opt(c.text()).optional()
type OptionalText = c.Infer<typeof OptionalText>

type OptionalTextInference = Expect<Equal<OptionalText, string | undefined>>

const BrandedText = c.text().brand<"Memo">()
type BrandedTextInference = Expect<
  Equal<c.Infer<typeof BrandedText>, c.Brand<string, "Memo">>
>

const Account = c.record({
  owner: c.principal().asText(),
  subaccount: c.opt(c.blob().asHex()),
})
type AccountInference = Expect<
  Equal<
    Simplify<c.Infer<typeof Account>>,
    { owner: string; subaccount: string | null }
  >
>

const OWNER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

before(() => {
  initWasmForTest()
})

describe("transformer type model", () => {
  it("keeps transformed DID identical to the raw wire schema", () => {
    const raw = c.record({
      owner: c.principal(),
      subaccount: c.opt(c.blob()),
    })

    assert.equal(Account.wireDid(), raw.wireDid())
    assert.equal(
      Account.wireDid(),
      "record { owner : principal; subaccount : opt blob }"
    )
  })
})

describe("transformer runtime codecs", () => {
  it("principal text encodes to principal bytes correctly", () => {
    const transformed = c.service({
      check: c.query([c.principal().asText()], c.null()),
    })
    const raw = programForTest(
      `service : { check : (principal) -> (null) query }`
    )

    const actual = transformed.encodeMethodArgs("check", [OWNER])
    const expected = raw.encodeMethodArgs("check", `(principal "${OWNER}")`)

    assertBytesEqual(actual, expected)
  })

  it("hex blob encodes to blob bytes correctly", () => {
    const transformed = c.service({
      check: c.query([c.blob().asHex()], c.null()),
    })
    const raw = programForTest(`service : { check : (blob) -> (null) query }`)

    const actual = transformed.encodeMethodArgs("check", ["deadbeef"])
    const expected = raw.encodeMethodArgs("check", `(blob "\\de\\ad\\be\\ef")`)

    assertBytesEqual(actual, expected)
  })

  it("nat string encodes to nat bytes correctly", () => {
    const transformed = c.service({
      check: c.query([c.nat().asString()], c.null()),
    })
    const raw = programForTest(`service : { check : (nat) -> (null) query }`)

    const actual = transformed.encodeMethodArgs("check", ["123456789"])
    const expected = raw.encodeMethodArgs("check", `(123_456_789 : nat)`)

    assertBytesEqual(actual, expected)
  })

  it("decoded wire values transform back into app values", () => {
    const rawAccount = c.record({
      owner: c.principal(),
      subaccount: c.opt(c.blob()),
    })
    const raw = c.service({
      get_account: c.query([], rawAccount),
    })
    const transformed = c.service({
      get_account: c.query([], Account),
    })

    const reply = raw.encodeMethodReply("get_account", {
      owner: OWNER,
      subaccount: new Uint8Array([0xde, 0xad]),
    })

    assert.deepEqual(transformed.decodeMethodReply("get_account", reply), {
      owner: OWNER,
      subaccount: "dead",
    })
  })
})

describe("transformer byte oracles", () => {
  it("transformed and raw account schemas produce identical Candid bytes", () => {
    const rawAccount = c.record({
      owner: c.principal(),
      subaccount: c.opt(c.blob()),
    })
    const raw = c.service({
      icrc1_balance_of: c.query([rawAccount], c.nat()),
    })
    const transformed = c.service({
      icrc1_balance_of: c.query([Account], c.nat().asString()),
    })

    assert.equal(transformed.serviceDid(), raw.serviceDid())

    const actual = transformed.encodeMethodArgs("icrc1_balance_of", [
      {
        owner: OWNER,
        subaccount: "00000001",
      },
    ])
    const expected = raw.encodeMethodArgs("icrc1_balance_of", [
      {
        owner: OWNER,
        subaccount: new Uint8Array([0, 0, 0, 1]),
      },
    ])

    assertBytesEqual(actual, expected)
  })

  it("optional() maps undefined to the same opt wire bytes as null", () => {
    const raw = c.service({
      check: c.query([c.opt(c.text())], c.null()),
    })
    const transformed = c.service({
      check: c.query([c.opt(c.text()).optional()], c.null()),
    })

    assertBytesEqual(
      transformed.encodeMethodArgs("check", [undefined]),
      raw.encodeMethodArgs("check", [null])
    )
  })
})

describe("transformer actor integration", () => {
  it("encodes app args before agent calls and decodes wire replies after", async () => {
    const rawAccount = c.record({
      owner: c.principal(),
      subaccount: c.opt(c.blob()),
    })
    const raw = c.service({
      icrc1_balance_of: c.query([rawAccount], c.nat()),
    })
    const transformed = c.service({
      icrc1_balance_of: c.query([Account], c.nat().asString()),
    })

    const expectedArg = raw.encodeMethodArgs("icrc1_balance_of", [
      {
        owner: OWNER,
        subaccount: new Uint8Array([0xde, 0xad]),
      },
    ])
    const reply = raw.encodeMethodReply("icrc1_balance_of", 42_000_000n)

    let observedArg: Uint8Array | undefined
    const agent: AgentLike = {
      async query(canisterId, request) {
        assert.equal(canisterId, "ledger-canister")
        assert.equal(request.methodName, "icrc1_balance_of")
        observedArg = request.arg
        return { status: "replied", reply: { arg: reply } }
      },
    }

    const actor = c.actor({
      service: transformed,
      agent,
      canisterId: "ledger-canister",
    })

    const balance = await actor.icrc1_balance_of({
      owner: OWNER,
      subaccount: "dead",
    })

    assert.equal(balance, "42000000")
    assert.ok(observedArg)
    assertBytesEqual(observedArg, expectedArg)
  })
})
