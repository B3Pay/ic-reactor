// @vitest-environment jsdom
// The Sandbox tab as a person uses it: rendered, clicked, and read back from
// the page, over the same in-memory replica the browser runs.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { Activity, StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  SEED_1,
  SEED_2,
  createSandbox,
  sandboxBtcAddress,
  type Sandbox,
} from "./sandbox.ts"
import SandboxTab from "./SandboxTab.tsx"

/** Every sandbox `createSandbox()` made, the tab's own ones included. */
const made = vi.hoisted((): Sandbox[] => [])

// The real `createSandbox`, which also keeps what it makes, so that a test can
// reach the sandbox a tab made for itself.
vi.mock("./sandbox.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sandbox.ts")>()
  return {
    ...original,
    createSandbox: (...args: Parameters<typeof original.createSandbox>) => {
      const sandbox = original.createSandbox(...args)
      made.push(sandbox)
      return sandbox
    },
  }
})

afterEach(() => {
  cleanup()
  made.length = 0
})

const patiently = { timeout: 5_000 }

async function renderSandbox() {
  render(
    <StrictMode>
      <SandboxTab latencyMs={0} />
    </StrictMode>
  )
  // The table has read seed 1's starting balance.
  await screen.findByText("10 ICP", {}, patiently)
}

/** The request log's rows, as text, newest first. */
const logRows = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    )

const send = (fault: string) => {
  fireEvent.change(screen.getByLabelText("Arm a fault for this transfer"), {
    target: { value: fault },
  })
  fireEvent.click(screen.getByRole("button", { name: /^Send as/ }))
}

