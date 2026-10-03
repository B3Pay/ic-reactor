// Scenario 5: sending ICP, as a person does it, with the ledger mocked on the
// in-memory replica and faults put in its way.
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Balance } from "./Balance.tsx"
import { SendIcp } from "./SendIcp.tsx"
import {
  BOB,
  clearEnvCookie,
  createTestWallet,
  FEE,
  ICP,
  patiently,
  renderWithWallet,
  SEED_1,
  type TestWallet,
} from "./test/test-wallet.tsx"

let wallet: TestWallet | undefined
afterEach(() => {
  cleanup()
  wallet?.client.dispose()
  clearEnvCookie()
})

async function renderSend(start = 7n * ICP): Promise<TestWallet> {
  const made = createTestWallet()
  made.setBalance(SEED_1, start)
  wallet = made
  renderWithWallet(
    made,
    <>
      <Balance refreshMs={60_000} />
      <SendIcp />
    </>
  )
  await screen.findByText(
    "Fee 0.0001 ICP, paid on top of the amount.",
    {},
    patiently
  )
  await screen.findByText("7 ICP", {}, patiently)
  return made
}

function send(to: string, amount: string) {
  fireEvent.change(screen.getByLabelText("To (principal)"), {
    target: { value: to },
  })
  fireEvent.change(screen.getByLabelText("Amount (ICP)"), {
    target: { value: amount },
  })
  fireEvent.click(screen.getByRole("button", { name: "Send" }))
}

const outcome = () => screen.getByTestId("outcome").textContent

describe("sending ICP", () => {
  it("sends the amount with the fee shown and a created_at_time, and the balance follows", async () => {
    const made = await renderSend()
    send(BOB, "1.5")

    await screen.findByText("Sent 1.5 ICP: block 0.", {}, patiently)
    // The client's onSettled read the ledger again: 7 - 1.5 - 0.0001.
    await screen.findByText("5.4999 ICP", {}, patiently)
    expect(made.transfers).toHaveLength(1)
    expect(made.transfers[0]?.fee).toBe(FEE)
    expect(made.transfers[0]?.created_at_time).not.toBeNull()
  })

  it("refuses text parseUnits refuses, and sends nothing", async () => {
    const made = await renderSend()
    send(BOB, "1e3")
    await screen.findByText(
      'Not sent: amount: Write plain digits with at most one "." (no exponent, grouping or sign).'
    )
    send("bob", "1")
    await screen.findByText("Not sent: to: Not a principal.")
    expect(made.callsOf("icrc1_transfer")).toBe(0)
  })

  it("words the ledger's Err: insufficient funds", async () => {
    await renderSend()
    send(BOB, "7")
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Insufficient funds: the balance is 7 ICP, less than the amount plus the fee."
        ),
      patiently
    )
  })

  it("words the ledger's Err: a fee that changed since it was shown", async () => {
    const made = await renderSend()
    made.setFee(2n * FEE)
    send(BOB, "1")
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Bad fee: the ledger now charges 0.0002 ICP. Nothing moved; send again to pay that fee."
        ),
      patiently
    )
    // A canister_err invalidates the ledger's reads too: the fee shown is the new one.
    await screen.findByText(
      "Fee 0.0002 ICP, paid on top of the amount.",
      {},
      patiently
    )
  })

  it("after a lost reply, says the outcome is unknown, re-reads, and lets the same account send it again, deduplicated", async () => {
    const made = await renderSend()
    const balanceReads = made.callsOf("icrc1_balance_of")
    made.dropNextReply()
    send(BOB, "1")

    await screen.findByRole(
      "button",
      { name: "Send the same transfer again" },
      patiently
    )
    expect(outcome()).toContain(
      "Outcome unknown (outcome_unknown): it may have gone through."
    )
    // The page did not re-read: the client did, after a failure that may have executed.
    expect(made.callsOf("icrc1_balance_of")).toBeGreaterThan(balanceReads)
    await screen.findByText("5.9999 ICP", {}, patiently)

    fireEvent.click(
      screen.getByRole("button", { name: "Send the same transfer again" })
    )
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Duplicate of block 0: this exact transfer went through already, and was not made twice."
        ),
      patiently
    )
    // Paid once: the same argument, sent twice by the same account.
    expect(made.balanceOf(BOB)).toBe(1n * ICP)
    expect(made.transfers[1]).toEqual(made.transfers[0])
  })

  it("does not offer the transfer again to another account", async () => {
    const made = await renderSend()
    made.dropNextReply()
    send(BOB, "1")
    await screen.findByRole(
      "button",
      { name: "Send the same transfer again" },
      patiently
    )

    act(() => {
      made.auth.switchTo(2)
    })

    await screen.findByText(
      "It was sent by another account. Sent again by this one, it would be a new transfer, so it is not offered."
    )
    expect(
      screen.queryByRole("button", { name: "Send the same transfer again" })
    ).toBeNull()
  })

  it("after a reject from the canister, says it may have executed, and the re-read shows nothing moved", async () => {
    const made = await renderSend()
    made.failNext("icrc1_transfer", "reject-4")
    send(BOB, "1")
    await screen.findByRole(
      "button",
      { name: "Send the same transfer again" },
      patiently
    )
    expect(outcome()).toContain("Outcome unknown (rejected)")
    expect(screen.getByText("7 ICP")).toBeTruthy()
    expect(made.balanceOf(SEED_1)).toBe(7n * ICP)
  })

  it("cannot send while signed out", async () => {
    const made = createTestWallet({ signedIn: false })
    wallet = made
    renderWithWallet(made, <SendIcp />)
    await screen.findByText("Sign in to send.", {}, patiently)
    expect(
      (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })
})
