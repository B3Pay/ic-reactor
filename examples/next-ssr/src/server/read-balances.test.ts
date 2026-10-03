// Scenarios 5 and 6 on the server: the /account page's reads. Plain reads are
// queries; certified ones are replicated calls with keys of their own; a
// failing ledger costs one row; and one request reads a ledger's decimals and
// symbol once, whichever section asks.
import { principal } from "@candid-core/schema"
import { formatUnits } from "@ic-reactor/core"
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "@/canisters/icrc1"
import { LEDGERS, NOT_A_LEDGER, SAMPLE_OWNER } from "@/ledgers"
import {
  BALANCES,
  mockLedgers,
  requestsFor,
  tokenOf,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { readBalances } from "./read-balances"

const OWNER = principal(SAMPLE_OWNER)
const EXPECTED = BALANCES.get(OWNER) ?? 0n

let server: MockLedgers
afterEach(() => server.client.dispose())

describe("readBalances", () => {
  it("reads the owner's balance, decimals and symbol on every ledger, as queries", async () => {
    server = mockLedgers()

    const rows = await readBalances(server.client, OWNER, LEDGERS)

    expect(rows).toEqual(
      LEDGERS.map((ledger) => ({
        ledger,
        ok: true,
        balance: EXPECTED,
        decimals: tokenOf(ledger).decimals,
        symbol: tokenOf(ledger).symbol,
      }))
    )
    const balances = requestsFor(server, "icrc1_balance_of")
    expect(balances.map(({ endpoint }) => endpoint)).toEqual(
      LEDGERS.map(() => "query")
    )
    // Exact past 2^53: 12345678901234567890123 base units.
    expect(formatUnits(EXPECTED, 8)).toBe("123456789012345.67890123")
  })

  it("certified, sends every read as a replicated call and caches it under its own keys", async () => {
    server = mockLedgers()

    const rows = await readBalances(server.client, OWNER, LEDGERS, {
      certified: true,
    })

    expect(rows.every((row) => row.ok)).toBe(true)
    for (const method of [
      "icrc1_balance_of",
      "icrc1_decimals",
      "icrc1_symbol",
    ]) {
      expect(
        requestsFor(server, method).map(({ endpoint }) => endpoint)
      ).toEqual(LEDGERS.map(() => "call"))
    }
    const ledger = server.client.canister<Actor>(actor, {
      id: LEDGERS[0]!.id,
      certified: true,
    })
    const key = server.client.queryOptions(ledger, "icrc1_balance_of", {
      owner: OWNER,
      subaccount: null,
    }).queryKey
    expect(key.at(-1)).toBe("certified")
    expect(server.client.queryClient.getQueryData(key)).toBe(EXPECTED)
  })

  it("gives a failing ledger a row with its kind, and the others their balances", async () => {
    server = mockLedgers()

    const rows = await readBalances(server.client, OWNER, [
      ...LEDGERS,
      NOT_A_LEDGER,
    ])

    expect(rows.slice(0, LEDGERS.length).every((row) => row.ok)).toBe(true)
    expect(rows.at(-1)).toMatchObject({
      ledger: NOT_A_LEDGER,
      ok: false,
      error: { kind: "rejected", rejectCode: 5 },
    })
  })

  it("reads decimals and symbol once per request, however many sections ask", async () => {
    server = mockLedgers()

    // The page's section and a second one in the same request.
    await readBalances(server.client, OWNER, LEDGERS)
    await readBalances(server.client, OWNER, LEDGERS)

    expect(requestsFor(server, "icrc1_decimals")).toHaveLength(LEDGERS.length)
    expect(requestsFor(server, "icrc1_symbol")).toHaveLength(LEDGERS.length)
  })
})
