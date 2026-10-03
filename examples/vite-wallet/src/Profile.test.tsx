// Scenario 6: the profile, read and written as the signed-in caller, and a
// write while signed out refused by the client before it is sent.
import { createClient, type AuthLike, type Client } from "@ic-reactor/core"
import { ReactorProvider } from "@ic-reactor/react"
import { SessionNotHeldError } from "@icp-sdk/auth/client"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { createWalletAuth } from "./auth/wallet-auth.ts"
import { Profile } from "./Profile.tsx"
import {
  BACKEND_ID,
  clearEnvCookie,
  createTestWallet,
  patiently,
  renderWithWallet,
  SEED_1,
  setEnvCookie,
  type TestWallet,
} from "./test/test-wallet.tsx"

let wallet: TestWallet | undefined
let lostKeyClient: Client | undefined
afterEach(() => {
  cleanup()
  wallet?.client.dispose()
  lostKeyClient?.dispose()
  lostKeyClient = undefined
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

  it("tells a signed-in user whose key is gone to sign in again, not that nobody is signed in", async () => {
    // An Internet Identity session whose record says signed in while the key
    // that signs for it is gone (cleared site data, another tab's sign-out
    // the store could not report): AuthClient's getIdentity() rejects
    // SessionNotHeldError, and the client rejects every call of that
    // principal, read or write, `unauthenticated` with code
    // `identity_unavailable`. createTestClient's sign-in never loses its key,
    // so this client is built as the app's is, over the app's own auth.
    setEnvCookie({ backend: BACKEND_ID })
    const lostKey: AuthLike = {
      getPrincipal: () => ({ toText: () => SEED_1 }),
      getStatus: () => ({ state: "signed-in" }),
      getIdentity: () => Promise.reject(new SessionNotHeldError()),
      subscribe: () => () => {},
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    }
    let sent = 0
    const client = createClient({
      network: "env",
      // The client asks for the identity before it builds an agent, so
      // nothing reaches this.
      fetch: () => {
        sent += 1
        return Promise.reject(new Error("nothing may be sent"))
      },
      auth: () => createWalletAuth({ internetIdentity: lostKey }),
    })
    lostKeyClient = client
    render(
      <StrictMode>
        <ReactorProvider client={() => client}>
          <Profile />
        </ReactorProvider>
      </StrictMode>
    )
    const lostKeyText =
      "Not sent: you are signed in, but the session's key could not be loaded to sign with (unauthenticated, identity_unavailable). Sign out and sign in again."

    // The read fails first, then the write, and both say the same.
    await screen.findByText("The profile could not be read.", {}, patiently)
    await screen.findByText(lostKeyText, {}, patiently)
    save("Ada")
    await waitFor(
      () => expect(screen.getAllByText(lostKeyText)).toHaveLength(2),
      patiently
    )
    expect(screen.queryByText(/nobody is signed in/)).toBeNull()
    expect(sent).toBe(0)
  })
})
