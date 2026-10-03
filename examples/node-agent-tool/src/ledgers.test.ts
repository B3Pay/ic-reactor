// Scenario 3: many ledgers, one interface.
import { createTestClient } from "@ic-reactor/core/testing"
import { describe, expect, it } from "vitest"
import { UsageError } from "./input.ts"
import { LEDGERS, ledgerFrom, ledgerOn } from "./ledgers.ts"
import { createCli } from "./test-kit.ts"

describe("--ledger", () => {
  it("names the mainnet ledgers", () => {
    expect(LEDGERS).toEqual({
      icp: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      ckbtc: "mxzaz-hqaaa-aaaar-qaada-cai",
      cketh: "ss2fx-dyaaa-aaaar-qacoq-cai",
    })
    expect(ledgerFrom(undefined)).toEqual({
      id: LEDGERS.icp,
      name: "icp",
      flags: ["--ledger", "icp"],
    })
    expect(ledgerFrom("cketh").id).toBe(LEDGERS.cketh)
  })

  it("takes any canister id, and refuses what is not one", () => {
    expect(ledgerFrom("aaaaa-aa")).toEqual({
      id: "aaaaa-aa",
      name: null,
      flags: ["--ledger", "aaaaa-aa"],
    })
    expect(() => ledgerFrom("bitcoin")).toThrow(UsageError)
  })

  it("is one canister object per id, and another for certified reads", () => {
    const { client } = createTestClient()
    const icp = ledgerOn(client, LEDGERS.icp)
    expect(ledgerOn(client, LEDGERS.icp)).toBe(icp)
    expect(ledgerOn(client, LEDGERS.ckbtc)).not.toBe(icp)
    expect(ledgerOn(client, LEDGERS.icp, true)).not.toBe(icp)
    client.dispose()
  })

  it.each(["ckbtc", "cketh"] as const)(
    "sends every call of --ledger %s to that ledger",
    async (name) => {
      const { cli } = createCli({
        ledger: {
          id: LEDGERS[name],
          symbol: name,
          decimals: name === "cketh" ? 18 : 8,
        },
      })
      const result = await cli(["info", "--ledger", name, "--json"])
      expect(result.exitCode).toBe(0)
      expect(result.docs[0]).toMatchObject({
        ledger: { id: LEDGERS[name], name },
        symbol: name,
      })
      expect(result.requests).toHaveLength(5)
      expect(new Set(result.requests.map((r) => r.canisterId))).toEqual(
        new Set([LEDGERS[name]])
      )
    }
  )

  it("reports a canister that is not there as a rejected read (exit 7)", async () => {
    const { cli } = createCli()
    const result = await cli(["info", "--ledger", LEDGERS.ckbtc, "--json"])
    expect(result.exitCode).toBe(7)
    expect(result.docs[0]).toMatchObject({
      ok: false,
      kind: "rejected",
      mayHaveExecuted: false,
    })
  })
})
