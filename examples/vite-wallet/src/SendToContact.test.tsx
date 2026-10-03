// Scenario 8: paying a contact refreshes the ledger's reads (both balances),
// and leaves the backend's reads alone: the write changed no backend state.
import { principal } from "@candid-core/schema"
import { cleanup, fireEvent, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AddressBook } from "./AddressBook.tsx"
import { Balance } from "./Balance.tsx"
import {
  clearEnvCookie,
  createTestWallet,
  ICP,
  patiently,
  renderWithWallet,
  SEED_1,
  SEED_2,
  type TestWallet,
} from "./test/test-wallet.tsx"

let wallet: TestWallet | undefined
afterEach(() => {
  cleanup()
  wallet?.client.dispose()
  clearEnvCookie()
})

/** Seed 1 holds 7 ICP and knows Grace (seed 2), who holds 2. */
async function renderPayGrace(): Promise<TestWallet> {
  const made = createTestWallet()
  made.setBalance(SEED_1, 7n * ICP)
  made.setBalance(SEED_2, 2n * ICP)
  made.addContact(SEED_1, { name: "Grace", owner: principal(SEED_2) })
  wallet = made
  renderWithWallet(
    made,
    <>
      <Balance refreshMs={60_000} />
      <AddressBook />
    </>
  )
  fireEvent.click(
    await screen.findByRole("button", { name: "Pay Grace" }, patiently)
  )
  await screen.findByText(
    "2 ICP",
    { selector: "[data-testid=contact-balance]" },
    patiently
  )
  await screen.findByText("7 ICP", {}, patiently)
  return made
}

const payForm = () => within(screen.getByRole("group", { name: "Pay Grace" }))

function pay(amount: string) {
  fireEvent.change(payForm().getByLabelText("Amount (ICP)"), {
    target: { value: amount },
  })
  fireEvent.click(payForm().getByRole("button", { name: "Pay" }))
}

describe("paying a contact", () => {
  it("refreshes this account's and the contact's balances, and not the address book", async () => {
    const made = await renderPayGrace()
    const contactReads = made.callsOf("contacts")

    pay("1")

    await payForm().findByText("Sent 1 ICP: block 0.", {}, patiently)
    // Both are reads of icrc1_balance_of, with two arguments: the default
    // invalidation (every read of the ledger) covered both.
    await screen.findByText(
      "3 ICP",
      { selector: "[data-testid=contact-balance]" },
      patiently
    )
    await screen.findByText("5.9999 ICP", {}, patiently)
    // The payment changed nothing on the backend, so it was not read again.
    expect(made.callsOf("contacts")).toBe(contactReads)
    expect(made.transfers[0]?.to.owner).toBe(SEED_2)
  })

  it("words the ledger's refusal the way Send does", async () => {
    await renderPayGrace()
    pay("100")
    await payForm().findByText(
      "Refused by the canister: Insufficient funds: the balance is 7 ICP, less than the amount plus the fee.",
      {},
      patiently
    )
  })
})
