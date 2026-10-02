// @vitest-environment node
//
// How to drive the local test world: a fake replica with an ICRC-1 ledger.
// Add your own tests next to this one; `npx vitest run` runs them all.
import { expect, it } from "vitest"
import { createWorld } from "./support/world"
import { createLedgerTool } from "../src/index"

it("reads a balance from the fake ledger", async () => {
  const world = createWorld()
  const alice = world.newIdentity()
  world.setBalance(alice.getPrincipal().toText(), 1_234_500_000n)
  const tool = createLedgerTool({
    host: world.host,
    canisterId: world.canisterId,
    rootKey: world.rootKey,
    identity: alice,
  })
  expect(await tool.getBalance(alice.getPrincipal().toText())).toBe(
    1_234_500_000n
  )
})
