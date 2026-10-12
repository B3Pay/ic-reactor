// @vitest-environment node
import { describe, expect, it } from "vitest"
import minterModule from "../canisters/ckbtc_minter.ts?raw"
import icrc1Module from "../canisters/icrc1.ts?raw"
import { serverCli } from "./compile.server.ts"
import { docFor, methodDocsFromModule } from "./docs.ts"

describe("methodDocsFromModule", () => {
  it("reads each documented method of a module didToModule wrote", async () => {
    const result = await serverCli.didToModule(`
      type R = record { x : nat };
      service : {
        /// Adds one.
        ///
        /// A second paragraph, with */ and @param x in it.
        inc : (by : nat, label : text) -> (nat);
        bare : () -> () query;
        /// The last one.
        last : (R) -> (R) composite_query;
      }
    `)
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(methodDocsFromModule(result.module)).toEqual({
      // The generator's own `@param by` / `@param label` lines are dropped;
      // the comment's escaped `*\/` and `\@param` are read back.
      inc: "Adds one.\n\nA second paragraph, with */ and @param x in it.",
      last: "The last one.",
    })
  })

  it("reads the committed minter module's docs, and none from icrc1's", () => {
    const docs = methodDocsFromModule(minterModule)
    expect(docFor(docs, "get_minter_info")).toBe(
      'Section "Minter Information" {{{\nReturns internal minter parameters.'
    )
    expect(docFor(docs, "get_canister_status")).toBeUndefined()
    expect(Object.keys(docs).length).toBeGreaterThan(5)
    expect(methodDocsFromModule(icrc1Module)).toEqual({})
  })

  it("reads quoted and computed member names, and skips __proto__", () => {
    const module = [
      "export type Actor = {",
      "  /**",
      "   * Spaced.",
      "   */",
      '  "hello world": (() => Promise<void>) & $.WithMode<"update">;',
      "  /**",
      "   * Escaped quote.",
      "   */",
      '  "say \\"hi\\"": (() => Promise<void>) & $.WithMode<"query">;',
      "  /**",
      "   * Never a key.",
      "   */",
      '  ["__proto__"]: (() => Promise<void>) & $.WithMode<"update">;',
      "  /**",
      "   * Constructor.",
      "   */",
      '  constructor: (() => Promise<void>) & $.WithMode<"update">;',
      "};",
    ].join("\n")
    const docs = methodDocsFromModule(module)
    expect(docFor(docs, "hello world")).toBe("Spaced.")
    expect(docFor(docs, 'say "hi"')).toBe("Escaped quote.")
    expect(docFor(docs, "constructor")).toBe("Constructor.")
    expect(Object.hasOwn(docs, "__proto__")).toBe(false)
    expect(Object.getPrototypeOf(docs)).toBe(Object.prototype)
    // Not an own key: the prototype's `toString` is no doc.
    expect(docFor(docs, "toString")).toBeUndefined()
  })

  it("gives nothing for text without an Actor type", () => {
    expect(methodDocsFromModule("export const x = 1\n")).toEqual({})
  })
})
