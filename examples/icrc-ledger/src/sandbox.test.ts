// The Sandbox tab's ledger, run in Node: the same createSandbox() the page
// uses, so what these tests pin is what the page shows.
import { principal, type Principal } from "@candid-core/schema"
import { isReactorError, type ReactorError } from "@ic-reactor/core"
import { MutationObserver, QueryObserver } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { TransferArg } from "./canisters/icrc1.ts"
import {
  DECIMALS,
  FEE,
  SEED_1,
  SEED_2,
  START_BALANCES,
  createSandbox,
  sandboxBtcAddress,
  type Fault,
  type Sandbox,
} from "./sandbox.ts"
import { readTransferForm } from "./transfer-form.ts"

const made: Sandbox[] = []

function setup(): Sandbox {
  const sandbox = createSandbox()
  made.push(sandbox)
  return sandbox
}

afterEach(() => {
  for (const sandbox of made.splice(0)) sandbox.client.dispose()
})

const account = (owner: Principal) => ({ owner, subaccount: null })

const START_1 = START_BALANCES[0]![1]
const START_2 = START_BALANCES[1]![1]
const SUPPLY = START_1 + START_2

/** 1.5 ICP from whoever is signed in to seed 2. */
const transferArg = (overrides: Partial<TransferArg> = {}): TransferArg => ({
  to: account(SEED_2),
  amount: 150_000_000n,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
  ...overrides,
})

/** What `promise` rejected with; fails the test if it resolved. */
async function rejection(
  promise: Promise<unknown>
): Promise<ReactorError<unknown>> {
  try {
    await promise
  } catch (error) {
    if (isReactorError(error)) return error
    throw error
  }
  throw new Error("expected the call to fail, and it succeeded")
}

/** The `icrc1_transfer` calls the replica received after `from`. */
const transferCalls = (sandbox: Sandbox, from = 0) =>
  sandbox.requests
    .slice(from)
    .filter((r) => r.endpoint === "call" && r.methodName === "icrc1_transfer")

const balanceOf = (sandbox: Sandbox, owner: Principal) =>
  sandbox.ledger.icrc1_balance_of(account(owner))

/**
 * Runs a transfer the way the page does: `client.mutationOptions()` in a
 * MutationObserver, with the sender's balance read by an active QueryObserver
 * (a rendered `useQuery`), so the mutation's re-read is visible. As on the
 * page, a fault is armed once the balance is in, just before the send: an
 * HTTP refusal is for whichever request comes next.
 */
async function transferAsThePageDoes(
  sandbox: Sandbox,
  arg: TransferArg,
  fault?: Fault
) {
  const { client, ledger } = sandbox
  const balance = new QueryObserver(
    client.queryClient,
    client.queryOptions(
      ledger,
      "icrc1_balance_of",
      account(principal(client.caller()))
    )
  )
  const stop = balance.subscribe(() => {})
  try {
    const before = (await balance.refetch()).data
    if (fault !== undefined) sandbox.arm(fault)
    const transfer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(ledger, "icrc1_transfer")
    )
    let error: ReactorError<unknown> | undefined
    let block: bigint | undefined
    try {
      block = await transfer.mutate(arg)
    } catch (caught) {
      if (!isReactorError(caught)) throw caught
      error = caught
    }
    // The mutation settles only after its onSettled re-read the active reads.
    return { before, after: balance.getCurrentResult().data, block, error }
  } finally {
    stop()
  }
}

