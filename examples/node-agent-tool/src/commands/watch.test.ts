// Scenario 7: the cache outside React. `watch` reads through the client's
// QueryClient, prints only changes, and disposes the client on Ctrl-C.
import { principal } from "@candid-core/schema"
import { isReactorError } from "@ic-reactor/core"
import { describe, expect, it, vi } from "vitest"
import { LEDGERS, ledgerOn } from "../ledgers.ts"
import { createCli } from "../test-kit.ts"

const OWNER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")
const ACCOUNT = { owner: OWNER, subaccount: null }

const methods = (requests: readonly { methodName?: string }[], name: string) =>
  requests.filter((r) => r.methodName === name).length

describe("watch", () => {
  it("prints the balance, then only its changes, until Ctrl-C", async () => {
    const { start, ledger, interrupt } = createCli({
      ledger: { balances: [[OWNER, 100_000_000n]] },
    })
    const running = start(["watch", OWNER, "--interval", "100"])
    await vi.waitFor(() => expect(running.stdout).toContain("balance  1 ICP"))

    // Ticks with nothing new print nothing.
    const test = running.test()
    await vi.waitFor(
      () =>
        expect(
          methods(test?.requests ?? [], "icrc1_balance_of")
        ).toBeGreaterThanOrEqual(3),
      { timeout: 2_000 }
    )
    ledger.credit(ACCOUNT, 50_000_000n)
    await vi.waitFor(() =>
      expect(running.stdout).toContain("changed  1.5 ICP (+0.5)")
    )
    await vi.waitFor(
      () =>
        expect(
          methods(test?.requests ?? [], "icrc1_balance_of")
        ).toBeGreaterThanOrEqual(6),
      { timeout: 2_000 }
    )

    interrupt()
    const result = await running.finished
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toEqual([
      expect.stringMatching(/^watching ryjl3-.* every 100 ms; Ctrl-C stops$/),
      "balance  1 ICP",
      "changed  1.5 ICP (+0.5)",
      "stopped",
    ])

    // The symbol and decimals came from the cache after the first tick.
    expect(methods(result.requests, "icrc1_symbol")).toBe(1)
    expect(methods(result.requests, "icrc1_decimals")).toBe(1)
    expect(methods(result.requests, "icrc1_balance_of")).toBeGreaterThanOrEqual(
      6
    )
  })

  it("disposes the client on Ctrl-C: its cache is empty and its calls are cancelled", async () => {
    const { start, interrupt } = createCli({
      ledger: { balances: [[OWNER, 1n]] },
    })
    const running = start(["watch", OWNER, "--interval", "100"])
    await vi.waitFor(() => expect(running.stdout).toHaveLength(2))
    const client = running.test()?.client
    expect(client?.queryClient.getQueryCache().getAll()).toHaveLength(3)

    interrupt()
    expect((await running.finished).exitCode).toBe(0)
    expect(client?.queryClient.getQueryCache().getAll()).toEqual([])
    const after: unknown = client
      ? await ledgerOn(client, LEDGERS.icp)
          .icrc1_fee()
          .catch((e: unknown) => e)
      : undefined
    expect(isReactorError(after) && after.kind).toBe("cancelled")
  })

  it("stops at once when Ctrl-C comes while a read is in flight", async () => {
    const { start, ledger, interrupt } = createCli({
      ledger: { balances: [[OWNER, 1n]] },
    })
    let reads = 0
    let answer: (() => void) | undefined
    const running = start(["watch", OWNER, "--interval", "100"], {
      // The second balance read is answered only when the test says so.
      before: (test) =>
        ledger.mountOn(test, {
          icrc1_balance_of: async () => {
            reads += 1
            if (reads === 2) await new Promise<void>((r) => (answer = r))
            return 1n
          },
        }),
    })
    await vi.waitFor(() => expect(reads).toBe(2))
    interrupt()
    const result = await running.finished
    answer?.()
    expect(result.exitCode).toBe(0)
    expect(result.stdout.at(-1)).toBe("stopped")
  })

  it("--json: one document per event, changes with their difference", async () => {
    const { start, ledger, interrupt } = createCli({
      ledger: { balances: [[OWNER, 300n]] },
    })
    const running = start(["watch", OWNER, "--interval", "100", "--json"])
    await vi.waitFor(() => expect(running.stdout).toHaveLength(1))
    ledger.credit(ACCOUNT, -100n)
    await vi.waitFor(() => expect(running.stdout).toHaveLength(2))
    interrupt()
    const result = await running.finished
    expect(result.docs).toEqual([
      expect.objectContaining({
        ok: true,
        command: "watch",
        event: "balance",
        balance: { units: "300", tokens: "0.000003" },
      }),
      expect.objectContaining({
        event: "change",
        balance: { units: "200", tokens: "0.000002" },
        change: { units: "-100", tokens: "-0.000001" },
      }),
    ])
  })

  it("prints a failed read and goes on watching", async () => {
    const { start, ledger, interrupt } = createCli({
      ledger: { balances: [[OWNER, 1n]] },
    })
    const running = start(["watch", OWNER, "--interval", "100"])
    await vi.waitFor(() => expect(running.stdout).toHaveLength(2))
    // A 400 from the gateway: refused, and not retried.
    running.test()?.refuseNext(400)
    await vi.waitFor(() =>
      expect(running.stderr.join("\n")).toMatch(
        /read failed: not_delivered: .* \(still watching\)/
      )
    )
    ledger.credit(ACCOUNT, 1n)
    await vi.waitFor(() =>
      expect(running.stdout).toContain("changed  0.00000002 ICP (+0.00000001)")
    )
    interrupt()
    expect((await running.finished).exitCode).toBe(0)
  })

  it("refuses an interval under 100 ms before building a client", async () => {
    const { cli } = createCli()
    const result = await cli(["watch", OWNER, "--interval", "10"])
    expect(result.exitCode).toBe(2)
    expect(result.requests).toEqual([])
  })
})
