// The module against schemas as the server gets them: a .did compiled to a
// Contract and loaded with schemaFromContract. Field and arm order is the
// Contract's, numeric labels are `_N_` keys, and `vec nat8` is blob.
import { didToContract, init } from "@meantjs/cli"
import {
  c,
  principal,
  serviceMethods,
  type AnyFieldSchema,
  type AnySchema,
  type Schema,
  type ServiceMethod,
} from "@meantjs/schema"
import { encode, encodeArgs } from "@meantjs/schema/codec"
import { schemaFromContract } from "@meantjs/schema/contract"
import { Principal } from "@icp-sdk/core/principal"
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv"
import type { JsonSchemaType } from "@modelcontextprotocol/server"
import { beforeAll, describe, expect, it } from "vitest"
import { candidArgsText } from "./candid-text.ts"
import {
  argsFromInput,
  methodInput,
  resultArms,
  signatureText,
  typeText,
  valueFromJson,
  valueToJson,
  type Json,
} from "./json.ts"
import {
  armsOf,
  elementsOf,
  fieldsOf,
  isBoxed,
  isEmptyType,
  isTagOnly,
  resolve,
  setOwn,
} from "./schema-walk.ts"

const KITCHEN = `
type Account = record { owner : principal; subaccount : opt blob };
type TransferArg = record {
  to : Account;
  fee : opt nat;
  memo : opt blob;
  from_subaccount : opt blob;
  created_at_time : opt nat64;
  amount : nat;
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
type TransferResult = variant { Ok : nat; Err : TransferError };
type List = opt record { head : int; tail : List };
type Tree = variant { leaf : int; node : record { left : Tree; right : Tree } };
type Value = variant {
  Nat : nat;
  Int : int;
  Text : text;
  Blob : blob;
  Array : vec Value;
  Map : vec record { text; Value };
};
type Callback = func (nat) -> (text) query;
type Odd = record {
  0 : text;
  5 : nat;
  "a b" : opt opt nat;
  "__proto__" : text;
  "toString" : null;
  "type" : reserved;
  "évil\u{202e}" : bool;
};
service : {
  icrc1_transfer : (TransferArg) -> (TransferResult);
  icrc1_balance_of : (Account) -> (nat) query;
  icrc1_metadata : () -> (vec record { text; Value }) query;
  list : (List) -> (List) query;
  tree : (Tree) -> (opt Tree) query;
  numbers : (nat8, nat16, nat32, nat64, int8, int16, int32, int64, int, nat) -> (nat8, int64);
  floats : (float32, float64) -> (float32, float64) query;
  odd : (Odd) -> (reserved);
  tuple : (record { text; nat; opt blob }) -> (record { principal; vec nat8 });
  refs : (Callback, service { ping : () -> () }) -> (opt Callback);
  units : (record {}, opt null, opt opt null, vec opt text, opt reserved) -> ();
  never : (variant { a : empty; b : nat }) -> (variant { ok : null; never : empty });
  ping : () -> () oneway;
  composite : (text) -> (text) composite_query;
}
`

const LEDGER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
// A 29-byte self-authenticating principal, the longest kind.
const USER = principal(
  Principal.selfAuthenticating(new Uint8Array(32).fill(7)).toText()
)
const PRINCIPALS = [LEDGER, USER, principal("aaaaa-aa"), principal("2vxsx-fae")]

const SAMPLES: Readonly<Record<string, readonly unknown[]>> = {
  bool: [true, false],
  null: [null],
  reserved: [null],
  text: ["", "hello", "ünï ☃ 𝄞", "evil\u202e", 'line\nbreak "quoted"'],
  principal: PRINCIPALS,
  nat8: [0, 7, 255],
  nat16: [0, 65_535],
  nat32: [0, 4_294_967_295],
  int8: [-128, 0, 127],
  int16: [-32_768, 32_767],
  int32: [-2_147_483_648, 2_147_483_647],
  nat: [0n, 150_000_000n, 10n ** 40n],
  int: [-(10n ** 40n), 0n, 42n],
  nat64: [0n, 2n ** 64n - 1n],
  int64: [-(2n ** 63n), 2n ** 63n - 1n],
  float32: [0, -0, 0.5, Number.NaN, Infinity, -Infinity, Math.fround(0.1)],
  float64: [0, -0, 0.1, Number.NaN, -Infinity, Number.MAX_VALUE, 5e-324],
}
const BLOBS = [
  new Uint8Array(),
  new Uint8Array([0, 255, 16]),
  new Uint8Array(32),
]