describe("the mocked ICRC-1 ledger", () => {
  it("knows the principals of seeds 1 and 2 that the test client signs as", () => {
    const { client, auth } = setup()
    expect(client.caller()).toBe(SEED_1)
    auth.switchTo(2)
    expect(client.caller()).toBe(SEED_2)
  })

  it("moves the amount to the recipient and burns the fee from the sender", async () => {
    const sandbox = setup()
    const { ledger } = sandbox

    await expect(ledger.icrc1_transfer(transferArg())).resolves.toBe(0n)

    await expect(balanceOf(sandbox, SEED_1)).resolves.toBe(
      START_1 - 150_000_000n - FEE
    )
    await expect(balanceOf(sandbox, SEED_2)).resolves.toBe(
      START_2 + 150_000_000n
    )
    await expect(ledger.icrc1_total_supply()).resolves.toBe(SUPPLY - FEE)
  })

  it("sends as whoever is signed in: after a switch, seed 2 pays", async () => {
    const sandbox = setup()
    sandbox.auth.switchTo(2)

    await sandbox.ledger.icrc1_transfer(
      transferArg({ to: account(SEED_1), amount: 100_000_000n })
    )

    await expect(balanceOf(sandbox, SEED_2)).resolves.toBe(
      START_2 - 100_000_000n - FEE
    )
    await expect(balanceOf(sandbox, SEED_1)).resolves.toBe(
      START_1 + 100_000_000n
    )
  })

  it("rejects an overdraft as a canister_err carrying InsufficientFunds, and moves nothing", async () => {
    const sandbox = setup()

    const error = await rejection(
      sandbox.ledger.icrc1_transfer(transferArg({ amount: START_1 }))
    )

    expect(error.kind).toBe("canister_err")
    expect(error.mayHaveExecuted).toBe(false)
    expect(error.err).toEqual({
      tag: "InsufficientFunds",
      value: { balance: START_1 },
    })
    await expect(balanceOf(sandbox, SEED_1)).resolves.toBe(START_1)
  })

  it("rejects a fee other than its own with BadFee", async () => {
    const sandbox = setup()

    const error = await rejection(
      sandbox.ledger.icrc1_transfer(transferArg({ fee: FEE + 1n }))
    )

    expect(error.kind).toBe("canister_err")
    expect(error.err).toEqual({ tag: "BadFee", value: { expected_fee: FEE } })
  })

  it("answers the same transfer, created_at_time included, with Duplicate", async () => {
    const sandbox = setup()
    const arg = transferArg({
      created_at_time: BigInt(Date.now()) * 1_000_000n,
    })

    await expect(sandbox.ledger.icrc1_transfer(arg)).resolves.toBe(0n)
    const error = await rejection(sandbox.ledger.icrc1_transfer(arg))

    expect(error.err).toEqual({ tag: "Duplicate", value: { duplicate_of: 0n } })
    await expect(balanceOf(sandbox, SEED_1)).resolves.toBe(
      START_1 - 150_000_000n - FEE
    )
  })
})

describe("deduplication on the mocked ledger, as the page's transfers meet it", () => {
  const arg = (read: ReturnType<typeof readTransferForm>): TransferArg => {
    if (!read.ok) throw new Error(`refused: ${read.reason}`)
    return read.arg
  }

  it("executes two transfers of the same amount made in the same millisecond, and answers a re-send Duplicate of the first one's block", async () => {
    const sandbox = setup()
    // One clock reading for both, as two presses of Send in one millisecond.
    const nowMs = Date.now()
    const form = { to: SEED_2, amount: "1.5", fee: "" }
    const first = arg(readTransferForm(form, DECIMALS, nowMs))
    const second = arg(readTransferForm(form, DECIMALS, nowMs))

    // The first one runs (block 0), but its reply is lost.
    sandbox.arm("lost-reply")
    const lost = await rejection(sandbox.ledger.icrc1_transfer(first))
    expect(lost.mayHaveExecuted).toBe(true)

    // The second is a transfer of its own, not the first one's duplicate.
    await expect(sandbox.ledger.icrc1_transfer(second)).resolves.toBe(1n)
    // The first one's re-send is answered Duplicate, with the first's block.
    const resent = await rejection(sandbox.ledger.icrc1_transfer(first))
    expect(resent.err).toEqual({
      tag: "Duplicate",
      value: { duplicate_of: 0n },
    })
    // Two transfers paid, each once.
    await expect(balanceOf(sandbox, SEED_2)).resolves.toBe(
      START_2 + 2n * 150_000_000n
    )
    await expect(balanceOf(sandbox, SEED_1)).resolves.toBe(
      START_1 - 2n * (150_000_000n + FEE)
    )
  })

  it("takes no memo and an empty memo for two transfers", async () => {
    const sandbox = setup()
    const created_at_time = BigInt(Date.now()) * 1_000_000n

    await expect(
      sandbox.ledger.icrc1_transfer(transferArg({ created_at_time }))
    ).resolves.toBe(0n)
    await expect(
      sandbox.ledger.icrc1_transfer(
        transferArg({ created_at_time, memo: new Uint8Array(0) })
      )
    ).resolves.toBe(1n)
  })
})

