import { importCandidDefinition } from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import * as parser from "../dist/nodejs"
import { describe, it, expect } from "vitest"

// candid_parser prints names with Rust's escape_debug, which writes U+0000 as
// `\0`. In JavaScript and TypeScript, `\0` followed by a digit is a legacy
// octal escape: a SyntaxError in a module, and another character in sloppy
// code. The name "\001" (U+0000 then "1") printed as `'\01'`, so codegen's
// declarations did not load, and importCandidDefinition (CandidReactor)
// read it as U+0001: the field hash changed from 49 to 1, and the call
// carried bytes the canister does not accept.

const CANDID = `
  type T = record { "\\001" : nat; "\\\\01" : text; "\\00" : bool };
  service : { get : (T) -> (T) query }
`
// The names above, as JavaScript strings.
const NAMES = ["\u00001", "\\01", "\u0000"]

/** didToJs output, loaded the way an ES module loads it (strict mode). */
function loadStrict(js: string): IDL.ServiceClass {
  const body = js.replace(/export const (\w+) =/g, "const $1 =")
  const load = new Function(
    "IDL",
    `"use strict";\n${body}\nreturn idlFactory({ IDL });`
  )
  return load(IDL)
}

function fieldNames(service: IDL.ServiceClass): string[] {
  const get = service._fields.find(([name]) => name === "get")?.[1]
  const record = get?.argTypes[0]
  if (!(record instanceof IDL.RecordClass)) {
    throw new Error(`expected a record, got ${record?.display()}`)
  }
  return record._fields.map(([name]) => name).sort()
}

describe("a Candid name holding U+0000 before a digit", () => {
  it("loads as a module", () => {
    expect(fieldNames(loadStrict(parser.didToJs(CANDID)))).toEqual(
      [...NAMES].sort()
    )
  })

  it("keeps its name when importCandidDefinition evaluates it", async () => {
    const { idlFactory } = await importCandidDefinition(parser.didToJs(CANDID))
    expect(fieldNames(idlFactory({ IDL }))).toEqual([...NAMES].sort())
  })

  it("is encoded with the hash of its name", async () => {
    const { idlFactory } = await importCandidDefinition(parser.didToJs(CANDID))
    const get = idlFactory({ IDL })._fields.find(([n]) => n === "get")![1]
    const bytes = IDL.encode(get.argTypes, [
      { "\u00001": 7n, "\\01": "x", "\u0000": true },
    ])
    // DIDL, one type: a record (0x6c) of three fields, sorted by id. The
    // Candid hash of "\u0000" is 0 and of "\u00001" is 49; "\\01" is 4585821.
    expect(Buffer.from(bytes).toString("hex")).toMatch(
      /^4449444c016c03007e317ddd/
    )
  })

  it("has no octal escape in didToTs either", () => {
    const ts = parser.didToTs(CANDID)
    expect(ts).toContain("'\\x001' : bigint")
    expect(ts).toContain("'\\\\01' : string")
    expect(ts).not.toMatch(/(^|[^\\])(\\\\)*\\0[0-9]/)
  })
})
