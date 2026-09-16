import * as parser from "../dist/nodejs"
import { describe, it, expect } from "vitest"

// Candid's `import service "base.did"` merges base.did's service into this one.
// A single source string cannot load base.did, so every function used to return
// a result without the imported methods, and validateIDL reported the source as
// valid.

const SERVICE = "service : { transfer : (nat) -> (bool) };"
const IMPORTS_SERVICE = `import service "base.did";\n${SERVICE}`
const NOT_SUPPORTED =
  /^import service "base\.did" is not supported\. Imports cannot be resolved from a single Candid source string, so the methods of the imported service would be missing\./

describe("import service", () => {
  it.each(["didToJs", "didToTs", "parseDid", "validateIDL"] as const)(
    "%s throws instead of dropping the imported methods",
    (name) => {
      expect(() => parser[name](IMPORTS_SERVICE)).toThrow(NOT_SUPPORTED)
    }
  )

  it("verifyCompatability throws when either interface imports a service", () => {
    expect(() => parser.verifyCompatability(IMPORTS_SERVICE, SERVICE)).toThrow(
      NOT_SUPPORTED
    )
    expect(() => parser.verifyCompatability(SERVICE, IMPORTS_SERVICE)).toThrow(
      NOT_SUPPORTED
    )
  })

  it("still reports a parse error in the first interface first", () => {
    expect(() =>
      parser.verifyCompatability("service : {", IMPORTS_SERVICE)
    ).toThrow(/^Candid parser error/)
  })

  it("still reports an unbound type in the first interface first", () => {
    expect(() =>
      parser.verifyCompatability(
        "service : { transfer : (Account) -> (bool) };",
        IMPORTS_SERVICE
      )
    ).toThrow("Unbound type identifier Account")
  })

  it("still reports a missing service in the first interface first", () => {
    expect(() =>
      parser.verifyCompatability("type Account = nat;", IMPORTS_SERVICE)
    ).toThrow("new interface has no main service type")
  })

  it("reports import service before a type error in the same interface", () => {
    // Account would come from base.did, so the import is the real problem.
    const importsAccount = `import service "base.did";\nservice : { transfer : (Account) -> (bool) };`

    expect(() => parser.verifyCompatability(importsAccount, SERVICE)).toThrow(
      NOT_SUPPORTED
    )
    expect(() => parser.verifyCompatability(SERVICE, importsAccount)).toThrow(
      NOT_SUPPORTED
    )
  })
})

describe("verifyCompatibility with import service", () => {
  it("throws when either interface imports a service", () => {
    expect(() => parser.verifyCompatibility(IMPORTS_SERVICE, SERVICE)).toThrow(
      NOT_SUPPORTED
    )
    expect(() => parser.verifyCompatibility(SERVICE, IMPORTS_SERVICE)).toThrow(
      NOT_SUPPORTED
    )
  })

  it("still reports an unbound type in the old interface first", () => {
    expect(() =>
      parser.verifyCompatibility(
        "service : { transfer : (Account) -> (bool) };",
        IMPORTS_SERVICE
      )
    ).toThrow("Unbound type identifier Account")
  })

  it("still reports a missing service in the old interface first", () => {
    expect(() =>
      parser.verifyCompatibility("type Account = nat;", IMPORTS_SERVICE)
    ).toThrow("The old interface declares no service.")
  })
})

describe("plain import", () => {
  const IMPORTS_TYPES = `import "types.did";\n${SERVICE}`

  it("is still ignored", () => {
    expect(parser.didToJs(IMPORTS_TYPES)).toBe(parser.didToJs(SERVICE))
    expect(parser.didToTs(IMPORTS_TYPES)).toBe(parser.didToTs(SERVICE))
    expect(parser.parseDid(IMPORTS_TYPES)).toEqual(parser.parseDid(SERVICE))
    expect(parser.validateIDL(IMPORTS_TYPES)).toBe(true)
    expect(parser.verifyCompatability(IMPORTS_TYPES, SERVICE)).toBe(true)
  })

  it("still reports a type that only the imported file declares as unbound", () => {
    expect(() =>
      parser.didToJs(
        'import "types.did";\nservice : { transfer : (Account) -> (bool) };'
      )
    ).toThrow("Unbound type identifier Account")
  })
})
