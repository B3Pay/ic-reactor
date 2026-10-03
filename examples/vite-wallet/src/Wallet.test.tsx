// Scenario 3, for what the keys do not cover: component state. The whole
// page on a test client; a switch of account, or a sign-out, remounts the
// account's sections, so a transfer's outcome (which can carry the account's
// balance) or a refusal shown to one account is not shown to the next.
import { principal } from "@candid-core/schema"
import { act, cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Wallet } from "./App.tsx"
import {
  BOB,
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

const page = () => document.body.textContent ?? ""
const refusal =
  "Refused by the canister: Insufficient funds: the balance is 7 ICP, less than the amount plus the fee."

async function refusedTransfer(): Promise<TestWallet> {
  const made = createTestWallet()
  made.setBalance(SEED_1, 7n * ICP)
  made.setBalance(SEED_2, 2n * ICP)
  made.addContact(SEED_1, { name: "Bob", owner: principal(BOB) })
  wallet = made
  renderWithWallet(made, <Wallet />)
  await screen.findByText("7 ICP", {}, patiently)
  fireEvent.change(screen.getByLabelText("To (principal)"), {
    target: { value: BOB },
  })
  fireEvent.change(screen.getByLabelText("Amount (ICP)"), {
    target: { value: "100" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Send" }))
  await screen.findByText(refusal, {}, patiently)
  return made
}

describe("the wallet page", () => {
  it("shows the next account nothing the previous one saw, outcomes included", async () => {
    const made = await refusedTransfer()

    act(() => {
      made.auth.switchTo(2)
    })

    expect(page()).not.toContain(refusal)
    expect(page()).not.toContain("7 ICP")
    expect(page()).not.toContain("Bob")
    await screen.findByText("2 ICP", {}, patiently)
    await screen.findByText(
      "Fee 0.0001 ICP, paid on top of the amount.",
      {},
      patiently
    )
    expect(page()).not.toContain(refusal)
  })

  it("shows nothing of the account after a sign-out", async () => {
    const made = await refusedTransfer()

    await act(async () => {
      await made.client.signOut()
    })

    expect(page()).not.toContain(refusal)
    expect(page()).not.toContain("7 ICP")
    expect(screen.getByTestId("principal").textContent).toBe("2vxsx-fae")
    // Still not once the token is read again, for the anonymous caller.
    await screen.findByText(
      "Fee 0.0001 ICP, paid on top of the amount.",
      {},
      patiently
    )
    expect(page()).not.toContain(refusal)
  })
})
