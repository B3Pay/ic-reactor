// @vitest-environment jsdom
// The Sandbox tab as a person uses it: rendered, clicked, and read back from
// the page, over the same in-memory replica the browser runs.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  SEED_1,
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
