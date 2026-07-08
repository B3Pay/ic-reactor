import { before, describe, it } from "node:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { c } from "./index.js"
import { candidLabelId, ProgramIrGraph } from "./runtime/program-ir.js"
import { ProgramSemanticsGraph } from "./runtime/semantics.js"
import { assertBytesEqual, initWasmForTest } from "./test-helpers.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturePath = resolve(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "runtime",
  "static-dynamic-parity.did"
)
const didSource = readFileSync(fixturePath, "utf8")

const Account = c.record({
  owner: c.principal(),
  subaccount: c.opt(c.blob()),
})

const TransferArg = c.record({
  to: Account,
  fee: c.opt(c.nat()),
  memo: c.opt(c.blob()),
  from_subaccount: c.opt(c.blob()),
  created_at_time: c.opt(c.nat64()),
  amount: c.nat(),
})

const TransferError = c.variant({
  GenericError: c.record({
    message: c.text(),
    error_code: c.nat(),
  }),
  TemporarilyUnavailable: c.null(),
  BadBurn: c.record({
    min_burn_amount: c.nat(),
  }),
  Duplicate: c.record({
    duplicate_of: c.nat(),
  }),
  BadFee: c.record({
    expected_fee: c.nat(),
  }),
  CreatedInFuture: c.record({
    ledger_time: c.nat64(),
  }),
  TooOld: c.null(),
  InsufficientFunds: c.record({
    balance: c.nat(),
  }),
})

const TransferResult = c.variant({
  Ok: c.nat(),
  Err: TransferError,
})

const RetryState = c.variant({
  Later: c.record({
    ledger_time: c.nat64(),
    reason: c.text(),
  }),
  Never: c.null(),
})

const NestedVariant = c.variant({
  Retrying: RetryState,
  Ready: c.null(),
})

const ExplicitVec = c.blob()

const Pair = c.tuple([c.text(), c.nat64()])

const Result = c.variant({
  Ok: c.nat(),
  Err: c.text(),
})

const MixedRecord = c.record({
  count: c.nat(),
  slot: c.nat64(),
  blob_value: c.blob(),
  state: NestedVariant,
  account: Account,
  bytes: c.blob(),
  transfer: TransferArg,
})

const MixedResult = c.variant({
  rejected: NestedVariant,
  accepted: MixedRecord,
})

const staticService = c.service({
  icrc1_balance_of: c.query([Account], c.nat()),
  icrc1_transfer: c.update([TransferArg], TransferResult),
  inspect: c.query([MixedRecord, NestedVariant], MixedResult),
  inspect_semantics: c.query([ExplicitVec, Pair], Result),
})

const owner = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const subaccount = bytes(32, 1)
const fromSubaccount = bytes(32, 3)
const memo = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
const blobValue = new Uint8Array([0xca, 0xfe, 0xba, 0xbe])
const vecNat8Value = new Uint8Array([0, 1, 2, 3, 255])
const pairValue: [string, bigint] = ["tuple", 64n]

const account = {
  owner,
  subaccount,
}

const transferArg = {
  to: account,
  fee: 10_000n,
  memo,
  from_subaccount: fromSubaccount,
  created_at_time: 1_700_000_000_000_000_000n,
  amount: 500_000n,
}

const nestedVariant = {
  Retrying: {
    Later: {
      ledger_time: 1_700_000_000_000_000_123n,
      reason: "backoff",
    },
  },
}

const mixedRecord = {
  count: 42n,
  slot: 9_223_372_036_854_775_807n,
  blob_value: blobValue,
  state: nestedVariant,
  account,
  bytes: vecNat8Value,
  transfer: transferArg,
}

type ParityCase = {
  name: string
  methodName: string
  args: readonly unknown[]
  reply: unknown
}