describe("the Sandbox tab", () => {
  it("sends a transfer and shows the new balances", async () => {
    await renderSandbox()

    send("none")

    await screen.findByText(/^Sent: block 0\./, {}, patiently)
    expect(screen.getByText("8.4999 ICP")).toBeTruthy()
    expect(screen.getByText("4 ICP")).toBeTruthy()
  })

  it("after a lost reply, says it may have executed and shows the debit the re-read found", async () => {
    await renderSandbox()

    send("lost-reply")

    await screen.findByText(
      "The re-read shows the debit (10 ICP → 8.4999 ICP): the transfer happened.",
      {},
      patiently
    )
    expect(
      screen.getByText("May have executed. The client re-read the ledger:")
    ).toBeTruthy()
    // The log catches up on its own clock.
    await waitFor(
      () =>
        expect(
          logRows().some(
            (cells) =>
              cells[2] === "icrc1_transfer" && cells[4] === "the reply was lost"
          )
        ).toBe(true),
      patiently
    )
  })

  it("offers a transfer of unknown outcome again only to the account that sent it", async () => {
    const sandbox = createSandbox({ latencyMs: 0 })
    render(
      <StrictMode>
        <SandboxTab sandbox={sandbox} />
      </StrictMode>
    )
    await screen.findByText("10 ICP", {}, patiently)
    /** Who signed each transfer that reached the ledger. */
    const senders = () =>
      sandbox.requests
        .filter(
          (r) =>
            r.endpoint === "call" &&
            r.methodName === "icrc1_transfer" &&
            r.refused === undefined
        )
        .map((r) => r.caller)
    const again = { name: "Send the same transfer again" }

    send("lost-reply")
    await screen.findByRole("button", again, patiently)
    expect(senders()).toEqual([SEED_1])

    // Signed by seed 2, the same argument would be a second, real transfer:
    // the ledger deduplicates per sender account.
    fireEvent.click(screen.getByRole("button", { name: "Switch to seed 2" }))
    // Once the page has read the balances again, as seed 2.
    await waitFor(() => {
      expect(
        sandbox.requests.some(
          (r) => r.methodName === "icrc1_balance_of" && r.caller === SEED_2
        )
      ).toBe(true)
      expect(sandbox.client.queryClient.isFetching()).toBe(0)
    }, patiently)
    expect(screen.queryByRole("button", again)).toBeNull()
    expect(
      screen.getByText(
        /^Sent as seed 1, and the caller is now seed 2, so it is not offered again/
      )
    ).toBeTruthy()
    // Nor does the page read seed 2's balance as the outcome of seed 1's transfer.
    expect(screen.queryByText(/^The (re-read shows|balance moved)/)).toBeNull()
    expect(senders()).toEqual([SEED_1])

    // Back as seed 1, the re-read and the offer are back, and the ledger
    // knows the transfer.
    fireEvent.click(screen.getByRole("button", { name: "Sign in as seed 1" }))
    await screen.findByText(
      "The re-read shows the debit (10 ICP → 8.4999 ICP): the transfer happened.",
      {},
      patiently
    )
    fireEvent.click(screen.getByRole("button", again))
    await screen.findByText(/^Duplicate of block 0:/, {}, patiently)
    expect(senders()).toEqual([SEED_1, SEED_1])
    // Seed 1 paid once (1.5 ICP and the fee), seed 2 was paid once.
    expect(screen.getByText("8.4999 ICP")).toBeTruthy()
    expect(screen.getByText("4 ICP")).toBeTruthy()
    sandbox.client.dispose()
  })

  it("sends a transfer only as the caller the page shows, and its retry only as its sender", async () => {
    const sandbox = createSandbox({ latencyMs: 0 })
    render(
      <StrictMode>
        <SandboxTab sandbox={sandbox} />
      </StrictMode>
    )
    await screen.findByText("10 ICP", {}, patiently)
    /** Who signed each transfer that reached the ledger. */
    const senders = () =>
      sandbox.requests
        .filter(
          (r) =>
            r.endpoint === "call" &&
            r.methodName === "icrc1_transfer" &&
            r.refused === undefined
        )
        .map((r) => r.caller)
    const settled = () =>
      waitFor(() => {
        expect(sandbox.client.queryClient.isFetching()).toBe(0)
        expect(sandbox.client.queryClient.isMutating()).toBe(0)
      }, patiently)
    const again = { name: "Send the same transfer again" }

    // A switch and a press of Send in one batch: the press runs on the render
    // from before the switch, which still says seed 1, while the client would
    // sign as seed 2. (A change to the form's fault select would make React
    // render the switch before the press, so the press is the only event.)
    const sendButton = screen.getByRole("button", { name: "Send as seed 1" })
    act(() => {
      sandbox.auth.switchTo(2)
      fireEvent.click(sendButton)
    })
    await screen.findByRole("button", { name: "Send as seed 2" }, patiently)
    await settled()
    expect(senders()).toEqual([])
    expect(screen.queryByText(/^Sent: block/)).toBeNull()

    // Back to seed 1, a transfer whose reply is lost, and its retry pressed
    // in the same batch as a switch to seed 2: as seed 2, the same argument
    // would be a second, real transfer.
    fireEvent.click(screen.getByRole("button", { name: "Sign in as seed 1" }))
    await screen.findByRole("button", { name: "Send as seed 1" }, patiently)
    send("lost-reply")
    const retry = await screen.findByRole("button", again, patiently)
    expect(senders()).toEqual([SEED_1])
    act(() => {
      sandbox.auth.switchTo(2)
      fireEvent.click(retry)
    })
    await settled()
    expect(senders()).toEqual([SEED_1])
    await screen.findByText(
      /^Sent as seed 1, and the caller is now seed 2, so it is not offered again/,
      {},
      patiently
    )
    sandbox.client.dispose()
  })

  it("keeps the deposit address through a transfer and a hide and show, without asking the minter again", async () => {
    const sandbox = createSandbox({ latencyMs: 0 })
    render(
      <StrictMode>
        <SandboxTab sandbox={sandbox} />
      </StrictMode>
    )
    const address = sandboxBtcAddress({ owner: SEED_1, subaccount: null })
    const minterCalls = () =>
      sandbox.requests.filter(
        (r) => r.endpoint === "call" && r.methodName === "get_btc_address"
      ).length
    await screen.findByText(address, {}, patiently)
    // StrictMode's second mount cancels the first read in flight and sends it
    // again, so the count is taken once the address is in.
    const asked = minterCalls()

    send("none")
    await screen.findByText(/^Sent: block 0\./, {}, patiently)
    fireEvent.click(screen.getByRole("button", { name: "Hide the address" }))
    fireEvent.click(screen.getByRole("button", { name: "Show the address" }))

    expect(screen.getByText(address)).toBeTruthy()
    // A read the mount started is fetching from here on: let it end first.
    await waitFor(
      () => expect(sandbox.client.queryClient.isFetching()).toBe(0),
      patiently
    )
    expect(minterCalls()).toBe(asked)
    // The page says so, once its log has caught up.
    await screen.findByText(
      (_, node) =>
        node?.tagName === "P" &&
        (node.textContent ?? "").startsWith(
          `The minter has run it ${asked} time`
        ),
      {},
      patiently
    )
    // The tab never disposes a sandbox it is given.
    sandbox.client.dispose()
  })

  it("reads the ledger as the new caller after a sign-out", async () => {
    await renderSandbox()

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))

    await waitFor(() => {
      const anonymous = logRows().filter((cells) => cells[3] === "anonymous")
      // Both balances and the supply, read again under the anonymous caller.
      expect(anonymous.map((cells) => cells[2]).sort()).toEqual([
        "icrc1_balance_of",
        "icrc1_balance_of",
        "icrc1_total_supply",
      ])
    }, patiently)
  })
})

