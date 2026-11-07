// Method docs, read from modules the real compiler writes (in its worker,
// offline).
import { readFile } from "node:fs/promises"
import { afterAll, describe, expect, it } from "vitest"
import { createWorkerCli } from "./compile-worker.ts"
import { methodDocsFromModule } from "./docs.ts"

const icrc1Did = await readFile(
  new URL("./fixtures/icrc1.did", import.meta.url),
  "utf8"
)

const cli = createWorkerCli()
afterAll(() => cli.close())

async function moduleOf(did: string): Promise<string> {
  const result = await cli.didToModule(did)
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.module
}

describe("methodDocsFromModule", () => {
  it("reads each documented method of a module didToModule wrote", async () => {
    const module = await moduleOf(`
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
    expect(methodDocsFromModule(module)).toEqual(
      new Map([
        // The generator's own `@param by` / `@param label` lines are
        // dropped; the comment's escaped `*\/` and `\@param` are read back.
        ["inc", "Adds one.\n\nA second paragraph, with */ and @param x in it."],
        ["last", "The last one."],
      ])
    )
  })

  it("reads `//` comments as docs, as the compiler does (the ckBTC minter's are)", async () => {
    const module = await moduleOf(`
      service : {
        // Section "Minter Information" {{{
        // Returns internal minter parameters.
        get_minter_info : () -> (nat) query;
        // }}} Section "Minter Information"

        get_canister_status : () -> (nat);
      }
    `)
    // A comment a blank line away from a method is not its doc.
    expect(methodDocsFromModule(module)).toEqual(
      new Map([
        [
          "get_minter_info",
          'Section "Minter Information" {{{\nReturns internal minter parameters.',
        ],
      ])
    )
  })

  it("finds none in the ICRC-1 .did, whose comments are on its types", async () => {
    expect(methodDocsFromModule(await moduleOf(icrc1Did))).toEqual(new Map())
  })

  it("reads quoted and computed member names, __proto__ like any other", () => {
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
      "  /** A one-liner. */",
      '  ["__proto__"]: (() => Promise<void>) & $.WithMode<"update">;',
      "  /**",
      "   * Constructor.",
      "   */",
      '  constructor: (() => Promise<void>) & $.WithMode<"update">;',
      '  toString: (() => Promise<void>) & $.WithMode<"update">;',
      "};",
    ].join("\n")
    expect(methodDocsFromModule(module)).toEqual(
      new Map([
        ["hello world", "Spaced."],
        ['say "hi"', "Escaped quote."],
        ["__proto__", "A one-liner."],
        ["constructor", "Constructor."],
      ])
    )
  })

  it("gives nothing for text without an Actor type", () => {
    expect(methodDocsFromModule("export const x = 1\n").size).toBe(0)
  })
})
