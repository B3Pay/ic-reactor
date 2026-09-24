import { importCandidDefinition } from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it } from "vitest"
import * as parser from "../dist/nodejs"

// A named field's id is the hash of its name, whatever the name looks like, so
// a canister expects the field `_0_` as hash("_0_") = 4735054. didToJs printed
// it as the key `'_0_'`, and @icp-sdk/core reads a key spelled `_<digits>_` or
// `_0x<hex>_`, below 2^32, as that number: the call carried id 0, and the
// canister rejected it, or read an `opt` field as none. `record { _0_ : nat;
// 0 : text }` printed both fields under one key, so one of them vanished.
// didToJs and didToTs now print such a field under its hash, `_4735054_`.

const CANDID = `
  type R = record {
    _0_ : nat;
    _0x10_ : text;
    _4294967295_ : bool;
    _4294967296_ : int;
    _12a_ : text;
    b : text;
  };
  type V = variant { _0_ : nat; _0x10_ : text; _4294967295_ : bool; _4294967296_ : int; b };
  type Both = record { _0_ : nat; 0 : text };
  type BothV = variant { _1_ : nat; 1 : text };
  type Maybe = record { _0_ : opt nat };
  service : {
    r : (R) -> (R) query;
    v : (V) -> (V) query;
    both : (Both) -> (Both) query;
    both_v : (BothV) -> (BothV) query;
    maybe : (Maybe) -> (Maybe) query;
  }
`

/** The id Candid gives a field name: the spec's hash of its UTF-8 bytes. */
function candidHash(name: string): number {
  let hash = 0
  for (const byte of new TextEncoder().encode(name)) {
    hash = (hash * 223 + byte) % 2 ** 32
  }
  return hash
}

/** The key a field named `name` now has in the IDL and in the types. */
const hashed = (name: string) => `_${candidHash(name)}_`

// Each argument's bytes as the Rust candid crate (candid 0.10.35 through
// candid_parser 0.4.1, the encoder Rust canisters use) encodes the Candid value
// in `value`: `IDLArgs::to_bytes_with_types` against the method's argument
// types in CANDID.
const REFERENCE = [
  {
    method: "r",
    value: `record { _0_ = 5 : nat; _0x10_ = "x"; _4294967295_ = true; _4294967296_ = -3 : int; _12a_ = "y"; b = "z" }`,
    js: {
      [hashed("_0_")]: 5n,
      [hashed("_0x10_")]: "x",
      [hashed("_4294967295_")]: true,
      _4294967296_: -3n,
      _12a_: "y",
      b: "z",
    },
    bytes:
      "4449444c016c066271ce80a1027d93bec5ec057ef2bfc5ec057cdeabeb9c0d7199a5e8f40e710100017a05017d01790178",
  },
  {
    method: "v",
    value: "variant { _0_ = 5 : nat }",
    js: { [hashed("_0_")]: 5n },
    bytes:
      "4449444c016b05627fce80a1027d93bec5ec057ef2bfc5ec057c99a5e8f40e7101000105",
  },
  {
    method: "v",
    value: `variant { _0x10_ = "x" }`,
    js: { [hashed("_0x10_")]: "x" },
    bytes:
      "4449444c016b05627fce80a1027d93bec5ec057ef2bfc5ec057c99a5e8f40e710100040178",
  },
  {
    method: "v",
    value: "variant { _4294967295_ = true }",
    js: { [hashed("_4294967295_")]: true },
    bytes:
      "4449444c016b05627fce80a1027d93bec5ec057ef2bfc5ec057c99a5e8f40e7101000201",
  },
  {
    method: "v",
    value: "variant { _4294967296_ = -3 : int }",
    js: { _4294967296_: -3n },
    bytes:
      "4449444c016b05627fce80a1027d93bec5ec057ef2bfc5ec057c99a5e8f40e710100037d",
  },
  {
    method: "both",
    value: `record { _0_ = 5 : nat; 0 = "zero" }`,
    js: { [hashed("_0_")]: 5n, _0_: "zero" },
    bytes: "4449444c016c020071ce80a1027d0100047a65726f05",
  },
  {
    method: "both_v",
    value: "variant { _1_ = 7 : nat }",
    js: { [hashed("_1_")]: 7n },
    bytes: "4449444c016b020171ad82a1027d01000107",
  },
  {
    method: "both_v",
    value: `variant { 1 = "one" }`,
    js: { _1_: "one" },
    bytes: "4449444c016b020171ad82a1027d010000036f6e65",
  },
  {
    method: "maybe",
    value: "record { _0_ = opt (5 : nat) }",
    js: { [hashed("_0_")]: [5n] },
    bytes: "4449444c026c01ce80a102016e7d01000105",
  },
]

