// The method workspace for a link that asks to run a method: a shared URL,
// a quick read or a history replay all arrive as the same search params.
import { encodeArgs } from "@meantjs/schema/codec"
import { cleanup, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { MethodRunnerProps } from "../../calls/MethodRunner.tsx"
import {
  CKBTC_LEDGER,
  methodOf,
  typedInterface,
} from "../../calls/testing/fixtures.ts"
import { Account } from "../../canisters/icrc1.ts"
import type { CanisterInterface, MethodInfo } from "../../interface/types.ts"
import { toHex } from "../../lib/hex.ts"
import { renderInRouter } from "../../values/test-router.tsx"
import { MethodWorkspace } from "./MethodWorkspace.tsx"

// The runner has its own tests: here, only what the workspace hands it.
const runner: { last?: MethodRunnerProps } = {}
vi.mock("../../calls/MethodRunner.tsx", () => ({
  MethodRunner: (props: MethodRunnerProps) => {
    runner.last = props
    return <p>runner</p>
  },
}))

afterEach(() => {
  cleanup()
  runner.last = undefined
  vi.restoreAllMocks()
})

const NO_ARGS = toHex(
  (() => {
    const encoded = encodeArgs([], [])
    if (!encoded.ok) throw new Error("does not encode")
    return encoded.bytes
  })()
)

const ledger = typedInterface(CKBTC_LEDGER)

/** The ledger's interface with extra methods a ledger does not have. */
function withMethods(...extra: MethodInfo[]): CanisterInterface {
  const methods = [...ledger.methods, ...extra]
  const byName = new Map(methods.map((m) => [m.name, m]))
  return { ...ledger, methods, method: (name) => byName.get(name) }
}

const ping: MethodInfo = { name: "ping", mode: "query", args: [], results: [] }
const peers: MethodInfo = {
  name: "peers",
  mode: "composite_query",
  args: [],
  results: ledger.method("icrc1_symbol")?.results ?? [],
}

async function open(
  iface: CanisterInterface,
  name: string,
  argsHex: string,
  certified = false
): Promise<void> {
  await renderInRouter(
    <MethodWorkspace
      iface={iface}
      methodName={name}
      method={methodOf(iface, name)}
      argsHex={argsHex}
      run
      certified={certified}
    />
  )
}

describe("MethodWorkspace, opened by a link with run=true", () => {
  it("reads a quick read at once, without calling it a shared link or offering an empty form", async () => {
    await open(ledger, "icrc1_symbol", NO_ARGS)
    expect(runner.last?.autoRun).toBe(true)
    expect(screen.getByRole("note").textContent).toBe(
      "Read at once: it takes no arguments."
    )
    expect(screen.queryByText(/shared link/i)).toBeNull()
    expect(screen.queryByRole("link", { name: /empty form/i })).toBeNull()
  })

  it("reads a replay with arguments at once, and offers to start from an empty form", async () => {
    const encoded = encodeArgs(
      [Account],
      [{ owner: CKBTC_LEDGER, subaccount: null }]
    )
    if (!encoded.ok) throw new Error("does not encode")
    await open(ledger, "icrc1_balance_of", toHex(encoded.bytes))
    expect(runner.last?.autoRun).toBe(true)
    expect(screen.getByRole("note").textContent).toMatch(
      /^Read at once with the link’s arguments\./
    )
    const empty = screen.getByRole("link", { name: "Start from an empty form" })
    expect(empty.getAttribute("href")).toBe(
      `/canister/${CKBTC_LEDGER}?method=icrc1_balance_of`
    )
  })

  it("only fills the form of a query without results, which is called, not read", async () => {
    await open(withMethods(ping), "ping", NO_ARGS)
    expect(runner.last?.autoRun).toBe(false)
    expect(screen.queryByRole("note")).toBeNull()
    expect(screen.getByText(/A query without results is called/)).toBeTruthy()
  })

  it("never runs a write from a link", async () => {
    const transfer = ledger.method("icrc1_transfer")
    if (transfer === undefined) throw new Error("no icrc1_transfer")
    // Any bytes that decode: the form starts from them, nothing is sent.
    const encoded = encodeArgs(transfer.args, [
      {
        to: { owner: CKBTC_LEDGER, subaccount: null },
        amount: 1n,
        fee: null,
        memo: null,
        from_subaccount: null,
        created_at_time: null,
      },
    ])
    if (!encoded.ok) throw new Error("does not encode")
    await open(ledger, "icrc1_transfer", toHex(encoded.bytes))
    expect(runner.last?.autoRun).toBe(false)
    expect(screen.getByText(/Links never send a write/)).toBeTruthy()
  })

  it("never reads a composite query certified", async () => {
    await open(withMethods(peers), "peers", NO_ARGS, true)
    expect(runner.last?.autoRun).toBe(false)
    cleanup()
    await open(withMethods(peers), "peers", NO_ARGS, false)
    expect(runner.last?.autoRun).toBe(true)
  })
})

describe("MethodWorkspace, for a method just picked on the page", () => {
  /** Puts every h2 at `top` (jsdom lays nothing out). */
  function headingAt(top: number): void {
    vi.spyOn(
      HTMLHeadingElement.prototype,
      "getBoundingClientRect"
    ).mockReturnValue(
      DOMRect.fromRect({ x: 0, y: top, width: 300, height: 30 })
    )
  }

  // The workspace's own scroll; the test router resets to the top on its
  // first render, with left and behavior too.
  const movedTo = { top: expect.any(Number) as unknown }

  async function pick(picked: boolean): Promise<ReturnType<typeof vi.fn>> {
    const scrollTo = vi.fn()
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo)
    await renderInRouter(
      <MethodWorkspace
        iface={ledger}
        methodName="icrc1_fee"
        method={methodOf(ledger, "icrc1_fee")}
        run={false}
        certified={false}
        wasPicked={() => picked}
      />
    )
    return scrollTo
  }

  it("scrolls to its heading below the fold, as on a phone, and focuses it", async () => {
    headingAt(1195)
    const scrollTo = await pick(true)
    expect(scrollTo).toHaveBeenCalledWith({ top: window.scrollY + 1195 - 16 })
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "icrc1_fee" })
    )
  })

  it("moves up a heading low on the screen, where the form below it is out of view", async () => {
    headingAt(window.innerHeight - 100)
    const scrollTo = await pick(true)
    expect(scrollTo).toHaveBeenCalledWith({
      top: window.scrollY + window.innerHeight - 100 - 16,
    })
  })

  it("leaves a heading high on the screen alone", async () => {
    headingAt(120)
    const scrollTo = await pick(true)
    expect(scrollTo).not.toHaveBeenCalledWith(movedTo)
    expect(document.activeElement).toBe(document.body)
  })

  it("never moves a page the reader did not pick a method on", async () => {
    headingAt(1195)
    const scrollTo = await pick(false)
    expect(scrollTo).not.toHaveBeenCalledWith(movedTo)
    expect(document.activeElement).toBe(document.body)
  })
})
