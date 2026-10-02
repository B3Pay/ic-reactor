// @vitest-environment node
//
// Diagnostic, not scored: for each probe amount, what a node-tool solution
// does — returns ok/!ok, throws, and whether (and with which base units) it
// reached the ledger. Writes JSON lines to $PROBE_OUT.
import { appendFileSync } from "node:fs"
import { it } from "vitest"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { createWorld, sleep } from "#harness/world"
import { PROBE_AMOUNTS } from "#harness/probes/amounts"
import { createLedgerTool } from "../src/index"

it("probe_amounts", async () => {
  for (const [label, amount] of PROBE_AMOUNTS) {
    const world = createWorld()
    const alice = Ed25519KeyIdentity.generate()
    const bob = Ed25519KeyIdentity.generate()
    world.own(alice.getPrincipal().toText(), bob.getPrincipal().toText())
    world.ledger.setBalance(alice.getPrincipal().toText(), 5_000_000_000n)
    const tool = createLedgerTool({
      host: world.host,
      canisterId: world.ledgerId,
      rootKey: world.rootKey,
      identity: alice,
    })
    let outcome: string
    try {
      const r = await tool.transfer({ to: bob.getPrincipal().toText(), amount })
      outcome = r.ok
        ? "ok"
        : `refused(mayHaveExecuted=${r.mayHaveExecuted}): ${r.reason.slice(0, 80)}`
    } catch (e) {
      outcome = `threw: ${String((e as Error)?.message ?? e).slice(0, 80)}`
    }
    await sleep(300)
    appendFileSync(
      process.env.PROBE_OUT!,
      JSON.stringify({
        label,
        amount,
        outcome,
        calls: world.calls().length,
        sent: world.ledger.attempts.map((a) => String(a.amount)),
      }) + "\n"
    )
    world.restore()
  }
}, 120_000)
