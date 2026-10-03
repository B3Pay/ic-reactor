// Scenario 6: the profile, read and written as the signed-in caller, and a
// write while signed out refused by the client before it is sent.
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Profile } from "./Profile.tsx"
import {
  clearEnvCookie,
  createTestWallet,
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

function save(name: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
}

describe("the profile", () => {
  it("refuses a write while signed out before sending it, and says so", async () => {
    wallet = createTestWallet({ signedIn: false })
    renderWithWallet(wallet, <Profile />)
    expect(screen.getByTestId("profile-name").textContent).toBe(
      "Signed out: no profile is read."
    )

    save("Ada")

    await screen.findByText(
      "Not sent: nobody is signed in, and the client refuses a write before sending it (unauthenticated).",
      {},
      patiently
    )
    // Nothing reached the replica: no write, and no read either (skipToken).
    expect(wallet.callsOf("set_name")).toBe(0)
    expect(wallet.callsOf("get_profile")).toBe(0)
  })

  it("saves a name as the caller, and the client's invalidation shows it", async () => {
    wallet = createTestWallet()
    renderWithWallet(wallet, <Profile />)
    await screen.findByText("No name yet.", {}, patiently)
    const reads = wallet.callsOf("get_profile")

    save("Ada")

    await screen.findByText("Saved as Ada.", {}, patiently)
    // Shown by a new read of get_profile, which the client's onSettled asked for.
    await screen.findByText("Name: Ada", {}, patiently)
    expect(wallet.callsOf("get_profile")).toBeGreaterThan(reads)
    expect(
      wallet.requests.find((r) => r.methodName === "set_name")?.caller
    ).toBe(SEED_1)
  })

  it("words the backend's typed refusal of an invalid name", async () => {
    wallet = createTestWallet()
    renderWithWallet(wallet, <Profile />)
    await screen.findByText("No name yet.", {}, patiently)

    save("   ")

    await screen.findByText(
      "Refused by the canister: a name is 1 to 32 characters, with no control characters.",
      {},
      patiently
    )
    expect(screen.getByTestId("profile-name").textContent).toBe("No name yet.")
  })
})
