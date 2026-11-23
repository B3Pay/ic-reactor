// Scenario 5: sending ICP, as a person does it, with the ledger mocked on the
// in-memory replica and faults put in its way.
import type { Client } from "@ic-reactor/core"
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { Balance } from "./Balance.tsx"
import {
  actor as ledgerActor,
  type Actor as Ledger,
} from "./canisters/ledger.ts"
import { SendIcp } from "./SendIcp.tsx"
import {
  BOB,
  clearEnvCookie,
  createTestWallet,
  FEE,
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

/** The IC's time as the page reads it: `client.time`. */
type ReadTime = Client["time"]

/**
 * The wallet on a page. With `time`, the page's client reads the IC's time
 * through it: a real client is frozen, so that client is an object over the
 * wallet's, which answers everything else.
 */
async function renderSend(
  start = 7n * ICP,
  time?: (real: ReadTime) => ReadTime
): Promise<TestWallet> {
  const made = createTestWallet()
  made.setBalance(SEED_1, start)
  wallet = made
  const client =
    time === undefined
      ? made.client
      : (Object.create(made.client, {
          time: { value: time((canister) => made.client.time(canister)) },
        }) as Client)
  renderWithWallet(
    { ...made, client },
    <>
      <Balance refreshMs={60_000} />
      <SendIcp />
    </>
  )
  await screen.findByText(
    "Fee 0.0001 ICP, paid on top of the amount.",
    {},
    patiently
  )
  await screen.findByText("7 ICP", {}, patiently)
  return made
}

function send(to: string, amount: string) {
  fireEvent.change(screen.getByLabelText("To (principal)"), {
    target: { value: to },
  })
  fireEvent.change(screen.getByLabelText("Amount (ICP)"), {
    target: { value: amount },
  })
  fireEvent.click(screen.getByRole("button", { name: "Send" }))
}

const outcome = () => screen.getByTestId("outcome").textContent

describe("sending ICP", () => {
  it("sends the amount with the fee shown, a memo and a created_at_time, and the balance follows", async () => {
    const made = await renderSend()
    send(BOB, "1.5")

    await screen.findByText("Sent 1.5 ICP: block 0.", {}, patiently)
    // The client's onSettled read the ledger again: 7 - 1.5 - 0.0001.
    await screen.findByText("5.4999 ICP", {}, patiently)
    expect(made.transfers).toHaveLength(1)
    expect(made.transfers[0]?.fee).toBe(FEE)
    expect(made.transfers[0]?.memo).toHaveLength(16)
    expect(made.transfers[0]?.created_at_time).not.toBeNull()
  })

  it("stamps the transfer with the IC's time, read as it is sent", async () => {
    // A time no `Date.now()` gives (it is not a whole millisecond), close
    // enough to now for the ledger to take it.
    const icTime = BigInt(Date.now()) * 1_000_000n + 123_456n
    const made = await renderSend(7n * ICP, () => () => Promise.resolve(icTime))
    send(BOB, "1")

    await screen.findByText("Sent 1 ICP: block 0.", {}, patiently)
    expect(made.transfers.map((arg) => arg.created_at_time)).toEqual([icTime])
  })

  it("sends one transfer when Send is pressed again while the time is read", async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const made = await renderSend(7n * ICP, (real) => async (canister) => {
      await gate
      return real(canister)
    })
    send(BOB, "1")

    // The press started the mutation at once: the page says so, and the
    // button is off before the time has come back.
    await screen.findByText("Sending 1 ICP…")
    const button = screen.getByRole("button", { name: "Send" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(made.callsOf("icrc1_transfer")).toBe(0)

    release()
    await screen.findByText("Sent 1 ICP: block 0.", {}, patiently)
    await screen.findByText("5.9999 ICP", {}, patiently)
    expect(made.transfers).toHaveLength(1)
    expect(made.balanceOf(BOB)).toBe(1n * ICP)
  })

  it("sends one transfer when Send is pressed twice with nothing in between", async () => {
    const made = createTestWallet()
    made.setBalance(SEED_1, 7n * ICP)
    wallet = made
    // A parent that can render again. Once it has, React holds nothing over
    // for the page: only what the press itself sets draws the button again
    // before the second press.
    let renderAgain = () => {}
    function Parent() {
      const [, setCount] = useState(0)
      renderAgain = () => setCount((count) => count + 1)
      return (
        <>
          <Balance refreshMs={60_000} />
          <SendIcp />
        </>
      )
    }
    renderWithWallet(made, <Parent />)
    await screen.findByText(
      "Fee 0.0001 ICP, paid on top of the amount.",
      {},
      patiently
    )
    await screen.findByText("7 ICP", {}, patiently)
    fireEvent.change(screen.getByLabelText("To (principal)"), {
      target: { value: BOB },
    })
    fireEvent.change(screen.getByLabelText("Amount (ICP)"), {
      target: { value: "1" },
    })
    act(() => renderAgain())

    const button = screen.getByRole("button", { name: "Send" })
    fireEvent.click(button)
    // No timer has run since the press, so TanStack Query has not told React
    // of the mutation yet: the page's own state turned the button off.
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)

    await screen.findByText("Sent 1 ICP: block 0.", {}, patiently)
    await screen.findByText("5.9999 ICP", {}, patiently)
    expect(made.transfers).toHaveLength(1)
    expect(made.balanceOf(BOB)).toBe(1n * ICP)
  })

  it("sends nothing when the time cannot be read, and says so", async () => {
    const made = await renderSend(
      7n * ICP,
      (real) => () =>
        // A failure of `client.time()` itself: no subnet answers for the
        // management canister's id, so there is no time to read by it.
        real(made.client.canister<Ledger>(ledgerActor, { id: "aaaaa-aa" }))
    )
    send(BOB, "1")

    await waitFor(
      () =>
        expect(outcome()).toContain(
          "Not done, and certainly not executed (invalid_args, management_canister)"
        ),
      patiently
    )
    expect(made.callsOf("icrc1_transfer")).toBe(0)
    expect(made.balanceOf(SEED_1)).toBe(7n * ICP)
    // Nothing was sent, so there is nothing to send again.
    expect(
      screen.queryByRole("button", { name: "Send the same transfer again" })
    ).toBeNull()
  })

  it("sends nothing when the account changes while the time is read", async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const made = await renderSend(7n * ICP, (real) => async (canister) => {
      await gate
      return real(canister)
    })
    made.setBalance(SEED_2, 3n * ICP)
    send(BOB, "1")
    await screen.findByText("Sending 1 ICP…")

    // Seed 2 takes over before the transfer has its time. Signed by seed 2,
    // it would leave seed 2's account.
    act(() => {
      made.auth.switchTo(2)
    })
    release()

    await waitFor(
      () =>
        expect(outcome()).toContain(
          "Not done, and certainly not executed (cancelled, caller_changed)"
        ),
      patiently
    )
    expect(made.callsOf("icrc1_transfer")).toBe(0)
    expect(made.balanceOf(SEED_1)).toBe(7n * ICP)
    expect(made.balanceOf(SEED_2)).toBe(3n * ICP)
  })

  it("refuses text parseUnits refuses, and sends nothing", async () => {
    const made = await renderSend()
    send(BOB, "1e3")
    await screen.findByText(
      'Not sent: amount: Write plain digits with at most one "." (no exponent, grouping or sign).'
    )
    send("bob", "1")
    await screen.findByText("Not sent: to: Not a principal.")
    expect(made.callsOf("icrc1_transfer")).toBe(0)
  })

  it("words the ledger's Err: insufficient funds", async () => {
    await renderSend()
    send(BOB, "7")
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Insufficient funds: the balance is 7 ICP, less than the amount plus the fee."
        ),
      patiently
    )
  })

  it("words the ledger's Err: a fee that changed since it was shown", async () => {
    const made = await renderSend()
    made.setFee(2n * FEE)
    send(BOB, "1")
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Bad fee: the ledger now charges 0.0002 ICP. Nothing moved; send again to pay that fee."
        ),
      patiently
    )
    // A canister_err invalidates the ledger's reads too: the fee shown is the new one.
    await screen.findByText(
      "Fee 0.0002 ICP, paid on top of the amount.",
      {},
      patiently
    )
  })

  it("after a lost reply, says the outcome is unknown, re-reads, and lets the same account send it again, deduplicated", async () => {
    const made = await renderSend()
    const balanceReads = made.callsOf("icrc1_balance_of")
    made.dropNextReply()
    send(BOB, "1")

    await screen.findByRole(
      "button",
      { name: "Send the same transfer again" },
      patiently
    )
    expect(outcome()).toContain(
      "Outcome unknown (outcome_unknown): it may have gone through."
    )
    // The page did not re-read: the client did, after a failure that may have executed.
    expect(made.callsOf("icrc1_balance_of")).toBeGreaterThan(balanceReads)
    await screen.findByText("5.9999 ICP", {}, patiently)

    fireEvent.click(
      screen.getByRole("button", { name: "Send the same transfer again" })
    )
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Duplicate of block 0: this exact transfer went through already, and was not made twice."
        ),
      patiently
    )
    // Paid once: the same argument, memo included, sent twice by the same account.
    expect(made.balanceOf(BOB)).toBe(1n * ICP)
    expect(made.transfers[1]).toEqual(made.transfers[0])
  })

  it("sends the same transfer again with the time it was first sent with, however the IC's time has moved", async () => {
    // A second later at each reading, as the IC's time moves.
    const start = BigInt(Date.now()) * 1_000_000n
    let reads = 0
    const made = await renderSend(
      7n * ICP,
      () => () => Promise.resolve(start + BigInt(reads++) * 1_000_000_000n)
    )
    made.dropNextReply()
    send(BOB, "1")

    fireEvent.click(
      await screen.findByRole(
        "button",
        { name: "Send the same transfer again" },
        patiently
      )
    )
    // The ledger knows it by its memo and its time. Stamped again, it would
    // have been a new transfer, paid in full.
    await waitFor(
      () => expect(outcome()).toContain("Duplicate of block 0"),
      patiently
    )
    expect(reads).toBe(1)
    expect(made.transfers.map((arg) => arg.created_at_time)).toEqual([
      start,
      start,
    ])
    expect(made.balanceOf(BOB)).toBe(1n * ICP)
  })

  it("does not offer the transfer again to another account", async () => {
    const made = await renderSend()
    made.dropNextReply()
    send(BOB, "1")
    await screen.findByRole(
      "button",
      { name: "Send the same transfer again" },
      patiently
    )

    act(() => {
      made.auth.switchTo(2)
    })

    // Once the page has the token again, as seed 2: the outcome is shown,
    // and the button is not.
    await screen.findByText(
      "Fee 0.0001 ICP, paid on top of the amount.",
      {},
      patiently
    )
    expect(outcome()).toContain("Outcome unknown (outcome_unknown)")
    expect(
      screen.queryByRole("button", { name: "Send the same transfer again" })
    ).toBeNull()
  })

  it("withdraws the offer on a sign-out, and makes it again once the same account signs back in", async () => {
    const made = await renderSend()
    made.dropNextReply()
    send(BOB, "1")
    const again = { name: "Send the same transfer again" }
    await screen.findByRole("button", again, patiently)

    await act(async () => {
      await made.auth.signOut()
    })
    await screen.findByText("Sign in to send.", {}, patiently)
    expect(screen.queryByRole("button", again)).toBeNull()

    await act(async () => {
      await made.auth.signIn()
    })
    fireEvent.click(await screen.findByRole("button", again, patiently))
    await waitFor(
      () =>
        expect(outcome()).toBe(
          "Refused by the canister: Duplicate of block 0: this exact transfer went through already, and was not made twice."
        ),
      patiently
    )
    expect(made.balanceOf(BOB)).toBe(1n * ICP)
  })

  it("after a reject from the canister, says it may have executed, and the re-read shows nothing moved", async () => {
    const made = await renderSend()
    made.failNext("icrc1_transfer", "reject-4")
    send(BOB, "1")
    await screen.findByRole(
      "button",
      { name: "Send the same transfer again" },
      patiently
    )
    expect(outcome()).toContain("Outcome unknown (rejected)")
    expect(screen.getByText("7 ICP")).toBeTruthy()
    expect(made.balanceOf(SEED_1)).toBe(7n * ICP)
  })

  it("cannot send while signed out", async () => {
    const made = createTestWallet({ signedIn: false })
    wallet = made
    renderWithWallet(made, <SendIcp />)
    await screen.findByText("Sign in to send.", {}, patiently)
    expect(
      (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })
})
