// @vitest-environment jsdom
//
// A card whose reads fail in the tab. The server's render never shows such a
// card (a ledger whose server reads failed gets its error section, scenario
// 8), but a card reads everything again in the tab after a sign-in, and any of
// those reads can fail there. Each failed read's row shows the failure's
// kind, and once every read has settled the card no longer says it is
// reading.
import { ReactorProvider } from "@ic-reactor/react"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { actor, type Actor } from "@/canisters/icrc1"
import { LEDGERS, NOT_A_LEDGER, type LedgerRef } from "@/ledgers"
import { TOKEN_READS } from "@/server/prefetch-ledgers"
import {
  ledgerHandlers,
  mockLedgers,
  requestsFor,
  SEED_1,
  tokenOf,
  type MockLedgers,
} from "@/testing/mock-ledgers"
import { LedgerCard } from "./LedgerCard"

const ICP = LEDGERS[0]!
let test: MockLedgers
afterEach(() => {
  cleanup()
  test.client.dispose()
})

/** A card in a signed-in tab with an empty cache: it reads everything as seed 1. */
function renderCard(ledger: LedgerRef) {
  return render(
    <ReactorProvider client={() => test.client}>
      <LedgerCard ledger={ledger} />
    </ReactorProvider>
  )
}

const readText = (container: HTMLElement, method: string) =>
  container.querySelector(`[data-read="${method}"]`)?.textContent
const originText = (container: HTMLElement) =>
  container.querySelector("[data-origin]")?.textContent

describe("a ledger card whose reads fail in the tab", () => {
  it("shows the kind of the failed read in its row, and the other reads", async () => {
    test = mockLedgers({ signedIn: true })
    const token = tokenOf(ICP)
    test.mock<Actor>(actor, ICP.id, {
      ...ledgerHandlers(token),
      // A handler that throws traps the call: reject code 5.
      icrc1_symbol: () => {
        throw new Error("symbol trapped")
      },
    })

    const { container } = renderCard(ICP)

    await waitFor(() => {
      expect(readText(container, "icrc1_symbol")).toBe("rejected")
      expect(readText(container, "icrc1_decimals")).toBe(
        `${token.decimals} number`
      )
      // Without a symbol, amounts are shown in base units.
      expect(readText(container, "icrc1_fee")).toBe(
        `${token.fee} base units bigint`
      )
    })
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /^rejected: /
    )
    expect(originText(container)).toMatch(
      new RegExp(`^Read again in this tab, as ${SEED_1}, at `)
    )
  })

  it("says every read failed, not that it is reading, for a canister that answers none", async () => {
    test = mockLedgers({ signedIn: true })

    const { container } = renderCard(NOT_A_LEDGER)

    await waitFor(() => {
      for (const method of TOKEN_READS) {
        expect(readText(container, method)).toBe("rejected")
      }
    })
    expect(originText(container)).toMatch(
      new RegExp(`^Every read failed in this tab, as ${SEED_1}\\.`)
    )
    // Each read was asked once: a trap is not retried.
    for (const method of TOKEN_READS) {
      expect(requestsFor(test, method)).toHaveLength(1)
    }
  })
})
