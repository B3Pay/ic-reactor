// The wallet's transfer and deposit-address flows over the in-memory
// replica, with the form and the viewers stood in for (calls/testing):
// what reaches the history, and what the panels say after an unknown
// outcome.
import { principal } from "@meantjs/schema"
import { encodeArgs } from "@meantjs/schema/codec"
import { ReactorProvider } from "@ic-reactor/react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  HISTORY_STORAGE_KEY,
  clearHistory,
  parseHistory,
} from "../../calls/history.ts"
import { formDouble } from "../../calls/testing/doubles.tsx"
import {
  CKBTC_LEDGER,
  CKBTC_MINTER,
  SEED_1,
  SEED_2,
  createTestLedger,
  transferArg,
  type TestLedger,
} from "../../calls/testing/fixtures.ts"
import type { Actor as Minter } from "../../canisters/ckbtc_minter.ts"
import type { Actor as Ledger } from "../../canisters/icrc1.ts"
import { toHex } from "../../lib/hex.ts"
import {
  CKBTC_MINTER as MINTER_ENTRY,
  WALLET_LEDGERS,
  minterInterface,
} from "./ledgers.ts"
import { MinterPanel } from "./MinterPanel.tsx"
import { SendPanel } from "./SendPanel.tsx"

vi.mock(
  "../../forms/MethodForm.tsx",
  () => import("../../calls/testing/doubles.tsx")
)
vi.mock(
  "../../values/ReplyView.tsx",
  () => import("../../calls/testing/doubles.tsx")
)
vi.mock(
  "../../values/candid-text.ts",
  () => import("../../calls/testing/doubles.tsx")
)

const patiently = { timeout: 10_000 }
const BOB = principal("aaaaa-aa")
const TOKEN = { name: "ckBTC", symbol: "ckBTC", decimals: 8, fee: 10n }

let ledger: TestLedger | undefined
beforeEach(() => {
  localStorage.clear()
  clearHistory()
  formDouble.next = []
  formDouble.last = undefined
})
afterEach(() => {
  cleanup()
  ledger?.test.client.dispose()
  ledger = undefined
})

function renderWith(made: TestLedger, child: ReactElement): void {
  ledger = made
  render(
    <ReactorProvider client={() => made.test.client}>{child}</ReactorProvider>
  )
}

function renderSendPanel(made: TestLedger): void {
  expect(WALLET_LEDGERS.ckbtc.id).toBe(CKBTC_LEDGER)
  renderWith(made, <SendPanel entry={WALLET_LEDGERS.ckbtc} token={TOKEN} />)
}

const history = () => parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

/** A transfer as the real form submits it: created_at_time set. */
const stamped = (amount: bigint, at: bigint) => ({
  ...transferArg(BOB, amount),
  created_at_time: at,
})

/** Reviews and sends a transfer whose reply is lost. */
async function sendLosingTheReply(made: TestLedger, at = 1n) {
  formDouble.next = [stamped(100n, at)]
  click("Review transfer")
  made.test.dropNextReply()
  click("Send update")
  await screen.findByText("MAY HAVE EXECUTED", {}, patiently)
}

