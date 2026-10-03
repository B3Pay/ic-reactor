// Scenarios 2 and 3 as a person uses them: the sign-in panel over the app's
// own auth (wallet-auth.ts), with Internet Identity stood in for by the
// sign-in of `createTestClient()` (an AuthClient's surface, borrowed from a
// test client that is never used).
import { createClient, type Client } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import { ReactorProvider } from "@ic-reactor/react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import {
  createDevAccounts,
  type AccountStorage,
  type DevAccounts,
} from "./auth/dev-accounts.ts"
import { createWalletAuth } from "./auth/wallet-auth.ts"
import { SignIn } from "./SignIn.tsx"
import { SEED_1 } from "./test/test-wallet.tsx"

const memoryStorage = (): AccountStorage => {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

let client: Client | undefined
afterEach(() => {
  cleanup()
  client?.dispose()
})

function renderSignIn(devAccounts: DevAccounts | undefined) {
  const unused = createTestClient({ signedIn: false })
  unused.client.dispose()
  const internetIdentity = unused.auth
  client = createClient({
    network: "env",
    auth: () => createWalletAuth({ internetIdentity, devAccounts }),
    fetch: async () => {
      throw new Error("the sign-in panel makes no call")
    },
  })
  const made = client
  render(
    <StrictMode>
      <ReactorProvider client={() => made}>
        <SignIn devAccounts={devAccounts} />
      </ReactorProvider>
    </StrictMode>
  )
}

const who = () => screen.getByTestId("who").textContent
const principal = () => screen.getByTestId("principal").textContent
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

describe("the sign-in panel", () => {
  it("signs in with a dev account, makes a second one, and switches between them", async () => {
    const devAccounts = createDevAccounts(memoryStorage())
    renderSignIn(devAccounts)
    expect(who()).toBe("nobody")
    expect(principal()).toBe("2vxsx-fae")

    click("Sign in with a dev account")
    await screen.findByText("Dev account 1", { selector: "[data-testid=who]" })
    const first = principal()

    click("New dev account")
    await screen.findByText("Dev account 2", { selector: "[data-testid=who]" })
    const second = principal()
    expect(second).not.toBe(first)

    click("Dev account 1")
    await screen.findByText("Dev account 1", { selector: "[data-testid=who]" })
    expect(principal()).toBe(first)
  })

  it("signs in with Internet Identity, which replaces the dev account, and signs out", async () => {
    const devAccounts = createDevAccounts(memoryStorage())
    renderSignIn(devAccounts)
    click("Sign in with a dev account")
    await screen.findByText("Dev account 1", { selector: "[data-testid=who]" })

    click("Sign in with Internet Identity")
    await screen.findByText("Internet Identity", {
      selector: "[data-testid=who]",
    })
    expect(principal()).toBe(SEED_1)
    expect(devAccounts.getStatus().state).toBe("signed-out")

    click("Sign out")
    await screen.findByText("nobody", { selector: "[data-testid=who]" })
    expect(principal()).toBe("2vxsx-fae")
  })

  it("offers no dev account on a page that is not local", () => {
    renderSignIn(undefined)
    expect(screen.queryByText("Dev account (local only)")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Sign in with Internet Identity" })
    ).toBeTruthy()
  })
})
