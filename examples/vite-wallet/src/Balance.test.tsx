// Scenario 4: the balance, skipped while signed out, read again on its own.
import { act, cleanup, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Balance } from "./Balance.tsx"
import {
  clearEnvCookie,
  createTestWallet,
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

describe("the balance", () => {
  it("sends no read while signed out (skipToken), and reads once signed in", async () => {
    wallet = createTestWallet({ signedIn: false })
    wallet.setBalance(SEED_1, 3n * ICP)
    renderWithWallet(wallet, <Balance refreshMs={50} />)
    // Long enough for several intervals: none of them sends a read.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(screen.getByTestId("balance").textContent).toContain("skipToken")
    expect(wallet.callsOf("icrc1_balance_of")).toBe(0)

    const signedOut = wallet
    await act(async () => {
      await signedOut.auth.signIn(1)
    })
    await screen.findByText("3 ICP", {}, patiently)
  })

  it("shows a top-up by itself, with no click: refetchInterval on the client's options", async () => {
    wallet = createTestWallet()
    wallet.setBalance(SEED_1, 3n * ICP)
    renderWithWallet(wallet, <Balance refreshMs={50} />)
    await screen.findByText("3 ICP", {}, patiently)

    // `pnpm faucet <principal>`, from outside the page.
    wallet.setBalance(SEED_1, 13n * ICP)

    await screen.findByText("13 ICP", {}, patiently)
  })

  it("shows the command that funds this account", async () => {
    wallet = createTestWallet()
    renderWithWallet(wallet, <Balance />)
    await screen.findByText("0 ICP", {}, patiently)
    expect(screen.getByText(`pnpm faucet ${SEED_1}`)).toBeTruthy()
  })
})
