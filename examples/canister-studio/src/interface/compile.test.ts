// @vitest-environment node
// The compile steps the server functions and the browser share, over the
// real compiler (offline).
import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import icpLedgerDid from "../../did/icp_ledger.did?raw"
import icrc1Did from "../../did/icrc1.did?raw"
import {
  compatibilityOf,
  compileInterface,
  MAX_DID_BYTES,
  MAX_METHODS,
  moduleOf,
  projectionOf,
  tooLarge,
} from "./compile.ts"
import { serverCli } from "./compile.server.ts"

describe("moduleOf", () => {
  it("writes exactly the committed module for a registry .did", async () => {
    const committed = await readFile(
      new URL("../canisters/icp_ledger.ts", import.meta.url),
      "utf8"
    )
    const result = await moduleOf(serverCli, icpLedgerDid)
    expect(result).toEqual({ ok: true, module: committed, omitted: [] })
  })

  it("says why a .did does not generate", async () => {
    const result = await moduleOf(serverCli, "service : {")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/did_parse_error/)
  })
})

describe("projectionOf", () => {
  it("projects onto the methods named, in name order", async () => {
    const result = await projectionOf(serverCli, icrc1Did, [
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
    const result = await projectionOf(serverCli, icrc1Did, ["no_such_method"])
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.message).toMatch(/unknown_method/)
  })
})

describe("compatibilityOf", () => {
  it("finds the ICRC-1 .did compatible with the ICP ledger's", async () => {
    const report = await compatibilityOf(serverCli, icrc1Did, icpLedgerDid)
    expect(report).toMatchObject({ ok: true, compatible: true })
  })

  it("reports a missing method as incompatible", async () => {
    const report = await compatibilityOf(
      serverCli,
      "service : { gone : () -> (nat) query }",
      icrc1Did
    )
    expect(report).toMatchObject({ ok: true, compatible: false })
    if (report.ok) expect(report.diagnostics[0]?.code).toBe("method_missing")
  })

  it("says which side did not compile", async () => {
    const report = await compatibilityOf(serverCli, "service : {", icrc1Did)
    expect(report.ok).toBe(false)
    if (!report.ok) expect(report.message).toMatch(/written/)
  })
})

describe("compileInterface", () => {
  it("counts the cap in UTF-8 bytes", () => {
    const fits = "é".repeat(MAX_DID_BYTES / 2)
    expect(tooLarge(fits)).toBeUndefined()
    expect(tooLarge(`${fits}x`)).toMatchObject({ code: "too_large" })
  })

  it("refuses an interface of more than MAX_METHODS methods as too large", async () => {
    const service = (n: number) =>
      `service : {${Array.from({ length: n }, (_, i) => `m${i} : () -> ();`).join("")}}`
    expect(
      await compileInterface(serverCli, service(MAX_METHODS))
    ).toMatchObject({ ok: true })
    expect(
      await compileInterface(serverCli, service(MAX_METHODS + 1))
    ).toMatchObject({
      ok: false,
      code: "too_large",
      message: `The interface has ${MAX_METHODS + 1} methods; the studio loads at most ${MAX_METHODS}.`,
    })
  })

  it("keeps a hostile method name as data", async () => {
    const result = await compileInterface(
      serverCli,
      'service : { "__proto__" : () -> (); "<img src=x onerror=alert(1)>" : () -> () query }'
    )
    expect(result.ok).toBe(true)
  })
})
