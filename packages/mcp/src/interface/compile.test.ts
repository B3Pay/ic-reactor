// The compile steps over the real compiler, in its worker (offline).
import { readFile } from "node:fs/promises"
import { serviceMethods } from "@meantjs/schema"
import { afterAll, describe, expect, it } from "vitest"
import {
  compileInterface,
  MAX_DID_BYTES,
  MAX_METHODS,
  projectionOf,
  tooLarge,
  type CompiledInterface,
} from "./compile.ts"
import { createWorkerCli } from "./compile-worker.ts"

const icrc1Did = await readFile(
  new URL("./fixtures/icrc1.did", import.meta.url),
  "utf8"
)

const cli = createWorkerCli()
afterAll(() => cli.close())

async function compiled(did: string): Promise<CompiledInterface> {
  const result = await compileInterface(cli, did)
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`)
  return result
}

describe("compileInterface", () => {
  it("compiles a .did to its service schema, methods in name order with their docs", async () => {
    const result = await compiled(`
      service : {
        /// Says hello.
        greet : (name : text) -> (text) query;
        count : () -> (nat);
        peek : () -> (nat) composite_query;
      }
    `)
    expect(result.interfaceId).toMatch(
      /^candid-core:interface:v1:sha256:[0-9a-f]{64}$/
    )
    expect([...serviceMethods(result.actor).keys()].sort()).toEqual([
      "count",
      "greet",
      "peek",
    ])
    expect([...result.methods.keys()]).toEqual(["count", "greet", "peek"])
    const greet = result.methods.get("greet")
    expect(greet).toMatchObject({
      name: "greet",
      mode: "query",
      doc: "Says hello.",
    })
    expect(greet?.args).toHaveLength(1)
    expect(greet?.results).toHaveLength(1)
    expect(result.methods.get("count")).not.toHaveProperty("doc")
    expect(result.methods.get("peek")?.mode).toBe("composite_query")
    expect(result.omitted).toEqual([])
  })

  it("takes a service class's methods, and gives the same interface id for the same .did", async () => {
    const a = await compiled(icrc1Did)
    const b = await compiled(`${icrc1Did}\n// a comment changes no identity\n`)
    expect(a.methods.size).toBe(10)
    expect(a.methods.get("icrc1_transfer")?.mode).toBe("update")
    expect(b.interfaceId).toBe(a.interfaceId)
  })

  it("orders methods by code point, not by UTF-16 code unit", async () => {
    const result = await compiled(
      'service : { "\u{1F600}" : () -> (); "Ａ" : () -> (); a : () -> () }'
    )
    // U+FF21 sorts before U+1F600, whose first code unit (0xD83D) is lower.
    expect([...result.methods.keys()]).toEqual(["a", "Ａ", "\u{1F600}"])
  })

  it("reports what the schema loader left out, and why", async () => {
    const result = await compiled(
      "type T = record { _1_ : nat }; service : { m : (T) -> (); n : () -> () }"
    )
    expect([...result.methods.keys()]).toEqual(["n"])
    expect(result.omitted).toEqual([
      { kind: "declaration", name: "T", reason: "reserved_field_name" },
      { kind: "method", name: "m", reason: "references_omitted", via: "T" },
    ])
  })

  it("counts the cap in UTF-8 bytes", () => {
    const fits = "é".repeat(MAX_DID_BYTES / 2)
    expect(tooLarge(fits)).toBeUndefined()
    expect(tooLarge(`${fits}x`)).toMatchObject({ code: "too_large" })
  })

  it("refuses an interface of more than MAX_METHODS methods as too large", async () => {
    const service = (n: number) =>
      `service : {${Array.from({ length: n }, (_, i) => `m${i} : () -> ();`).join("")}}`
    expect(await compileInterface(cli, service(MAX_METHODS))).toMatchObject({
      ok: true,
    })
    expect(await compileInterface(cli, service(MAX_METHODS + 1))).toMatchObject(
      {
        ok: false,
        code: "too_large",
        message: `The interface has ${MAX_METHODS + 1} methods; the server loads at most ${MAX_METHODS}.`,
      }
    )
  })

  it("keeps a hostile method name as data", async () => {
    const result = await compiled(
      'service : { "__proto__" : () -> (); "<img src=x onerror=alert(1)>" : () -> () query }'
    )
    expect([...result.methods.keys()]).toEqual([
      "<img src=x onerror=alert(1)>",
      "__proto__",
    ])
    expect(Object.getPrototypeOf(result.methods.get("__proto__"))).toBe(
      Object.prototype
    )
  })

  it("returns the compiler's diagnostics for a .did that does not compile", async () => {
    const result = await compileInterface(cli, "service : { broken")
    expect(result).toMatchObject({ ok: false, code: "compile_failed" })
    if (result.ok) return
    expect(result.diagnostics?.[0]?.code).toBe("did_parse_error")
  })

  it("says no_interface for a .did without a service", async () => {
    expect(await compileInterface(cli, "type T = nat;")).toMatchObject({
      ok: false,
      code: "no_interface",
    })
  })
})

describe("projectionOf", () => {
  it("projects onto the methods named, in name order", async () => {
    const result = await projectionOf(cli, icrc1Did, [
      "icrc1_transfer",
      "icrc1_balance_of",
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.methods).toEqual(["icrc1_balance_of", "icrc1_transfer"])
    expect(result.did).toContain("icrc1_transfer")
    expect(result.did).not.toContain("icrc1_symbol")
  })

  it("names an unknown method", async () => {
    const result = await projectionOf(cli, icrc1Did, ["no_such_method"])
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/unknown_method/)
  })
})
