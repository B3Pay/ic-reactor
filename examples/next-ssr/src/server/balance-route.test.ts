// Scenario 7: the balance route's handler, called as Next calls it, over a
// test client per request.
import { afterEach, describe, expect, it, vi } from "vitest"
import { LEDGERS, NOT_A_LEDGER, NO_CANISTER, SAMPLE_OWNER } from "@/ledgers"
import {
  mockLedgers,
  requestsFor,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { balanceRoute } from "./balance-route"

const tests: MockLedgers[] = []
afterEach(() => {
  for (const test of tests.splice(0)) test.client.dispose()
})

/** The handler over a new test client per request, and those clients. */
function handler(prepare?: (test: MockLedgers) => void) {
  const newClient = vi.fn(() => {
    const test = mockLedgers()
    prepare?.(test)
    tests.push(test)
    return test.client
  })
  return { GET: balanceRoute(newClient), newClient }
}

const get = async (
  GET: ReturnType<typeof balanceRoute>,
  ledger: string,
  principal: string
) => {
  const response = await GET(
    new Request(`http://localhost/api/balance/${ledger}/${principal}`),
    { params: Promise.resolve({ ledger, principal }) }
  )
  return { status: response.status, body: (await response.json()) as unknown }
}

describe("GET /api/balance/[ledger]/[principal]", () => {
  it("answers the balance as decimal text and exact base units, with a client of its own", async () => {
    const { GET, newClient } = handler()

    const { status, body } = await get(GET, "ICP", SAMPLE_OWNER)

    expect(status).toBe(200)
    expect(body).toEqual({
      ledger: LEDGERS[0]!.id,
      owner: SAMPLE_OWNER,
      symbol: "ICP",
      decimals: 8,
      balance: "123456789012345.67890123",
      baseUnits: "12345678901234567890123",
    })
    await get(GET, "ckBTC", SAMPLE_OWNER)
    expect(newClient).toHaveBeenCalledTimes(2)
  })

  it("takes a label in any case, or a canister id", async () => {
    const { GET } = handler()

    expect((await get(GET, "cketh", SAMPLE_OWNER)).body).toMatchObject({
      ledger: LEDGERS[2]!.id,
      decimals: 18,
      balance: "12345.678901234567890123",
    })
    expect((await get(GET, LEDGERS[1]!.id, SAMPLE_OWNER)).body).toMatchObject({
      symbol: "ckBTC",
    })
  })

  it("answers 400 for a principal or a ledger it cannot read, before building a client", async () => {
    const { GET, newClient } = handler()

    const badOwner = await get(GET, "ICP", "not-a-principal")
    const badLedger = await get(GET, "DOGE", SAMPLE_OWNER)

    expect(badOwner.status).toBe(400)
    expect(badOwner.body).toMatchObject({ error: { kind: "invalid_args" } })
    expect(badLedger.status).toBe(400)
    expect(badLedger.body).toMatchObject({ error: { kind: "invalid_args" } })
    expect(newClient).not.toHaveBeenCalled()
  })

  it("maps a rejected read to 502, with the kind and reject code", async () => {
    const { GET } = handler()

    const { status, body } = await get(GET, NOT_A_LEDGER.id, SAMPLE_OWNER)

    expect(status).toBe(502)
    expect(body).toMatchObject({ error: { kind: "rejected", rejectCode: 5 } })
  })

  it.each([429, 503])(
    "maps a read turned away with HTTP %i, which passes, to 503",
    async (refusal) => {
      // A boundary node turns the balance read away every time it is sent:
      // the client re-sends a read at most twice, then gives up with
      // `not_delivered`. A fourth send would be answered, and the route would
      // answer 200.
      const { GET } = handler((test) =>
        test.refuseNext(refusal, { method: "icrc1_balance_of", times: 3 })
      )

      const { status, body } = await get(GET, "ICP", SAMPLE_OWNER)

      expect(status).toBe(503)
      expect(body).toMatchObject({
        error: { kind: "not_delivered", httpStatus: refusal },
      })
      expect(tests[0] && requestsFor(tests[0], "icrc1_balance_of").length).toBe(
        3
      )
    }
  )

  it("maps a read refused with an HTTP 4xx that stands to 502, since asking again cannot help", async () => {
    // A boundary node answers HTTP 400 for a canister id that names no
    // canister, or a request it cannot accept, however often it is asked: here
    // it turns the balance read away each of the three times a read could be
    // sent. The client does not re-send a 4xx, and neither should the route's
    // caller.
    const { GET } = handler((test) =>
      test.refuseNext(400, { method: "icrc1_balance_of", times: 3 })
    )

    const { status, body } = await get(GET, "ICP", SAMPLE_OWNER)

    expect(status).toBe(502)
    expect(body).toMatchObject({
      error: { kind: "not_delivered", httpStatus: 400 },
    })
    expect(tests[0] && requestsFor(tests[0], "icrc1_balance_of").length).toBe(1)
  })

  it("maps a canister that does not exist to 502, with code canister_not_found", async () => {
    // For this id, outside every subnet's range, mainnet answers HTTP 400
    // `canister_not_found` (`kind: "not_delivered"`); the fake replica rejects
    // with code 3 and IC0301 (`kind: "rejected"`), as a mainnet replica does
    // for an id inside its range that holds no canister. All say
    // `code: "canister_not_found"`, and all are a 502.
    const { GET } = handler()

    const { status, body } = await get(GET, NO_CANISTER, SAMPLE_OWNER)

    expect(status).toBe(502)
    expect(body).toMatchObject({
      error: { kind: "rejected", rejectCode: 3, code: "canister_not_found" },
    })
  })
})