/** A seeded generator (mulberry32), so a failing case can be found again. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random values of a schema; past depth 4 the smallest choice, so it ends. */
class Sampler {
  constructor(private readonly next: () => number) {}

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T
  }

  value(schema: AnyFieldSchema, depth = 0): unknown {
    const node = resolve(schema)
    const deep = depth >= 4
    switch (node.kind) {
      case "primitive": {
        const samples = SAMPLES[node.primitive]
        if (samples === undefined) throw new Error(`no ${node.primitive}`)
        return this.pick(samples)
      }
      case "blob":
        return this.pick(BLOBS)
      case "unit":
        return {}
      case "opt": {
        if (deep || this.next() < 0.3) return null
        const inner = this.value(node.inner, depth + 1)
        return isBoxed(node) ? { some: inner } : inner
      }
      case "vec": {
        const length = deep ? 0 : Math.floor(this.next() * 3)
        return Array.from({ length }, () => this.value(node.inner, depth + 1))
      }
      case "record": {
        const out: Record<string, unknown> = {}
        for (const [key, field] of fieldsOf(node)) {
          setOwn(out, key, this.value(field, depth + 1))
        }
        return out
      }
      case "tuple":
        return elementsOf(node).map((element) => this.value(element, depth + 1))
      case "variant": {
        const arms = armsOf(node).filter(([, arm]) => !isEmptyType(arm))
        const leaves = arms.filter(([, arm]) => {
          const kind = resolve(arm).kind
          return kind === "primitive" || kind === "blob"
        })
        const [tag, arm] = this.pick(deep && leaves.length > 0 ? leaves : arms)
        // A null-payload arm's value is a bare { tag }.
        if (isTagOnly(arm)) return { tag }
        return { tag, value: this.value(arm, depth + 1) }
      }
      case "func":
        return {
          principal: this.pick(PRINCIPALS),
          method: this.pick(["m", "icrc1_fee", "a b"]),
        }
      case "service":
        return this.pick(PRINCIPALS)
    }
  }
}

function bytes(args: readonly AnyFieldSchema[], values: unknown[]): string {
  const encoded = encodeArgs(args, values)
  if (!encoded.ok) throw new Error(JSON.stringify(encoded.issues))
  return Buffer.from(encoded.bytes).toString("hex")
}

/** JSON as it crosses the wire: text, parsed. */
function wire(json: unknown): unknown {
  return JSON.parse(JSON.stringify(json))
}

const ajv = new AjvJsonSchemaValidator()

let schemas: { readonly [name: string]: AnySchema }
let methods: ReadonlyMap<string, ServiceMethod>

function method(name: string): ServiceMethod {
  const found = methods.get(name)
  if (found === undefined) throw new Error(`no method ${name}`)
  return found
}

function declared(name: string): AnySchema {
  const found = schemas[name]
  if (found === undefined) throw new Error(`no declaration ${name}`)
  return found
}

beforeAll(async () => {
  await init()
  const envelope = await didToContract(KITCHEN)
  if (!("contract" in envelope)) {
    throw new Error(JSON.stringify(envelope.diagnostics))
  }
  const loaded = schemaFromContract(envelope)
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues))
  expect(loaded.omitted).toEqual([])
  schemas = loaded.schemas
  methods = serviceMethods(loaded.actor as AnySchema)
})

