// @vitest-environment jsdom
//
// Diagnostic, not scored: for each probe amount, what a react-wallet solution
// does — the transfer-status state it ends in, whether the submit button was
// disabled, and whether (and with which base units) it reached the ledger.
// Writes JSON lines to $PROBE_OUT.
import { appendFileSync } from "node:fs"
import { it } from "vitest"
import { createElement } from "react"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { createWorld, formatE8s, sleep } from "#harness/world"
import { createFakeAuth } from "#harness/fake-auth"
import { PROBE_AMOUNTS } from "#harness/probes/amounts"
import { Wallet } from "../src/Wallet"

const auth = createFakeAuth(Ed25519KeyIdentity.generate())

it("probe_amounts", async () => {
  for (const [label, amount] of PROBE_AMOUNTS) {
    const world = createWorld()
    const alice = Ed25519KeyIdentity.generate()
    const carol = Ed25519KeyIdentity.generate()
    world.own(alice.getPrincipal().toText(), carol.getPrincipal().toText())
    world.ledger.setBalance(alice.getPrincipal().toText(), 5_000_000_000n)
    auth.reset(alice, { signedIn: true })
    render(
      createElement(Wallet, {
        auth,
        config: {
          host: world.host,
          canisterId: world.ledgerId,
          rootKey: world.rootKey,
        },
      })
    )
    let note = ""
    try {
      await waitFor(
        () => {
          if (
            screen.queryByTestId("balance")?.textContent?.trim() !==
            formatE8s(5_000_000_000n)
          )
            throw new Error("balance not shown")
        },
        { timeout: 10_000 }
      )
      await act(async () => {
        fireEvent.change(screen.getByTestId("transfer-to"), {
          target: { value: carol.getPrincipal().toText() },
        })
      })
      await act(async () => {
        fireEvent.change(screen.getByTestId("transfer-amount"), {
          target: { value: amount },
        })
      })
      const submit = screen.getByTestId("transfer-submit") as HTMLButtonElement
      if (submit.disabled) note = "submit disabled"
      else {
        await act(async () => {
          fireEvent.click(submit)
        })
      }
      await sleep(1_500)
    } catch (e) {
      note = `probe error: ${String((e as Error)?.message ?? e).slice(0, 80)}`
    }
    appendFileSync(
      process.env.PROBE_OUT!,
      JSON.stringify({
        label,
        amount,
        state:
          screen.queryByTestId("transfer-status")?.getAttribute("data-state") ??
          null,
        text: screen
          .queryByTestId("transfer-status")
          ?.textContent?.slice(0, 80),
        note,
        calls: world.calls().length,
        sent: world.ledger.attempts.map((a) => String(a.amount)),
      }) + "\n"
    )
    cleanup()
    world.restore()
  }
}, 180_000)
