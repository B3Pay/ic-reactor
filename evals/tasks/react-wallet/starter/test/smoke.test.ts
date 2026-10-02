// @vitest-environment jsdom
//
// How to drive the local test world: a fake replica with an ICRC-1 ledger,
// and a test sign-in state. Add your own tests next to this one;
// `npx vitest run` runs them all.
import { afterEach, expect, it } from "vitest"
import { createElement } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { createWorld } from "./support/world"
import { createTestAuth } from "./support/auth"
import { Wallet } from "../src/Wallet"

afterEach(() => cleanup())

it("shows the signed-in principal's balance", async () => {
  const world = createWorld()
  const alice = world.newIdentity()
  world.setBalance(alice.getPrincipal().toText(), 1_234_500_000n)
  const auth = createTestAuth(alice, { signedIn: true })
  render(
    createElement(Wallet, {
      auth,
      config: {
        host: world.host,
        canisterId: world.canisterId,
        rootKey: world.rootKey,
      },
    })
  )
  await waitFor(
    () => expect(screen.getByTestId("balance").textContent).toBe("12.34500000"),
    { timeout: 10_000 }
  )
})