describe("schemas loaded from a Contract", () => {
  it("round-trips sampled arguments and results through the tool JSON", () => {
    expect(methods.size).toBe(14)
    const sampler = new Sampler(seeded(42))
    let calls = 0
    for (const [name, { args, results }] of methods) {
      const input = methodInput(args)
      expect(input.complete, name).toBe(true)
      const check = ajv.getValidator<unknown>(input.schema as JsonSchemaType)
      for (let round = 0; round < 25; round++) {
        const values = args.map((arg) => sampler.value(arg))
        const json = args.map((arg, i) => valueToJson(arg, values[i]))
        const toolInput = wire(
          input.shape.kind === "fields"
            ? json[0]
            : Object.fromEntries(json.map((value, i) => [`arg${i}`, value]))
        )
        const where = `${name}: ${JSON.stringify(toolInput)}`
        // The canonical JSON passes the advertised schema...
        expect(check(toolInput).errorMessage, where).toBeUndefined()
        // ...and reads back to values that encode to the same bytes.
        const read = argsFromInput(args, input.shape, toolInput)
        if (!read.ok)
          throw new Error(`${where}: ${JSON.stringify(read.issues)}`)
        expect(bytes(args, read.values), where).toBe(bytes(args, values))
        expect(
          args.map((arg, i) => valueToJson(arg, read.values[i])),
          where
        ).toEqual(wire(json))
        expect(typeof candidArgsText(args, read.values)).toBe("string")

        const replies = results.map((result) => sampler.value(result))
        const back = results.map((result, i) => {
          const reply = valueFromJson(
            result,
            wire(valueToJson(result, replies[i]))
          )
          if (!reply.ok) throw new Error(JSON.stringify(reply.issues))
          return reply.value
        })
        expect(bytes(results, back), name).toBe(bytes(results, replies))
        calls++
      }
    }
    expect(calls).toBe(14 * 25)
  })

  it("matches a TransferArg built with c", () => {
    const Account = c.rec(() =>
      c.record({ owner: c.principal, subaccount: c.opt(c.blob()) })
    )
    const built = c.rec(() =>
      c.record({
        to: Account,
        fee: c.opt(c.nat),
        memo: c.opt(c.blob()),
        from_subaccount: c.opt(c.blob()),
        created_at_time: c.opt(c.nat64),
        amount: c.nat,
      })
    )
    const loaded = declared("TransferArg")
    const value = {
      to: { owner: USER, subaccount: new Uint8Array(32) },
      fee: 10_000n,
      memo: null,
      from_subaccount: null,
      created_at_time: 1_700_000_000_000_000_000n,
      amount: 150_000_000n,
    }
    expect(valueToJson(loaded, value)).toEqual(valueToJson(built, value))
    expect(methodInput([loaded])).toEqual(methodInput([built]))
    expect(typeText(loaded)).toBe(typeText(built))
    expect(candidArgsText([loaded], [value])).toBe(
      candidArgsText([built], [value])
    )
    const json = wire(valueToJson(built, value))
    const read = valueFromJson(loaded, json)
    if (!read.ok) throw new Error(JSON.stringify(read.issues))
    const encodedLoaded = encode(loaded as Schema<unknown>, read.value)
    const encodedBuilt = encode(built as Schema<unknown>, value)
    expect(encodedLoaded).toEqual(encodedBuilt)
  })

  it("names a loaded method's types structurally", () => {
    expect(signatureText(method("icrc1_balance_of"))).toBe(
      "(record { owner : principal; subaccount : opt blob }) -> (nat) query"
    )
    expect(signatureText(method("tree"))).toBe(
      "(variant { leaf : int; node : record { left : …; right : … } }) -> (opt variant { leaf : int; node : record { left : …; right : … } }) query"
    )
    expect(signatureText(method("tuple"))).toBe(
      "(record { text; nat; opt blob }) -> (record { principal; blob })"
    )
    expect(signatureText(method("ping"))).toBe("() -> () oneway")
    expect(signatureText(method("composite"))).toBe(
      "(text) -> (text) composite_query"
    )
    expect(typeText(declared("Odd"))).toContain('"évil\\u{202e}" : bool')
    const transfer = signatureText(method("icrc1_transfer"), { maxChars: 200 })
    expect(transfer.length).toBeLessThanOrEqual(200)
    expect(transfer).toMatch(/^\(record \{ .* \}\) -> \(variant \{ .* \}\)$/)
  })

  it("reads the odd labels of a loaded record", () => {
    const Odd = declared("Odd")
    const json = JSON.parse(
      '{"_0_": "zero", "_5_": "5", "a b": {"some": null}, "__proto__": "own", "toString": null, "type": {"anything": 1}, "évil\\u202e": true}'
    ) as Json
    const read = valueFromJson(Odd, json)
    if (!read.ok) throw new Error(JSON.stringify(read.issues))
    const value = read.value as Record<string, unknown>
    expect(Object.hasOwn(value, "__proto__")).toBe(true)
    expect(value).toMatchObject({ _0_: "zero", _5_: 5n, "a b": { some: null } })
    expect(valueToJson(Odd, value)).toEqual({
      _0_: "zero",
      _5_: "5",
      "a b": { some: null },
      ["__proto__"]: "own",
      toString: null,
      type: null,
      "évil\u202e": true,
    })
    // A field named __proto__ puts the record under arg0: the MCP SDK drops
    // that key from the top level of a tool call's arguments.
    const input = methodInput([Odd])
    expect(input.shape).toEqual({ kind: "positional", count: 1 })
    const arg0 = (
      input.schema.properties as Record<string, { properties?: object }>
    ).arg0
    const properties = arg0?.properties as object
    expect(Object.keys(properties).sort()).toEqual(
      [
        "_0_",
        "_5_",
        "a b",
        "__proto__",
        "toString",
        "type",
        "évil\u202e",
      ].sort()
    )
    expect(candidArgsText([Odd], [value])).toContain('"évil\\u{202e}" = true')
  })

  it("gives the Ok and Err arms of a loaded result", () => {
    const arms = resultArms(method("icrc1_transfer").results)
    expect(arms).toBeDefined()
    expect(typeText(arms?.ok as AnyFieldSchema)).toBe("nat")
    expect(typeText(arms?.err as AnyFieldSchema)).toMatch(/^variant \{ /)
    expect(resultArms(method("icrc1_balance_of").results)).toBeUndefined()
  })
})
