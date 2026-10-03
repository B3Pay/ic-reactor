// Scenario 3: a switch of account empties the page for the next caller.
// Every read is keyed by its caller, so after a switch the balance, the
// profile and the contacts start from nothing for the new account, and an
// answer read for the previous account never shows up under the new one.
import { principal } from "@candid-core/schema"
import { act, cleanup, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AddressBook } from "./AddressBook.tsx"
import { Balance } from "./Balance.tsx"
import { Profile } from "./Profile.tsx"
import { SendIcp } from "./SendIcp.tsx"
import {
  BOB,
  createTestWallet,
  ICP,
  patiently,
  renderWithWallet,
  SEED_1,
  SEED_2,
  clearEnvCookie,
  type TestWallet,
} from "./test/test-wallet.tsx"

let wallet: TestWallet | undefined
afterEach(() => {
  cleanup()
  wallet?.client.dispose()
  clearEnvCookie()
})

/** Seed 1 holds 7 ICP, is called Ada and knows Bob; seed 2 has 2 ICP and Grace. */
function twoAccounts(): TestWallet {
  const made = createTestWallet()
  made.setBalance(SEED_1, 7n * ICP)
  made.setName(SEED_1, "Ada")
  made.addContact(SEED_1, { name: "Bob", owner: principal(BOB) })
  made.setBalance(SEED_2, 2n * ICP)
  made.setName(SEED_2, "Grace")
  return made
}

const page = () => document.body.textContent ?? ""

describe("switching accounts", () => {
  it("shows the next account's data, and never the previous account's", async () => {
    wallet = twoAccounts()
    renderWithWallet(
      wallet,
      <>
        <Balance refreshMs={60_000} />
        <SendIcp />
        <Profile />
        <AddressBook />
      </>
    )
    await screen.findByText("7 ICP", {}, patiently)
    await screen.findByText("Name: Ada", {}, patiently)
    await screen.findByText("Bob", {}, patiently)

    // Seed 2's first balance read is held by the ledger, so the page can be
    // looked at while it has everything but that balance.
    const release = wallet.holdNext("icrc1_balance_of")
    const switched = wallet
    act(() => {
      switched.auth.switchTo(2)
    })

    // At once: seed 1's answers are not shown under seed 2.
    expect(page()).not.toContain("7 ICP")
    expect(page()).not.toContain("Ada")
    expect(page()).not.toContain("Bob")
    await screen.findByText("Name: Grace", {}, patiently)
    await screen.findByTestId("no-contacts", {}, patiently)
    // The token has loaded for seed 2 and its balance has not: the balance
    // shows nothing, not seed 1's amount kept from the last key.
    await screen.findByText("Fee 0.0001 ICP, paid on top of the amount.")
    expect(screen.getByTestId("balance").textContent).toBe("…")

    release()
    await screen.findByText("2 ICP", {}, patiently)
  })

  it("lets a read made for the previous account land under its own key only", async () => {
    wallet = twoAccounts()
    renderWithWallet(wallet, <Balance refreshMs={60_000} />)
    await screen.findByText("7 ICP", {}, patiently)

    // Seed 1's balance is read again, and the ledger holds the answer while
    // the account switches.
    const release = wallet.holdNext("icrc1_balance_of")
    wallet.setBalance(SEED_1, 9n * ICP)
    const { client } = wallet
    act(() => {
      void client.queryClient.invalidateQueries()
    })
    await waitFor(() => expect(wallet?.callsOf("icrc1_balance_of")).toBe(2))
    const switched = wallet
    act(() => {
      switched.auth.switchTo(2)
    })
    release()

    await screen.findByText("2 ICP", {}, patiently)
    // Seed 1's late answer (9 ICP) was never shown to seed 2.
    expect(page()).not.toContain("9 ICP")
    expect(page()).not.toContain("7 ICP")
  })
})
