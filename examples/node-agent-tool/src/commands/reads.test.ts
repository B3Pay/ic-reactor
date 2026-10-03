// Scenario 4: direct calls, `info` and `balance`, plain and certified.
import { principal } from "@candid-core/schema"
import { describe, expect, it } from "vitest"
import { createCli } from "../test-kit.ts"

const OWNER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const SUBACCOUNT = "01".repeat(32)

const methodsBy = (
  requests: readonly { endpoint: string; methodName?: string }[],
  endpoint: string
) =>
  requests
    .filter((r) => r.endpoint === endpoint)
    .map((r) => r.methodName)
    .sort()

describe("info", () => {
  const { cli } = createCli({
    ledger: { balances: [[OWNER, 123_456_789_000n]] },
  })

  it("reads five values in parallel, as plain queries", async () => {
    const result = await cli(["info"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toEqual([
      "ledger        icp ryjl3-tyaaa-aaaaa-aaaba-cai on ic",
      "name          Internet Computer (mock)",
      "symbol        ICP",
      "decimals      8",
      "fee           0.0001 ICP (10000 base units)",
      "total supply  1234.56789 ICP",
      "reads         5 queries in parallel, not certified (--certified to certify them)",
    ])
    expect(methodsBy(result.requests, "query")).toEqual([
      "icrc1_decimals",
      "icrc1_fee",
      "icrc1_name",
      "icrc1_symbol",
      "icrc1_total_supply",
    ])
    expect(methodsBy(result.requests, "call")).toEqual([])
  })

  it("sends them as replicated calls with --certified, and says so", async () => {
    const result = await cli(["info", "--certified", "--json"])
    expect(result.docs).toEqual([
      {
        ok: true,
        command: "info",
        network: "ic",
        ledger: { id: "ryjl3-tyaaa-aaaaa-aaaba-cai", name: "icp" },
        name: "Internet Computer (mock)",
        symbol: "ICP",
        decimals: 8,
        fee: { units: "10000", tokens: "0.0001" },
        totalSupply: { units: "123456789000", tokens: "1234.56789" },
        reads: {
          icrc1_name: "certified",
          icrc1_symbol: "certified",
          icrc1_decimals: "certified",
          icrc1_fee: "certified",
          icrc1_total_supply: "certified",
        },
      },
    ])
    expect(methodsBy(result.requests, "query")).toEqual([])
    expect(methodsBy(result.requests, "call")).toHaveLength(5)
  })
})

describe("balance", () => {
  const { cli, ledger } = createCli({
    ledger: { balances: [[OWNER, 150_000_000n]] },
  })
  ledger.credit({ owner: OWNER, subaccount: new Uint8Array(32).fill(1) }, 7n)

  it("reads the balance with formatUnits, as a plain query", async () => {
    const result = await cli(["balance", OWNER])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toEqual([
      `account  ${OWNER}`,
      "balance  1.5 ICP (150000000 base units)",
      "reads    plain queries, not certified (--certified to certify the balance)",
    ])
    expect(methodsBy(result.requests, "call")).toEqual([])
  })

  it("certifies the balance alone with --certified: the request log shows it", async () => {
    const result = await cli(["balance", OWNER, "--certified", "--json"])
    expect(result.docs[0]).toMatchObject({
      ok: true,
      command: "balance",
      account: { owner: OWNER, subaccount: null },
      balance: { units: "150000000", tokens: "1.5" },
      reads: {
        icrc1_balance_of: "certified",
        icrc1_decimals: "query",
        icrc1_symbol: "query",
      },
    })
    expect(methodsBy(result.requests, "call")).toEqual(["icrc1_balance_of"])
    expect(methodsBy(result.requests, "query")).toEqual([
      "icrc1_decimals",
      "icrc1_symbol",
    ])
  })

  it("reads a subaccount, written back as hex", async () => {
    const result = await cli([
      "balance",
      OWNER,
      "--subaccount",
      SUBACCOUNT,
      "--json",
    ])
    expect(result.docs[0]).toMatchObject({
      account: { owner: OWNER, subaccount: SUBACCOUNT },
      balance: { units: "7", tokens: "0.00000007" },
    })
  })

  it("refuses an owner that is not a principal, before any request (exit 2)", async () => {
    for (const argv of [
      ["balance", "alice"],
      ["balance", OWNER, "--subaccount", "abcd"],
    ]) {
      const result = await cli(argv)
      expect(result.exitCode).toBe(2)
      expect(result.requests).toEqual([])
    }
  })
})