describe("SendPanel", () => {
  it("records each transfer and re-send in the history, with its exact bytes", async () => {
    const made = createTestLedger()
    made.setBalance(SEED_1, 1_000n)
    renderSendPanel(made)
    formDouble.next = [stamped(100n, 1n)]
    click("Review transfer")
    const hex =
      within(screen.getByRole("region", { name: /Confirm/ })).getByText(
        /^4449444c/
      ).textContent ?? ""
    made.test.dropNextReply()
    click("Send update")
    await screen.findByText("MAY HAVE EXECUTED", {}, patiently)
    await waitFor(() => expect(history()).toHaveLength(1))
    expect(history()[0]).toMatchObject({
      canisterId: CKBTC_LEDGER,
      method: "icrc1_transfer",
      mode: "update",
      caller: SEED_1,
      argsHex: hex,
      outcome: "error",
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })

    click("Re-send the same transfer")
    await screen.findByText("It had already executed", {}, patiently)
    await waitFor(() => expect(history()).toHaveLength(2))
    expect(history()[0]).toMatchObject({
      argsHex: hex,
      outcome: "canister_err",
      summary: 're-send: Err: {tag: "Duplicate", value: {duplicate_of: 0}}',
    })
  })

  it("reads back the sender's account, not the new caller's, after a switch", async () => {
    const made = createTestLedger()
    made.setBalance(SEED_1, 1_000n)
    made.setBalance(SEED_2, 5_000n)
    renderSendPanel(made)
    await sendLosingTheReply(made)
    act(() => made.test.auth.switchTo(2))
    click("Read the balance back")
    const read = await screen.findByRole("status", { name: "Sender balance" })
    expect(read.textContent).toContain(`${SEED_1}, the transfer's sender`)
    // 1,000 - 100 - fee 10: the sender's balance after the first transfer.
    await waitFor(() => expect(read.textContent).toContain("0.0000089 ckBTC"))
  })

  it("asks again, sending nothing, when the sender changed while the confirm step was open", async () => {
    const made = createTestLedger()
    made.setBalance(SEED_1, 1_000n)
    made.setBalance(SEED_2, 1_000n)
    renderSendPanel(made)
    formDouble.next = [stamped(100n, 1n)]
    click("Review transfer")
    act(() => made.test.auth.switchTo(2))
    click("Send update")
    expect(await screen.findByText("The sender changed")).toBeTruthy()
    expect(made.transfers).toHaveLength(0)
    // Confirmed again, now for the sender it goes out as.
    click("Send update")
    await waitFor(() => expect(history()).toHaveLength(1), patiently)
    expect(made.transfers).toHaveLength(1)
    expect(history()[0]).toMatchObject({ caller: SEED_2, outcome: "ok" })
  })

  it("records a transfer that settles after the panel is gone (another tab, another page)", async () => {
    const made = createTestLedger()
    made.setBalance(SEED_1, 1_000n)
    renderSendPanel(made)
    formDouble.next = [stamped(100n, 1n)]
    click("Review transfer")
    made.test.dropNextReply()
    click("Send update")
    // Unmounted while the transfer is in flight, as switching the ledger
    // tab (SendPanel is keyed by ledger) or leaving the page does.
    cleanup()
    await waitFor(() => expect(history()).toHaveLength(1), patiently)
    expect(history()[0]).toMatchObject({
      method: "icrc1_transfer",
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    expect(made.transfers).toHaveLength(1)
  })

  it("keeps the first transfer unknown after a re-send answered TooOld, and says why", async () => {
    const made = createTestLedger()
    let calls = 0
    made.test.mock<Ledger>(WALLET_LEDGERS.ckbtc.actor, CKBTC_LEDGER, {
      icrc1_transfer: () => {
        calls += 1
        return calls === 1
          ? { tag: "Ok", value: 0n }
          : { tag: "Err", value: { tag: "TooOld" } }
      },
    })
    renderSendPanel(made)
    await sendLosingTheReply(made)
    click("Re-send the same transfer")

    await screen.findByText("The re-send ran and answered Err", {}, patiently)
    expect(
      screen.queryByText("The canister decided. Nothing is pending.")
    ).toBeNull()
    expect(screen.queryByText(/refused before anything was sent/)).toBeNull()
    expect(
      screen.getByText(
        /The canister answered the re-send TooOld, which says nothing about the first send/
      )
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Start a new, different transfer" })
    ).toBeTruthy()
  })

  it("names the unknown transfer on the confirm step of the next, different one", async () => {
    const made = createTestLedger()
    made.setBalance(SEED_1, 1_000n)
    renderSendPanel(made)
    await sendLosingTheReply(made, 1n)
    click("Start a new, different transfer")

    formDouble.next = [stamped(50n, 2n)]
    click("Review transfer")
    const confirm = screen.getByRole("region", { name: /Confirm/ })
    const warning = within(confirm).getByRole("note", {
      name: "Earlier send unknown",
    })
    expect(warning.textContent).toContain("This is a new write")
  })
})

describe("SendPanel's focus", () => {
  it("comes back to Review transfer when the form returns", async () => {
    const made = createTestLedger()
    made.setBalance(SEED_1, 1_000n)
    renderSendPanel(made)
    const review = () => screen.getByRole("button", { name: "Review transfer" })
    formDouble.next = [stamped(100n, 1n)]
    click("Review transfer")
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), {
      key: "Escape",
    })
    expect(document.activeElement).toBe(review())

    await sendLosingTheReply(made, 2n)
    screen
      .getByRole("button", { name: "Start a new, different transfer" })
      .focus()
    click("Start a new, different transfer")
    expect(document.activeElement).toBe(review())
  })
})

describe("MinterPanel", () => {
  it("asks for the deposit address again after an error, and records each ask", async () => {
    const made = createTestLedger()
    let asks = 0
    made.test.mock<Minter>(MINTER_ENTRY.actor, CKBTC_MINTER, {
      get_btc_address: (_arg, { caller }) => {
        asks += 1
        // A trap: no read retries it by itself.
        if (asks === 1) throw new Error("the minter is busy")
        return `bc1q-${caller}`
      },
    })
    renderWith(made, <MinterPanel />)
    click("Show my deposit address")
    await screen.findByText("No address", {}, patiently)
    click("Try again")
    await screen.findByText(`bc1q-${SEED_1}`, {}, patiently)
    expect(asks).toBe(2)
    await waitFor(() =>
      expect(
        history()
          .filter((e) => e.method === "get_btc_address")
          .map((e) => [e.outcome, e.kind ?? null, e.caller])
      ).toEqual([
        ["ok", null, SEED_1],
        ["error", "rejected", SEED_1],
      ])
    )
    const method = minterInterface().method("get_btc_address")
    const encoded = encodeArgs(method?.args ?? [], [
      { owner: null, subaccount: null },
    ])
    expect(encoded.ok && toHex(encoded.bytes)).toBe(history()[0]?.argsHex)
  })
})