const cases: ParityCase[] = [
  {
    name: "icrc1_balance_of covers principal, opt blob, and nat",
    methodName: "icrc1_balance_of",
    args: [
      {
        owner: "2vxsx-fae",
        subaccount: null,
      },
    ],
    reply: 123_456_789n,
  },
  {
    name: "icrc1_transfer covers opt blob, nat, nat64, and nested result variants",
    methodName: "icrc1_transfer",
    args: [transferArg],
    reply: {
      Err: {
        CreatedInFuture: {
          ledger_time: 1_700_000_000_000_000_999n,
        },
      },
    },
  },
  {
    name: "inspect covers records, variants, nested variants, and blob fields",
    methodName: "inspect",
    args: [
      mixedRecord,
      {
        Ready: null,
      },
    ],
    reply: {
      accepted: mixedRecord,
    },
  },
  {
    name: "inspect_semantics covers explicit vec nat8, tuple record, and Result variant",
    methodName: "inspect_semantics",
    args: [vecNat8Value, pairValue],
    reply: {
      Ok: 123n,
    },
  },
]

let dynamicProgram: c.RuntimeProgram

before(async () => {
  initWasmForTest()
  dynamicProgram = await c.compileDid(didSource)
})

describe("static-vs-dynamic runtime parity", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      const method = dynamicProgram.method(testCase.methodName)

      const staticArgs = staticService.encodeMethodArgs(
        testCase.methodName as keyof typeof staticService.methods,
        testCase.args as never
      )
      const dynamicArgs = method.encodeArgs(testCase.args)
      assertBytesEqual(dynamicArgs, staticArgs, `${testCase.methodName} args`)

      const staticReply = staticService.encodeMethodReply(
        testCase.methodName as keyof typeof staticService.methods,
        testCase.reply as never
      )
      const dynamicReply = method.encodeReply(testCase.reply)
      assertBytesEqual(
        dynamicReply,
        staticReply,
        `${testCase.methodName} reply`
      )

      const staticDecoded = staticService.decodeMethodReply(
        testCase.methodName as keyof typeof staticService.methods,
        dynamicReply
      )
      const dynamicDecoded = method.decodeReply(staticReply)
      assert.deepEqual(dynamicDecoded, staticDecoded)
    })
  }
})

describe("semantic projection parity", () => {
  it("aligns generated static schemas, dynamic schemas, and forms", () => {
    const generated = c.generateTypescript(didSource)
    assert.match(generated, /export const ExplicitVec = c\.blob\(\);/)
    assert.match(generated, /export const Pair = c\.tuple\(\[/)
    assert.match(generated, /export const Result = c\.variant\(\{/)

    const graph = new ProgramIrGraph(dynamicProgram.ir)
    const semantics = new ProgramSemanticsGraph(graph)

    assert.equal(typeSemantic(graph, semantics, "ExplicitVec")?.kind, "blob")
    assert.equal(typeSemantic(graph, semantics, "Pair")?.kind, "tuple")
    assert.deepEqual(semantics.resultType(typeId(graph, "Result")), {
      kind: "result",
      okField: candidLabelId("Ok"),
      errField: candidLabelId("Err"),
    })

    assert.equal(
      dynamicProgram.type("ExplicitVec").wireDid(),
      ExplicitVec.wireDid()
    )
    assert.equal(dynamicProgram.type("Pair").wireDid(), Pair.wireDid())
    assert.equal(dynamicProgram.type("Result").wireDid(), Result.wireDid())
    assert.doesNotThrow(() => dynamicProgram.type("Pair").toCandid(pairValue))
    assert.deepEqual(dynamicProgram.type("Pair").toWire(pairValue), pairValue)

    const form = dynamicProgram.method("inspect_semantics").toFormSchema()
    assert.deepEqual(
      form.args.map((field) => field.kind),
      ["blob", "tuple"]
    )
    assert.equal(form.returns[0]?.kind, "variant")
  })
})

function bytes(length: number, lastByte: number): Uint8Array {
  const value = new Uint8Array(length)
  value[length - 1] = lastByte
  return value
}

function typeId(graph: ProgramIrGraph, name: string): number {
  const declaration = graph.declarationByName(name)
  if (!declaration) {
    throw new Error(`missing declaration ${name}`)
  }
  return declaration.type
}

function typeSemantic(
  graph: ProgramIrGraph,
  semantics: ProgramSemanticsGraph,
  name: string
) {
  return semantics.semantic(typeId(graph, name))
}
