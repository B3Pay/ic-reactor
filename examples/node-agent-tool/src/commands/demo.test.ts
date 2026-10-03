// Scenario 8: the narrated demo runs to the end, every step as it says.
import { describe, expect, it } from "vitest"
import { createCli } from "../test-kit.ts"

describe("demo", () => {
  it("runs every step, and each ends as expected", async () => {
    const { cli } = createCli()
    const result = await cli(["demo"])
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toEqual([])
    const text = result.stdout.join("\n")
    for (const title of [
      "[1/10] Who calls",
      "[2/10] A transfer",
      "[3/10] The ledger says no",
      "[4/10] The reply is lost",
      "[5/10] The same transfer, sent again",
      "[6/10] Lost again, with --resend-unknown",
      "[7/10] Throttled once (HTTP 429)",
      "[8/10] The canister rejects (reject code 4)",
      "[9/10] Nobody signed in",
      "[10/10] Input that cannot be sent",
    ]) {
      expect(text).toContain(title)
    }
    expect(text).not.toContain("NOT AS EXPECTED")
    expect(text).toContain(
      "call icrc1_transfer (refused: refuseNext(429) answered the request with HTTP 429), call icrc1_transfer"
    )
    expect(text).toContain("call icrc1_transfer (reply lost)")
    expect(result.stdout.at(-1)).toBe("demo: all 10 steps ended as expected.")
  })

  it("--json: a document per step, then a summary", async () => {
    const { cli } = createCli()
    const result = await cli(["demo", "--json"])
    expect(result.exitCode).toBe(0)
    expect(result.docs).toHaveLength(11)
    expect(result.docs.slice(0, 10).map((doc) => doc.asExpected)).toEqual(
      Array.from({ length: 10 }, () => true)
    )
    expect(result.docs.at(-1)).toEqual({ ok: true, command: "demo", steps: 10 })
  })

  it("takes no network, ledger or key: it brings its own", async () => {
    const { cli } = createCli()
    const result = await cli(["demo", "--network", "local"])
    expect(result.exitCode).toBe(2)
    expect(result.options).toBeUndefined()
  })
})
