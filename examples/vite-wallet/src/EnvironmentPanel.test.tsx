// Scenario 1: `network: "env"` and `{ name: "backend" }` from the ic_env
// cookie, on jsdom's local page (http://localhost:3000).
import { cleanup, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { EnvironmentPanel } from "./EnvironmentPanel.tsx"
import {
  BACKEND_ID,
  clearEnvCookie,
  createTestWallet,
  patiently,
  renderWithWallet,
  setEnvCookie,
  type TestWallet,
} from "./test/test-wallet.tsx"
import { ICP_LEDGER } from "./use-canisters.ts"

let wallet: TestWallet | undefined
afterEach(() => {
  cleanup()
  wallet?.client.dispose()
  clearEnvCookie()
})

describe("the environment panel", () => {
  it("routes through the page's origin and finds the backend by its name in the cookie", async () => {
    wallet = createTestWallet({ signedIn: false })
    renderWithWallet(wallet, <EnvironmentPanel />)

    expect(screen.getByTestId("network").textContent).toBe(
      "http://localhost:3000"
    )
    expect(screen.getByTestId("backend-id").textContent).toBe(BACKEND_ID)
    expect(screen.getByTestId("ledger-id").textContent).toBe(ICP_LEDGER)
    await waitFor(
      () =>
        expect(screen.getByTestId("backend-probe").textContent).toBe(
          "yes: contacts() as anonymous gave 0"
        ),
      patiently
    )
    // The probe went to the id the cookie named, and to no other canister.
    const backendCalls = wallet.requests.filter(
      (r) => r.methodName === "contacts"
    )
    expect(backendCalls.length).toBeGreaterThan(0)
    expect(backendCalls.every((r) => r.canisterId === BACKEND_ID)).toBe(true)
    expect(screen.getByTestId("cookie").textContent).toContain(
      `PUBLIC_CANISTER_ID:backend: ${BACKEND_ID}`
    )
  })

  it("names an undeployed backend unresolved and sends nothing to it", async () => {
    // A cookie that names the ledger only: the backend was never deployed.
    wallet = createTestWallet({ signedIn: false, cookie: false })
    setEnvCookie({ ledger: ICP_LEDGER })
    renderWithWallet(wallet, <EnvironmentPanel />)

    expect(screen.getByTestId("backend-id").textContent).toBe(
      "$unresolved:backend"
    )
    await screen.findByText(
      "Not sent: the ic_env cookie names no backend. Deploy it (pnpm icp:deploy), then reload the page.",
      {},
      patiently
    )
    expect(wallet.callsOf("contacts")).toBe(0)
  })

  it("reads the cookie when a key or a call is built, so a redeploy's new id is used", () => {
    wallet = createTestWallet({ signedIn: false })
    const { client } = wallet
    renderWithWallet(wallet, <EnvironmentPanel />)
    expect(screen.getByTestId("backend-id").textContent).toBe(BACKEND_ID)

    // `icp deploy` into a fresh network, and the page loaded again.
    const redeployed = "be2us-64aaa-aaaaa-qaabq-cai"
    setEnvCookie({ backend: redeployed, ledger: ICP_LEDGER })
    cleanup()
    renderWithWallet(wallet, <EnvironmentPanel />)
    expect(screen.getByTestId("backend-id").textContent).toBe(redeployed)
    expect(client.network).toBe("http://localhost:3000")
  })
})
