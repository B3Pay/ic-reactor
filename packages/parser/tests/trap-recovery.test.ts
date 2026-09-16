import { readFileSync } from "node:fs"
import * as node from "../dist/nodejs"
import * as web from "../dist/web/index.js"
import { describe, it, expect, vi } from "vitest"

const VALID = "service:{icrc1_name:()->(text) query;}"
const EXPECTED_JS = `export const idlFactory = ({ IDL }) => {
  return IDL.Service({ 'icrc1_name' : IDL.Func([], [IDL.Text], ['query']) });
};
export const init = ({ IDL }) => { return []; };`

// Inputs that used to leave the WebAssembly instance broken, so every later call
// failed with "memory access out of bounds". CandidAdapter compiles
// candid:service metadata fetched from any canister, so the caller does not
// control this input.

// parseDid recurses once per `opt` and runs out of WebAssembly stack.
const DEEPLY_NESTED = `service : { f : (${"opt ".repeat(2000)}nat) -> () }`
// The lexer recurses once per consecutive comment and runs out of JavaScript
// stack (RangeError).
const LONG_COMMENT_RUN = `${"// note\n".repeat(5000)}service : { f : () -> () }`
// "\ff" is not UTF-8, and formatting the parse error for it panics in Rust.
const INVALID_BYTE_ESCAPE = String.raw`service : "\ff"`

const READABLE_ERROR = /^The Candid parser could not parse this input\./

// The web build has no instance until init. Instantiate it from the bytes on
// disk, the way a caller without fetch would.
web.initSync({
  module: readFileSync(new URL("../dist/web/index_bg.wasm", import.meta.url)),
})

function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error("expected the call to throw")
}

function attempt(fn: () => unknown) {
  try {
    fn()
  } catch {
    // Only the calls after this one matter here.
  }
}

describe.each([
  ["node", node],
  ["web", web],
] as const)("%s build after a WebAssembly trap", (_build, parser) => {
  it("parses valid Candid after deeply nested input", () => {
    attempt(() => parser.parseDid(DEEPLY_NESTED))

    expect(parser.didToJs(VALID)).toBe(EXPECTED_JS)
  })

  it("parses valid Candid after a long comment run failed twice", () => {
    // The second attempt started from the stack pointer the first one left.
    attempt(() => parser.didToJs(LONG_COMMENT_RUN))
    attempt(() => parser.didToJs(LONG_COMMENT_RUN))

    expect(parser.didToJs(VALID)).toBe(EXPECTED_JS)
  })

  it("parses valid Candid after repeated panics", () => {
    // Each panic leaked a little stack until none was left.
    for (let i = 0; i < 2000; i++) {
      attempt(() => parser.didToJs(INVALID_BYTE_ESCAPE))
    }

    expect(parser.didToJs(VALID)).toBe(EXPECTED_JS)
  })

  it("throws a readable error that keeps the original as its cause", () => {
    const trapped = thrownBy(() => parser.parseDid(DEEPLY_NESTED))
    expect(trapped).toBeInstanceOf(Error)
    expect((trapped as Error).message).toMatch(READABLE_ERROR)
    expect((trapped as { cause?: unknown }).cause).toBeInstanceOf(
      WebAssembly.RuntimeError
    )

    const overflowed = thrownBy(() => parser.didToJs(LONG_COMMENT_RUN))
    expect((overflowed as Error).message).toMatch(READABLE_ERROR)
    expect((overflowed as { cause?: unknown }).cause).toBeInstanceOf(RangeError)
  })

  it("recovers in every exported function", () => {
    const functions = Object.entries(parser).filter(
      ([name, value]) =>
        typeof value === "function" && name !== "default" && name !== "initSync"
    ) as [string, (...args: string[]) => unknown][]
    expect(functions.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "didToJs",
        "didToTs",
        "parseDid",
        "validateIDL",
        "verifyCompatability",
      ])
    )

    for (const [name, fn] of functions) {
      const args = Array<string>(fn.length).fill(INVALID_BYTE_ESCAPE)
      expect(() => fn(...args), name).toThrow(READABLE_ERROR)
      attempt(() => fn(...Array<string>(fn.length).fill(LONG_COMMENT_RUN)))

      expect(parser.didToJs(VALID), name).toBe(EXPECTED_JS)
    }
  })

  it("reports a failed restart and tries again on the next call", () => {
    const failure = new Error("cannot create an instance here")
    const createInstance = vi
      .spyOn(WebAssembly, "Instance")
      .mockImplementationOnce(function () {
        throw failure
      })
    try {
      expect(thrownBy(() => parser.parseDid(DEEPLY_NESTED))).toBe(failure)
    } finally {
      createInstance.mockRestore()
    }

    // The broken instance is still in place, so this call fails as well, and
    // this time the restart succeeds.
    expect(() => parser.didToJs(VALID)).toThrow(READABLE_ERROR)
    expect(parser.didToJs(VALID)).toBe(EXPECTED_JS)
  })

  it("passes ordinary parse errors through unchanged", () => {
    // Invalid Candid is reported by the parser itself, as a string, and does
    // not replace the instance.
    const thrown = thrownBy(() => parser.didToJs("service : {"))
    expect(typeof thrown).toBe("string")
    expect(thrown).toMatch(/Candid parser error/)
  })
})