describe("the faults the page arms, as the client reports them", () => {
  it("a lost reply is outcome_unknown, may have executed, and the re-read shows the debit", async () => {
    const sandbox = setup()
    const arg = transferArg({
      created_at_time: BigInt(Date.now()) * 1_000_000n,
    })

    const { before, after, error } = await transferAsThePageDoes(
      sandbox,
      arg,
      "lost-reply"
    )

    expect(error?.kind).toBe("outcome_unknown")
    expect(error?.mayHaveExecuted).toBe(true)
    expect(before).toBe(START_1)
    expect(after).toBe(START_1 - arg.amount - FEE)
    // Sent once and never again by the client: it cannot know it is safe.
    expect(transferCalls(sandbox)).toHaveLength(1)
    expect(transferCalls(sandbox)[0]?.dropped).toBe(true)

    // The page's "send the same transfer again": the ledger knows it.
    const again = await rejection(sandbox.ledger.icrc1_transfer(arg))
    expect(again.err).toEqual({ tag: "Duplicate", value: { duplicate_of: 0n } })
  })

  it("a reject with code 4 may have executed; here the re-read shows nothing moved", async () => {
    const sandbox = setup()

    const { before, after, error } = await transferAsThePageDoes(
      sandbox,
      transferArg(),
      "reject-4"
    )

    expect(error?.kind).toBe("rejected")
    expect(error?.rejectCode).toBe(4)
    expect(error?.mayHaveExecuted).toBe(true)
    expect(after).toBe(before)
    expect(transferCalls(sandbox)).toHaveLength(1)
  })

  it("is sent a second time by the client after one refusal with status 429, and goes through", async () => {
    const sandbox = setup()

    const { block, error, after } = await transferAsThePageDoes(
      sandbox,
      transferArg(),
      "http-429"
    )

    expect(error).toBeUndefined()
    expect(block).toBe(0n)
    expect(after).toBe(START_1 - 150_000_000n - FEE)
    const calls = transferCalls(sandbox)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.refused).toContain("429")
    expect(calls[1]?.refused).toBeUndefined()
  })

  it("is sent a second time by the client after one transient reject (code 2), and goes through", async () => {
    const sandbox = setup()

    const { block, error } = await transferAsThePageDoes(
      sandbox,
      transferArg(),
      "reject-2"
    )

    expect(error).toBeUndefined()
    expect(block).toBe(0n)
    expect(transferCalls(sandbox)).toHaveLength(2)
  })

  it("gives up after three refusals with status 429 as not_delivered, which certainly did not execute", async () => {
    const sandbox = setup()

    const { before, after, error } = await transferAsThePageDoes(
      sandbox,
      transferArg(),
      "http-429-x3"
    )

    expect(error?.kind).toBe("not_delivered")
    expect(error?.httpStatus).toBe(429)
    expect(error?.mayHaveExecuted).toBe(false)
    expect(after).toBe(before)
    // The first send and the two re-sends the client allows itself.
    expect(transferCalls(sandbox)).toHaveLength(3)
  })

  it("refuses a transfer while signed out, before anything is sent", async () => {
    const sandbox = setup()
    await sandbox.auth.signOut()
    const seen = sandbox.requests.length

    const direct = await rejection(sandbox.ledger.icrc1_transfer(transferArg()))
    const { error } = await transferAsThePageDoes(sandbox, transferArg())

    for (const refusal of [direct, error]) {
      expect(refusal?.kind).toBe("unauthenticated")
      expect(refusal?.mayHaveExecuted).toBe(false)
    }
    expect(transferCalls(sandbox, seen)).toHaveLength(0)
    await expect(balanceOf(sandbox, SEED_1)).resolves.toBe(START_1)
  })
})

