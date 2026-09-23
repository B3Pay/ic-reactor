import { importCandidDefinition } from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import * as parser from "../dist/nodejs"
import { describe, it, expect } from "vitest"

// didToJs prints each record field, variant tag and service method as a quoted
// key in an object literal. A `'__proto__'` key there sets the object's
// prototype instead of adding a property, so a Candid name spelled `__proto__`
// vanished from the IDL type without an error.
//
// `a'__proto__` prints as `'a\'__proto__'`, which ends in the same characters.
// It has to come through unchanged.

const CANDID = `
  type T = record { "__proto__" : nat; "a'__proto__" : nat; other : text };
  type V = variant { "__proto__" : nat; other };
  service : (T) -> {
    get : () -> (T) query;
    pick : (V) -> ();
    "__proto__" : () -> ();
  }
`

async function load(source: string) {
  const { idlFactory, init } = await importCandidDefinition(
    parser.didToJs(source)
  )
  return { service: idlFactory({ IDL }), init: init?.({ IDL }) ?? [] }
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

describe("a Candid name spelled __proto__", () => {
  it("stays a record field in the didToJs IDL type", async () => {
    const { service, init } = await load(CANDID)
    const expected = ["__proto__ : nat", "a'__proto__ : nat", "other : text"]

    expect(fieldsOf(method(service, "get").retTypes[0])).toEqual(expected)
    expect(fieldsOf(init[0])).toEqual(expected)
  })

  it("stays a variant tag in the didToJs IDL type", async () => {
    const { service } = await load(CANDID)

    expect(fieldsOf(method(service, "pick").argTypes[0])).toEqual([
      "__proto__ : nat",
      "other : null",
    ])
  })

  it("stays a service method in the didToJs IDL type", async () => {
    const { service } = await load(CANDID)

    expect(service._fields.map(([name]) => name).sort()).toEqual([
      "__proto__",
      "get",
      "pick",
    ])
  })

  it("is printed as a computed key", () => {
    expect(
      parser.didToJs(`
        type T = record { "__proto__" : nat; other : text };
        service : { get : () -> (T) query }
      `)
    ).toBe(`export const idlFactory = ({ IDL }) => {
  const T = IDL.Record({ 'other' : IDL.Text, ['__proto__'] : IDL.Nat });
  return IDL.Service({ 'get' : IDL.Func([], [T], ['query']) });
};
export const init = ({ IDL }) => { return []; };`)
  })

  // parseDid reports names as values, `{ name: "__proto__" }`, never as keys,
  // so it kept the field all along. This guards that.
  it("stays a record field in parseDid", () => {
    const T = parser.parseDid(CANDID).types.find(({ name }) => name === "T")
    const fields = T?.type.kind === "record" ? T.type.fields : []

    expect(fields.map(({ name }) => name).sort()).toEqual([
      "__proto__",
      "a'__proto__",
      "other",
    ])
  })
})
