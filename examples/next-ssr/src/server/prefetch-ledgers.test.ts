// Scenarios 1, 3 and 8 on the server: the prefetch reads into the client it is
// given and only that one, as the anonymous caller, by `{ id }`; its
// dehydrated cache survives JSON exactly; a ledger that fails is reported and
// left out, and the rest are not.
import { isPrincipal } from "@candid-core/schema"
import { dehydrate, hydrate, type QueryKey } from "@tanstack/react-query"
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "@/canisters/icrc1"
import { LEDGERS, NOT_A_LEDGER } from "@/ledgers"
import {
  ANONYMOUS,
  mockLedgers,
  tokenOf,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { prefetchLedgers, TOKEN_READS } from "./prefetch-ledgers"

const clients: MockLedgers[] = []
const newRequest = () => {
  const test = mockLedgers()
  clients.push(test)
  return test
}
afterEach(() => {
  for (const test of clients.splice(0)) test.client.dispose()
})

describe("prefetchLedgers", () => {
  it("reads every token read of every ledger, by id, as the anonymous caller", async () => {
    const server = newRequest()

    const { state, failures } = await prefetchLedgers(server.client, LEDGERS)

    expect(failures).toEqual({})
    const reads = server.requests.filter(({ endpoint }) => endpoint === "query")
    expect(reads).toHaveLength(LEDGERS.length * TOKEN_READS.length)
    expect(new Set(reads.map(({ caller }) => caller))).toEqual(
      new Set([ANONYMOUS])
    )
    expect(new Set(reads.map(({ canisterId }) => canisterId))).toEqual(
      new Set(LEDGERS.map(({ id }) => id))
    )
    // Every query was dehydrated, keyed by network and caller.
    expect(state.queries).toHaveLength(reads.length)
    for (const query of state.queries) {
      expect(query.state.status).toBe("success")
      expect(query.queryKey.slice(0, 3)).toEqual([
        "ic-reactor",
        "ic",
        ANONYMOUS,
      ])
    }
  })

  it("fills only the client it is given: each request's client starts empty", async () => {
    const first = newRequest()
    const second = newRequest()

    await prefetchLedgers(first.client, LEDGERS)

    expect(second.client.queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(second.requests).toHaveLength(0)
    const { state } = await prefetchLedgers(second.client, LEDGERS)
    expect(state.queries).toHaveLength(LEDGERS.length * TOKEN_READS.length)
    expect(second.requests.length).toBe(first.requests.length)
  })

  it("dehydrates to JSON that hydrates into another client exactly, with nothing fetched", async () => {
    const server = newRequest()
    const { state } = await prefetchLedgers(server.client, LEDGERS)

    // What the page hands the browser is JSON: through React's payload, or
    // any other channel.
    const json = JSON.stringify(state)
    const browser = newRequest()
    hydrate(browser.client.queryClient, JSON.parse(json))

    for (const ref of LEDGERS) {
      const token = tokenOf(ref)
      const ledger = browser.client.canister<Actor>(actor, { id: ref.id })
      // The browser finds each value under the key its own options build.
      const { queryClient } = browser.client
      const cached = <K extends QueryKey>(options: { queryKey: K }) =>
        queryClient.getQueryData(options.queryKey)
      const read = browser.client.queryOptions

      const supply = cached(read(ledger, "icrc1_total_supply"))
      expect(typeof supply).toBe("bigint")
      expect(supply).toBe(token.supply) // 2^70 + i: past 2^53
      expect(cached(read(ledger, "icrc1_fee"))).toBe(token.fee)
      expect(cached(read(ledger, "icrc1_decimals"))).toBe(token.decimals)

      const minter = cached(read(ledger, "icrc1_minting_account"))
      expect(minter?.owner).toBe(token.minter.owner)
      expect(isPrincipal(minter?.owner)).toBe(true)
      expect(minter?.subaccount).toBeInstanceOf(Uint8Array)
      expect(minter?.subaccount).toStrictEqual(token.minter.subaccount)

      expect(cached(read(ledger, "icrc1_metadata"))).toStrictEqual([
        ["icrc1:fee", { tag: "Nat", value: token.fee }],
        ["test:int", { tag: "Int", value: -(2n ** 64n) }],
        ["test:blob", { tag: "Blob", value: token.blob }],
      ])
    }
    expect(browser.requests).toHaveLength(0)
  })

  it("needs the client's serializer: the raw cache is not JSON", async () => {
    const server = newRequest()
    await prefetchLedgers(server.client, LEDGERS)

    // Without the client's dehydrate defaults, the bigints stay bigints.
    const raw = dehydrate(server.client.queryClient, {
      serializeData: (data: unknown) => data,
    })
    expect(() => JSON.stringify(raw)).toThrow(TypeError)
  })

  it("reports a canister that is not a ledger, leaves it out, and keeps the others", async () => {
    const server = newRequest()

    const { state, failures } = await prefetchLedgers(server.client, [
      ...LEDGERS,
      NOT_A_LEDGER,
    ])

    expect(Object.keys(failures)).toEqual([NOT_A_LEDGER.id])
    expect(failures[NOT_A_LEDGER.id]).toMatchObject({
      kind: "rejected",
      rejectCode: 5,
    })
    const dehydratedIds = new Set(
      state.queries.map(({ queryKey }) => queryKey[3])
    )
    expect(dehydratedIds).toEqual(new Set(LEDGERS.map(({ id }) => id)))
  })
})