describe("the ckBTC deposit address, an update read with { update: 'idempotent' }", () => {
  /** The `get_btc_address` calls that reached the minter, and their callers. */
  const minterCalls = (sandbox: Sandbox) =>
    sandbox.requests.filter(
      (r) =>
        r.endpoint === "call" &&
        r.methodName === "get_btc_address" &&
        r.refused === undefined
    )

  const ownAddress = { owner: null, subaccount: null }

  /** The page's read of the caller's address, as an active observer. */
  function observeAddress(sandbox: Sandbox) {
    const { client, minter } = sandbox
    const observer = new QueryObserver(
      client.queryClient,
      client.queryOptions(minter, "get_btc_address", ownAddress, {
        update: "idempotent",
      })
    )
    const stop = observer.subscribe(() => {})
    /** The address once the read has settled. */
    const settled = () =>
      vi.waitFor(() => {
        const result = observer.getCurrentResult()
        if (result.status === "pending") throw new Error("still pending")
        return result.data
      })
    return { stop, settled }
  }

  it("is refused by queryOptions without the opt-in, since a refetch would run the update again", () => {
    const { client, minter } = setup()
    expect(() =>
      client.queryOptions(minter, "get_btc_address", ownAddress)
    ).toThrow(TypeError)
  })

  it("runs once per caller: a second mount, a ledger transfer and a cache-wide refetch do not run it again", async () => {
    const sandbox = setup()
    const first = observeAddress(sandbox)
    await expect(first.settled()).resolves.toBe(
      sandboxBtcAddress(account(SEED_1))
    )

    // Mounted again, as when the page shows the address again.
    const second = observeAddress(sandbox)
    await expect(second.settled()).resolves.toBe(
      sandboxBtcAddress(account(SEED_1))
    )
    // A transfer invalidates the ledger's reads, not the minter's.
    await transferAsThePageDoes(sandbox, transferArg())
    // Every stale read refetched: this one is never stale.
    await sandbox.client.queryClient.refetchQueries({ stale: true })

    expect(minterCalls(sandbox)).toHaveLength(1)
    expect(minterCalls(sandbox)[0]?.caller).toBe(SEED_1)
    first.stop()
    second.stop()
  })

  it("is sent as an update, signed by the caller, and gives each caller its own address under its own key", async () => {
    const sandbox = setup()
    const { client, minter, auth } = sandbox
    const read = () =>
      client.queryClient.fetchQuery(
        client.queryOptions(minter, "get_btc_address", ownAddress, {
          update: "idempotent",
        })
      )

    const one = await read()
    auth.switchTo(2)
    const two = await read()
    auth.switchTo(1)
    const oneAgain = await read()

    expect(one).toBe(sandboxBtcAddress(account(SEED_1)))
    expect(two).toBe(sandboxBtcAddress(account(SEED_2)))
    expect(oneAgain).toBe(one)
    // Back to seed 1, its address is still cached: two calls in all.
    expect(minterCalls(sandbox).map((r) => r.caller)).toEqual([SEED_1, SEED_2])
  })

  it("is refused while signed out, before anything is sent", async () => {
    const sandbox = setup()
    await sandbox.auth.signOut()
    const { client, minter } = sandbox

    const error = await rejection(
      client.queryClient.fetchQuery(
        client.queryOptions(minter, "get_btc_address", ownAddress, {
          update: "idempotent",
        })
      )
    )

    expect(error.kind).toBe("unauthenticated")
    expect(minterCalls(sandbox)).toHaveLength(0)
  })
})
