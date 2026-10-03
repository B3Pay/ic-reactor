// Scenario 8: what a section shows of a failure is read from the
// `ReactorError` on the server; anything else is this app's bug, and thrown.
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "@/canisters/icrc1"
import { NOT_A_LEDGER } from "@/ledgers"
import { mockLedgers, type MockLedgers } from "@/testing/mock-ledgers"
import { summarizeError } from "./error-summary"

let test: MockLedgers
afterEach(() => test.client.dispose())

describe("summarizeError", () => {
  it("reads the kind and reject code of a ReactorError", async () => {
    test = mockLedgers()
    const notALedger = test.client.canister<Actor>(actor, {
      id: NOT_A_LEDGER.id,
    })

    const error = await notALedger.icrc1_name().catch((e: unknown) => e)

    expect(summarizeError(error)).toEqual({
      kind: "rejected",
      rejectCode: 5,
      message: expect.stringContaining("icrc1_name"),
    })
  })

  it("throws anything that is not a ReactorError", () => {
    test = mockLedgers()
    const bug = new TypeError("a bug of the app")

    expect(() => summarizeError(bug)).toThrow(bug)
  })
})