describe("the Sandbox tab's sandbox", () => {
  /** Past the provider's cleanup, which disposes on the next macrotask. */
  const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve))

  it("ends the sandbox it made for itself when it unmounts", async () => {
    const { unmount } = render(
      <StrictMode>
        <SandboxTab latencyMs={0} />
      </StrictMode>
    )
    await screen.findByText("10 ICP", {}, patiently)
    // StrictMode calls the provider's factory twice and keeps one client: the
    // page runs on the sandbox whose replica got the reads.
    const used = made.filter((sandbox) => sandbox.requests.length > 0)
    expect(used).toHaveLength(1)
    const [sandbox] = used as [Sandbox]
    // StrictMode's unmount and second mount leave it alive.
    await nextTask()
    expect(sandbox.auth.disposed).toBe(false)

    unmount()

    await waitFor(() => expect(sandbox.auth.disposed).toBe(true))
    expect(sandbox.auth.listenerCount).toBe(0)
    await expect(sandbox.client.signIn()).rejects.toThrow(/disposed client/)
  })

  it("starts the page over on the new sandbox when a hidden Activity is shown again", async () => {
    const tab = (mode: "visible" | "hidden") => (
      <StrictMode>
        <Activity mode={mode}>
          <SandboxTab latencyMs={0} />
        </Activity>
      </StrictMode>
    )
    const { rerender } = render(tab("visible"))
    await screen.findByText("10 ICP", {}, patiently)
    send("none")
    await screen.findByText(/^Sent: block 0\./, {}, patiently)
    const used = () => made.filter((sandbox) => sandbox.requests.length > 0)
    expect(used()).toHaveLength(1)
    const [first] = used() as [Sandbox]

    // Hidden, the provider's client is disposed with its sandbox; shown
    // again, the provider builds a new one from the same factory.
    rerender(tab("hidden"))
    await waitFor(() => expect(first.auth.disposed).toBe(true))
    rerender(tab("visible"))
    await waitFor(() => expect(used()).toHaveLength(2), patiently)
    const [, second] = used() as [Sandbox, Sandbox]

    // The new ledger has seen no transfer, and the page says none was made:
    // no outcome of the old one, read against the new ledger's balances.
    await waitFor(() => {
      expect(screen.getByText("10 ICP")).toBeTruthy()
      expect(screen.getByText("2.5 ICP")).toBeTruthy()
    }, patiently)
    expect(screen.queryByText(/^Sent: block/)).toBeNull()
    expect(screen.queryByText(/Your balance went from/)).toBeNull()
    expect(second.requests.some((r) => r.methodName === "icrc1_transfer")).toBe(
      false
    )
  })

  it("leaves a sandbox it was given to whoever made it", async () => {
    const sandbox = createSandbox({ latencyMs: 0 })
    const { unmount } = render(
      <StrictMode>
        <SandboxTab sandbox={sandbox} />
      </StrictMode>
    )
    await screen.findByText("10 ICP", {}, patiently)

    unmount()
    await nextTask()

    expect(sandbox.auth.disposed).toBe(false)
    await expect(
      sandbox.ledger.icrc1_balance_of({ owner: SEED_1, subaccount: null })
    ).resolves.toBe(1_000_000_000n)
    sandbox.client.dispose()
  })
})