async function load(source: string): Promise<IDL.ServiceClass> {
  const { idlFactory } = await importCandidDefinition(parser.didToJs(source))
  return idlFactory({ IDL })
}

function method(service: IDL.ServiceClass, name: string): IDL.FuncClass {
  const func = service._fields.find(([methodName]) => methodName === name)?.[1]
  if (!func) throw new Error(`the service has no method ${name}`)
  return func
}

/** `name : type` for each field of a record or variant, sorted by name. */
function fieldsOf(type: IDL.Type | undefined): string[] {
  if (!(type instanceof IDL.RecordClass || type instanceof IDL.VariantClass)) {
    throw new Error(`expected a record or a variant, got ${type?.display()}`)
  }
  return type._fields.map(([name, field]) => `${name} : ${field.name}`).sort()
}

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

// A Buffer from Node's pool shares its ArrayBuffer with other data, which
// IDL.decode would read too, so the bytes get an ArrayBuffer of their own.
const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"))

describe("a Candid field or variant tag named like a numeric id", () => {
  it("hashes names the way the Candid spec does", () => {
    // Guards the helper the expectations below are built with.
    expect(candidHash("_0_")).toBe(4_735_054)
    expect(hashed("b")).toBe("_98_")
  })

  it.each(REFERENCE)(
    "reads $method($value) as the Rust candid crate encodes it",
    async ({ method: name, js, bytes }) => {
      const argTypes = method(await load(CANDID), name).argTypes

      expect(IDL.decode(argTypes, fromHex(bytes))).toEqual([js])
    }
  )

  // The Rust crate writes a nested type's table entry after the type that
  // holds it, and @icp-sdk/core writes it first, so the bytes for `maybe`
  // differ in that order alone. The test above reads them.
  it.each(REFERENCE.filter(({ method }) => method !== "maybe"))(
    "encodes $method($value) to the Rust candid crate's bytes",
    async ({ method: name, js, bytes }) => {
      const argTypes = method(await load(CANDID), name).argTypes

      expect(toHex(IDL.encode(argTypes, [js]))).toBe(bytes)
    }
  )

  it("keeps a field named _0_ apart from the field 0", async () => {
    const service = await load(CANDID)

    expect(fieldsOf(method(service, "both").argTypes[0])).toEqual([
      "_0_ : text",
      "_4735054_ : nat",
    ])
    expect(fieldsOf(method(service, "both_v").argTypes[0])).toEqual([
      "_1_ : text",
      "_4735277_ : nat",
    ])
  })

  it("prints the same key in didToTs as in didToJs", () => {
    const source = `
      type R = record {
        // Read as field 0 until now.
        _0_ : nat;
        _0x10_ : opt text;
        b : text;
      };
      type V = variant { _0_ : nat; _4294967295_; b };
      service : { get : (V) -> (R) query }
    `

    expect(parser.didToJs(source))
      .toBe(`export const idlFactory = ({ IDL }) => {
  const V = IDL.Variant({
    'b' : IDL.Null,
    _4735054_ : IDL.Nat,
    _1569808147_ : IDL.Null,
  });
  const R = IDL.Record({
    'b' : IDL.Text,
    _4735054_ : IDL.Nat,
    _4003074713_ : IDL.Opt(IDL.Text),
  });
  return IDL.Service({ 'get' : IDL.Func([V], [R], ['query']) });
};
export const init = ({ IDL }) => { return []; };`)
    expect(parser.didToTs(source))
      .toBe(`import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface R {
  'b' : string,
  /**
   * Read as field 0 until now.
   */
  _4735054_ : bigint,
  _4003074713_ : [] | [string],
}
export type V = { 'b' : null } |
  { _4735054_ : bigint } |
  { _1569808147_ : null };
export interface _SERVICE { 'get' : ActorMethod<[V], R> }
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
  })

  // Only a name @icp-sdk/core would read as a number changes. It hashes every
  // other name itself: one out of u32 range, one with another character, an
  // uppercase `0X`, a non-ASCII digit. A numeric field and a tuple print as
  // they always did.
  it("changes nothing for a name @icp-sdk/core already hashes", () => {
    const source = `
      type Names = record {
        _4294967296_ : nat;
        _0x100000000_ : nat;
        _99999999999999999999_ : nat;
        _12a_ : nat;
        _0X10_ : nat;
        _0x_ : nat;
        __ : nat;
        __0_ : nat;
        _0 : nat;
        "0_" : nat;
        "_-1_" : nat;
        "_+1_" : nat;
        _1_2_ : nat;
        "_ 1_" : nat;
        "_٣_" : nat;
        7 : nat;
      };
      type Tags = variant { _12a_; __0_; 0 };
      type Pair = record { nat; text };
      service : { get : (Names, Tags) -> (Pair) query }
    `

    expect(parser.didToJs(source))
      .toBe(`export const idlFactory = ({ IDL }) => {
  const Names = IDL.Record({
    _7_ : IDL.Nat,
    '0_' : IDL.Nat,
    '_0' : IDL.Nat,
    '__' : IDL.Nat,
    '_ 1_' : IDL.Nat,
    '_+1_' : IDL.Nat,
    '_-1_' : IDL.Nat,
    '_0x_' : IDL.Nat,
    '__0_' : IDL.Nat,
    '_٣_' : IDL.Nat,
    '_4294967296_' : IDL.Nat,
    '_0x100000000_' : IDL.Nat,
    '_12a_' : IDL.Nat,
    '_1_2_' : IDL.Nat,
    '_99999999999999999999_' : IDL.Nat,
    '_0X10_' : IDL.Nat,
  });
  const Tags = IDL.Variant({
    _0_ : IDL.Null,
    '__0_' : IDL.Null,
    '_12a_' : IDL.Null,
  });
  const Pair = IDL.Tuple(IDL.Nat, IDL.Text);
  return IDL.Service({ 'get' : IDL.Func([Names, Tags], [Pair], ['query']) });
};
export const init = ({ IDL }) => { return []; };`)
    expect(parser.didToTs(source))
      .toBe(`import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface Names {
  _7_ : bigint,
  '0_' : bigint,
  '_0' : bigint,
  '__' : bigint,
  '_ 1_' : bigint,
  '_+1_' : bigint,
  '_-1_' : bigint,
  '_0x_' : bigint,
  '__0_' : bigint,
  '_٣_' : bigint,
  '_4294967296_' : bigint,
  '_0x100000000_' : bigint,
  '_12a_' : bigint,
  '_1_2_' : bigint,
  '_99999999999999999999_' : bigint,
  '_0X10_' : bigint,
}
export type Pair = [bigint, string];
export type Tags = { _0_ : null } |
  { '__0_' : null } |
  { '_12a_' : null };
export interface _SERVICE { 'get' : ActorMethod<[Names, Tags], Pair> }
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];`)
  })

  // parseDid names a numeric field `_0_`, the key didToJs prints for it, and
  // named the field `_0_` the same, so this record listed two fields named
  // `_0_`, and the name of the first no longer matched its key in the IDL.
  it("names the field in parseDid by the key didToJs prints", () => {
    const { types } = parser.parseDid(`
      type Both = record {
        // Named _0_.
        _0_ : nat;
        0 : text;
        _12a_ : bool;
      };
      type Tags = variant { _0x10_; 16 : text };
    `)

    expect(types).toEqual([
      {
        name: "Both",
        type: {
          kind: "record",
          fields: [
            { name: "_0_", type: { kind: "text" } },
            {
              name: hashed("_0_"),
              type: { kind: "nat" },
              metadata: { description: "Named _0_.", docs: ["Named _0_."] },
            },
            { name: "_12a_", type: { kind: "bool" } },
          ],
        },
      },
      {
        name: "Tags",
        type: {
          kind: "variant",
          fields: [
            { name: "_16_", type: { kind: "text" } },
            { name: hashed("_0x10_"), type: { kind: "null" } },
          ],
        },
      },
    ])
  })
})
