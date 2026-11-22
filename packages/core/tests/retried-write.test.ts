/**
 * A mutation given `retry`: the attempt TanStack Query makes after an attempt
 * that may have executed is never sent (#1037).
 *
 * `client.mutationOptions()` returns `retry: false`, and the guide says to
 * keep it. An app that spreads `retry` over it has TanStack call the mutation
 * function again after a failure, and every call of it signs a new request,
 * which the canister runs as a second write. The client refuses such an
 * attempt once an earlier attempt of the same run may have executed
 * (`outcome_unknown`, code `retried_write`), and still sends it after a
 * failure that proves nothing ran.
 *
 * The ledger here counts what it runs and deduplicates as an ICRC-1 ledger
 * does. A test loses a reply with `dropNextReply()`, so the first attempt ran
 * and its sender cannot tell.
 *
 * The tests run on the TanStack Query the lockfile holds and, in the
 * peer-floor check, on the oldest the peer range accepts, which passes a
 * mutation's functions no run context (before 5.89). What a test says holds
 * on both unless it says otherwise.
 */
import { principal } from "@meantjs/schema"
import {
  MutationObserver,
  QueryClient,
  dehydrate,
  hydrate,
  onlineManager,
} from "@tanstack/query-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RECONCILE_DELAYS_MS } from "../src/call.js"
import { isReactorError, type ReactorError } from "../src/index.js"
import { createTestClient } from "../src/testing/index.js"
import { LEDGER } from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"

const BOB = principal("aaaaa-aa")
const AS_VIEW = Symbol.for("ic-reactor.client.as")

const made: ReturnType<typeof createTestClient>[] = []
afterEach(() => {
  for (const test of made.splice(0)) test.client.dispose()
  onlineManager.setOnline(true)
})

/** A dedupe key, as an ICRC-1 transfer has it. */
const dedupedBy = (arg: icrc1.TransferArg) => arg.created_at_time

const transfer = (
  created_at_time: bigint | null = 1_000n,
  amount = 100n
): icrc1.TransferArg => ({
  to: { owner: BOB, subaccount: null },
  amount,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time,
})

/** What a refused attempt rejects with. */
const retriedWrite = {
  name: "ReactorError",
  kind: "outcome_unknown",
  mayHaveExecuted: true,
  code: "retried_write",
  method: "icrc1_transfer",
  canisterId: LEDGER,
}

/** What an attempt whose reply was lost rejects with. */
const lostReply = { kind: "outcome_unknown", mayHaveExecuted: true }

/**
 * A test client with a ledger that deduplicates by sender and argument, and
 * answers `InsufficientFunds` to an amount over 1,000.
 */
function setup() {
  const test = createTestClient({ identity: 1 })
  made.push(test)
  const seen = new Map<string, bigint>()
  let blocks = 0n
  let handled = 0
  let before: (() => void) | undefined
  test.mock<icrc1.Actor>(icrc1.actor, LEDGER, {
    icrc1_fee: () => 10n,
    icrc1_transfer: (arg, { caller }) => {
      handled += 1
      if (arg.amount > 1_000n) {
        return {
          tag: "Err",
          value: { tag: "InsufficientFunds", value: { balance: 1_000n } },
        }
      }
      const key =
        arg.created_at_time === null
          ? undefined
          : `${caller}:${arg.created_at_time}:${arg.amount}`
      const done = key === undefined ? undefined : seen.get(key)
      if (done !== undefined) {
        return {
          tag: "Err",
          value: { tag: "Duplicate", value: { duplicate_of: done } },
        }
      }
      blocks += 1n
      if (key !== undefined) seen.set(key, blocks)
      const block = blocks
      // After the transfer is booked, as a trap after a commit is.
      before?.()
      return { tag: "Ok", value: block }
    },
  })
  const ledger = test.client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
  const transfers = () =>
    test.requests.filter(
      (request) =>
        request.endpoint === "call" && request.methodName === "icrc1_transfer"
    )
  return {
    ...test,
    ledger,
    /** How many transfers the ledger booked. */
    ran: () => blocks,
    /** How many transfers reached the ledger, the ones it answered `Err` included. */
    handled: () => handled,
    /** How many transfer requests the client sent, the ones turned away included. */
    sent: () => transfers().length,
    /** How many transfers the client signed: one request id each, however often it was sent. */
    signed: () => new Set(transfers().map(({ requestId }) => requestId)).size,
    /** Runs `then` once, after the ledger booked the next transfer and before it answers. */
    afterNextTransfer(then: () => void) {
      before = () => {
        before = undefined
        then()
      }
    },
  }
}

type Setup = ReturnType<typeof setup>

/** The transfer's options with a `retry` of the app's, against the guide. */
const retrying = (
  t: Setup,
  retry: number | ((failureCount: number, error: unknown) => boolean) = 3
) => ({
  ...t.client.mutationOptions(t.ledger, "icrc1_transfer"),
  retry,
  retryDelay: 0,
})

/** The transfer's options as the client returns them. */
const transferOptions = (t: Setup) =>
  t.client.mutationOptions(t.ledger, "icrc1_transfer")

type TransferOptions = ReturnType<typeof transferOptions>

/** What `write` rejects with. */
const rejection = (write: Promise<unknown>): Promise<ReactorError> =>
  write.then(
    (value) => {
      throw new Error(`resolved with ${String(value)}`)
    },
    (error: unknown) => error as ReactorError
  )

/**
 * How long a test waits for what follows a lost reply. Before the attempt
 * rejects, the client reads the request's status back and sends the same
 * request again, in the rounds of `RECONCILE_DELAYS_MS` (#1036). They take
 * most of the second `vi.waitFor` gives by default, which a busy machine, or
 * a process that runs one test alone, then overruns.
 */
const patiently = {
  timeout: RECONCILE_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) + 3_000,
}

/**
 * A run of `observer` that lost its first reply and is held back before the
 * attempt its `retry` asks for: offline, which is where TanStack pauses a
 * retry. Returns the run as its `QueryClient` holds it.
 */
async function pausedBeforeRetry(
  t: Setup,
  queryClient: QueryClient,
  arg: icrc1.TransferArg,
  options: object = {}
) {
  const observer = new MutationObserver(queryClient, {
    ...retrying(t, () => {
      onlineManager.setOnline(false)
      return true
    }),
    ...options,
  })
  t.dropNextReply()
  observer.mutate(arg).catch(() => undefined)
  await vi.waitFor(
    () =>
      expect(observer.getCurrentResult()).toMatchObject({
        isPaused: true,
        failureCount: 1,
      }),
    patiently
  )
  const run = queryClient
    .getMutationCache()
    .getAll()
    .find((mutation) => mutation.state.variables === arg)
  if (run === undefined) throw new Error("the run is not in the cache")
  return run
}

/**
 * Whether the installed TanStack Query hands every attempt of a run the same
 * function context (5.89 and later). The peer-floor check runs these tests on
 * an older release, which passes `mutationFn` none.
 */
async function sharesRunContext(): Promise<boolean> {
  let seen: unknown
  await new MutationObserver(new QueryClient(), {
    mutationFn: (_vars: void, context?: unknown) => {
      seen = context
      return Promise.resolve()
    },
  }).mutate()
  return seen !== undefined
}

describe("a mutation given retry", () => {
  it("sends a write whose reply was lost once, whatever retry asks for", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, retrying(t))
    t.dropNextReply()

    const error = await rejection(observer.mutate(transfer()))

    expect(error).toMatchObject({
      ...retriedWrite,
      message: `[ic-reactor] icrc1_transfer on ${LEDGER}: an earlier attempt of this write may have executed; it was not sent again`,
    })
    // The one request, which the ledger ran.
    expect(t.sent()).toBe(1)
    expect(t.ran()).toBe(1n)
    // TanStack made every attempt `retry` allows, and each was refused.
    expect(observer.getCurrentResult()).toMatchObject({
      status: "error",
      failureCount: 4,
    })
  })

  it("rejects each later attempt with the error of the attempt that may have run as its cause", async () => {
    const t = setup()
    const failures: unknown[] = []
    const observer = new MutationObserver(
      t.client.queryClient,
      retrying(t, (failureCount, failure) => {
        failures.push(failure)
        return failureCount < 3
      })
    )
    t.dropNextReply()

    const error = await rejection(observer.mutate(transfer()))

    const [first, ...refusals] = failures as ReactorError[]
    expect(first).toMatchObject(lostReply)
    expect(first?.code).toBeUndefined()
    expect(refusals).toHaveLength(3)
    for (const refusal of refusals) {
      expect(refusal).toMatchObject(retriedWrite)
      // Never another refusal: the first failure says why the outcome is open.
      expect(refusal.cause).toBe(first)
    }
    expect(error).toBe(refusals[2])
    // The error of this call, for the guard that narrows `err`.
    expect(isReactorError(error, t.ledger, "icrc1_transfer")).toBe(true)
    // Until when a send of the write can still start: the first attempt's.
    expect(typeof error.expiresAt).toBe("bigint")
    expect(error.expiresAt).toBe(first?.expiresAt)
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
      method: "icrc1_transfer",
      canisterId: LEDGER,
      code: "retried_write",
    })
  })

  it.each([
    [
      "HTTP 503",
      // The client sends the request it signed again three times, to learn its
      // outcome (#1036): every one of the four sends is turned away.
      (t: Setup) => t.refuseNext(503, 4),
      { httpStatus: 503 },
      4,
    ],
    [
      "a reject with code 4 after the transfer was booked",
      (t: Setup) => t.afterNextTransfer(() => t.reject(4, "refused late")),
      { kind: "rejected", rejectCode: 4 },
      1,
    ],
    [
      "a trap after the transfer was booked",
      (t: Setup) =>
        t.afterNextTransfer(() => {
          throw new Error("trapped late")
        }),
      { kind: "rejected", rejectCode: 5 },
      1,
    ],
  ])(
    "does not send the retry after %s, which may follow a delivery",
    async (_name, fail, first, sends) => {
      const t = setup()
      const observer = new MutationObserver(
        t.client.queryClient,
        retrying(t, 1)
      )
      fail(t)

      const error = await rejection(observer.mutate(transfer()))

      expect(error).toMatchObject({
        ...retriedWrite,
        cause: { ...first, mayHaveExecuted: true },
      })
      // The first attempt's sends, all of the one request it signed.
      expect(t.sent()).toBe(sends)
      expect(t.signed()).toBe(1)
    }
  )

  it("still sends the retry after an attempt that was turned away before the canister saw it", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, retrying(t))
    t.refuseNext(400, { method: "icrc1_transfer" })

    await expect(observer.mutate(transfer())).resolves.toBe(1n)

    // The request that was turned away, and the retry.
    expect(t.sent()).toBe(2)
    expect(t.ran()).toBe(1n)
  })

  it("still sends the retry after the canister answered Err, which is its answer", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, retrying(t, 1))

    const error = await rejection(observer.mutate(transfer(1_000n, 5_000n)))

    expect(error).toMatchObject({
      kind: "canister_err",
      mayHaveExecuted: false,
      err: { tag: "InsufficientFunds" },
    })
    expect(t.handled()).toBe(2)
  })

  it("stops at the first attempt that may have run, after retries of attempts that did not", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, retrying(t))
    // Turned away, then delivered with its reply lost.
    t.refuseNext(400, { method: "icrc1_transfer" })
    t.dropNextReply({ method: "icrc1_transfer" })

    const error = await rejection(observer.mutate(transfer()))

    expect(error).toMatchObject({ ...retriedWrite, cause: lostReply })
    expect(t.sent()).toBe(2)
    expect(t.ran()).toBe(1n)
  })

  it("sends the next run of the mutation, with the same argument too: pressing again is the user's call", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, retrying(t))
    // No dedupe key: the ledger books every request it gets.
    const arg = transfer(null)
    t.dropNextReply()
    await expect(observer.mutate(arg)).rejects.toMatchObject(retriedWrite)
    expect(t.sent()).toBe(1)

    await expect(observer.mutate(arg)).resolves.toBe(2n)
    await expect(observer.mutate(transfer(null))).resolves.toBe(3n)
    expect(t.sent()).toBe(3)
  })

  it("offers the write from the refusal, and the re-send answers Duplicate", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, retrying(t))
    const arg = transfer()
    t.dropNextReply()
    const error = await rejection(observer.mutate(arg))
    expect(error).toMatchObject(retriedWrite)

    const again = t.client.resendOf(error, t.ledger, "icrc1_transfer", {
      dedupedBy,
    })

    expect(again?.arg).toBe(arg)
    await expect(again?.send()).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate", value: { duplicate_of: 1n } },
    })
    expect(t.ran()).toBe(1n)
    expect(t.sent()).toBe(2)
  })

  it("does not send the retry of a re-send whose reply was lost again, and still offers the write", async () => {
    const t = setup()
    const arg = transfer()
    t.dropNextReply()
    const first = await rejection(t.ledger.icrc1_transfer(arg))
    const again = t.client.resendOf(first, t.ledger, "icrc1_transfer", {
      dedupedBy,
    })
    if (again === undefined) throw new Error("nothing was offered")
    const observer = new MutationObserver(t.client.queryClient, retrying(t))
    t.dropNextReply()

    const error = await rejection(observer.mutate(again.arg))

    expect(error).toMatchObject({ ...retriedWrite, cause: lostReply })
    // The first send and the one re-send, which the ledger found a duplicate.
    expect(t.sent()).toBe(2)
    expect(t.ran()).toBe(1n)
    expect(
      t.client.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })?.arg
    ).toBe(arg)
  })

  it("refuses the retry through a view pinned to its caller as a retried write, whoever is current by then", async () => {
    const t = setup()
    type ViewOf = (principal: string) => typeof t.client
    const viewAs = (t.client as unknown as { [AS_VIEW]: ViewOf })[AS_VIEW]
    // What useClient() returns in a render that shows the sender.
    const pinned = viewAs.call(t.client, t.client.caller())
    const observer = new MutationObserver(t.client.queryClient, {
      ...pinned.mutationOptions(t.ledger, "icrc1_transfer"),
      retry: (failureCount: number) => {
        // The account is switched before the attempt `retry` asks for.
        t.auth.switchTo(2)
        return failureCount < 1
      },
      retryDelay: 0,
    })
    t.dropNextReply()

    const error = await rejection(observer.mutate(transfer()))

    // Not `caller_changed`, which would say nothing ran.
    expect(error).toMatchObject({ ...retriedWrite, cause: lostReply })
    expect(isReactorError(error, t.ledger, "icrc1_transfer")).toBe(true)
    expect(t.sent()).toBe(1)
  })

  it("refuses a second run through a stale pinned view on another QueryClient as its changed caller's, while the first waits to retry: a run answers for its own attempts", async ({
    skip,
  }) => {
    if (!(await sharesRunContext())) {
      skip(
        "this TanStack Query passes mutationFn no run context, so the client cannot tell the runs of one observer with one argument apart"
      )
    }
    const t = setup()
    type ViewOf = (principal: string) => typeof t.client
    const viewAs = (t.client as unknown as { [AS_VIEW]: ViewOf })[AS_VIEW]
    // What useClient() returned in the render the user still sees.
    const pinned = viewAs.call(t.client, t.client.caller())
    // An app's own QueryClient: the client's MutationCache sees none of its
    // runs start.
    const queryClient = new QueryClient()
    const arg = transfer(null)
    let held = false
    const observer = new MutationObserver(queryClient, {
      ...pinned.mutationOptions(t.ledger, "icrc1_transfer"),
      retry: (failureCount: number) => {
        // The first run is held back before its one retry.
        if (!held) onlineManager.setOnline(false)
        held = true
        return failureCount < 1
      },
      retryDelay: 0,
    })
    t.afterNextTransfer(() => {
      throw new Error("trapped late")
    })
    const first = observer.mutate(arg)
    first.catch(() => undefined)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult()).toMatchObject({
        isPaused: true,
        failureCount: 1,
      })
    )
    onlineManager.setOnline(true)
    // The account is switched, and the user presses again before a render
    // caught up.
    t.auth.switchTo(2)

    const second = await rejection(observer.mutate(arg))

    // No attempt of this run was sent, and its error says so: the trap is
    // the first run's.
    expect(second).toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    })
    expect(second.cause).toBeUndefined()
    // The first run's retry is refused as the retry it is.
    void queryClient.resumePausedMutations()
    await expect(first).rejects.toMatchObject({
      ...retriedWrite,
      cause: { kind: "rejected", rejectCode: 5, mayHaveExecuted: true },
    })
    expect(t.sent()).toBe(1)
  })

  it("refuses the retry on a disposed client as a retried write", async () => {
    const t = setup()
    const observer = new MutationObserver(
      t.client.queryClient,
      retrying(t, (failureCount) => {
        t.client.dispose()
        return failureCount < 1
      })
    )
    t.dropNextReply()

    const error = await rejection(observer.mutate(transfer()))

    // Not `client_disposed`, which would say nothing ran.
    expect(error).toMatchObject({ ...retriedWrite, cause: lostReply })
    expect(t.sent()).toBe(1)
  })

  it("refreshes the canister's reads when the run ends on the refusal after an account switch, as after any unknown outcome", async () => {
    const t = setup()
    // A read made signed out, which a switch of account leaves in the cache.
    await t.auth.signOut()
    const fee = t.client.queryOptions(t.ledger, "icrc1_fee")
    await t.client.queryClient.fetchQuery(fee)
    await t.auth.signIn()
    const observer = new MutationObserver(
      t.client.queryClient,
      retrying(t, (failureCount) => {
        t.auth.switchTo(2)
        return failureCount < 1
      })
    )
    t.dropNextReply()

    await expect(observer.mutate(transfer())).rejects.toMatchObject(
      retriedWrite
    )

    // `caller_changed` says nothing ran, and would have left the read as it
    // was while the ledger had booked the transfer.
    expect(t.ran()).toBe(1n)
    expect(
      t.client.queryClient.getQueryState(fee.queryKey)?.isInvalidated
    ).toBe(true)
  })

  it("does not send the retry when an onMutate of the app's replaced the given one", async () => {
    const t = setup()
    const observer = new MutationObserver(t.client.queryClient, {
      ...retrying(t),
      // TanStack's optimistic-update recipe.
      onMutate: () => ({ previous: "the app's own context" }),
    })
    t.dropNextReply()

    await expect(observer.mutate(transfer())).rejects.toMatchObject(
      retriedWrite
    )
    expect(t.sent()).toBe(1)
  })

  it("does not send the retry of a run on another QueryClient, and sends that QueryClient's next run", async () => {
    const t = setup()
    const observer = new MutationObserver(new QueryClient(), retrying(t))
    const arg = transfer(null)
    t.dropNextReply()

    await expect(observer.mutate(arg)).rejects.toMatchObject(retriedWrite)
    expect(t.sent()).toBe(1)

    await expect(observer.mutate(arg)).resolves.toBe(2n)
    expect(t.sent()).toBe(2)
  })

  it("sends another run of the same observer with the same argument while the first waits to retry: each run is told apart by its context", async ({
    skip,
  }) => {
    if (!(await sharesRunContext())) {
      skip(
        "this TanStack Query passes mutationFn no run context, so the client cannot tell the runs of one observer with one argument apart, and sends neither"
      )
    }
    const t = setup()
    const arg = transfer(null)
    const observer = new MutationObserver(
      t.client.queryClient,
      retrying(t, (failureCount) => {
        // Held back before its one retry.
        if (failureCount === 0) onlineManager.setOnline(false)
        return failureCount < 1
      })
    )
    t.dropNextReply()
    const first = observer.mutate(arg)
    first.catch(() => undefined)
    await vi.waitFor(
      () =>
        expect(observer.getCurrentResult()).toMatchObject({
          isPaused: true,
          failureCount: 1,
        }),
      patiently
    )
    onlineManager.setOnline(true)

    // The user presses again while the first run is held back.
    await expect(observer.mutate(arg)).resolves.toBe(2n)

    void t.client.queryClient.resumePausedMutations()
    await expect(first).rejects.toMatchObject(retriedWrite)
    expect(t.sent()).toBe(2)
  })

  it("refuses an attempt with no run context while a run of its options with its argument waits to retry (TanStack before 5.89)", async () => {
    const t = setup()
    const arg = transfer(null)
    const run = await pausedBeforeRetry(t, t.client.queryClient, arg)
    const first = run.state.failureReason
    expect(first).toMatchObject(lostReply)
    const { mutationFn } = t.client.mutationOptions(t.ledger, "icrc1_transfer")

    // As TanStack before 5.89 makes the attempt: mutationFn called as a
    // method of the run's options, with the argument alone.
    const error = await rejection(mutationFn.call(run.options, arg))

    expect(error).toMatchObject(retriedWrite)
    expect(error.cause).toBe(first)
    // A later render handed the run new options: TanStack's record of the
    // run still says an attempt of it may have run.
    run.setOptions({ ...run.options })
    await expect(mutationFn.call(run.options, arg)).rejects.toMatchObject(
      retriedWrite
    )
    expect(t.sent()).toBe(1)
    // A write of another argument through the same options is its own.
    onlineManager.setOnline(true)
    await expect(mutationFn.call(run.options, transfer(null))).resolves.toBe(2n)
  })

  it("keeps the first failure as the cause when TanStack's record of the run holds a refusal", async () => {
    const t = setup()
    const arg = transfer(null)
    const failures: unknown[] = []
    const observer = new MutationObserver(
      t.client.queryClient,
      retrying(t, (failureCount, failure) => {
        failures.push(failure)
        // Held back once the retry was refused, before the next one.
        if (failureCount === 1) onlineManager.setOnline(false)
        return true
      })
    )
    t.dropNextReply()
    observer.mutate(arg).catch(() => undefined)
    await vi.waitFor(
      () =>
        expect(observer.getCurrentResult()).toMatchObject({
          isPaused: true,
          failureCount: 2,
        }),
      patiently
    )
    const [first] = failures
    const [run] = t.client.queryClient.getMutationCache().getAll()
    expect(run?.state.failureReason).toMatchObject(retriedWrite)
    const { mutationFn } = t.client.mutationOptions(t.ledger, "icrc1_transfer")

    // The third attempt, as TanStack before 5.89 makes it.
    const error = await rejection(mutationFn.call(run?.options, arg))

    expect(error).toMatchObject(retriedWrite)
    expect(error.cause).toBe(first)
    expect(t.sent()).toBe(1)
  })

  it("refuses a retried attempt with no run context on another QueryClient, until the next run of its options with its argument (TanStack before 5.89)", async () => {
    const t = setup()
    const options = t.client.mutationOptions(t.ledger, "icrc1_transfer")
    const arg = transfer(null)
    // One observer's options object: TanStack before 5.89 calls onMutate and
    // mutationFn as its methods, with the argument alone.
    const observed = { ...options }
    options.onMutate.call(observed, arg)
    t.dropNextReply()
    const first = await rejection(options.mutationFn.call(observed, arg))
    expect(first).toMatchObject(lostReply)

    // The attempt a `retry` asks for.
    const error = await rejection(options.mutationFn.call(observed, arg))

    expect(error).toMatchObject(retriedWrite)
    expect(error.cause).toBe(first)
    expect(t.sent()).toBe(1)
    // A run of the observer with another argument is sent.
    const other = transfer(null)
    options.onMutate.call(observed, other)
    await expect(options.mutationFn.call(observed, other)).resolves.toBe(2n)
    // And so is its next run with the first argument, which the user started.
    options.onMutate.call(observed, arg)
    await expect(options.mutationFn.call(observed, arg)).resolves.toBe(3n)
  })

  /** What a write with no run of its options pending is refused as. */
  const nobodyStarted = {
    kind: "cancelled",
    code: "caller_changed",
    mayHaveExecuted: false,
  }

  it.each([
    [
      "TanStack calls the client's onSettled, as a method of the run's options",
      (_options: TransferOptions, observed: object) => observed,
    ],
    [
      "an onSettled of the app's calls the client's, as a method of the options the client returned",
      (options: TransferOptions) => options,
    ],
  ])(
    "keeps nothing of a run with no run context once it settled, when %s (TanStack before 5.89)",
    async (_name, calledOn) => {
      const t = setup()
      const options = transferOptions(t)
      const arg = transfer(null)
      // One observer's options object, which lives as long as the observer.
      const observed = { ...options }
      const started = options.onMutate.call(observed, arg)
      t.dropNextReply()
      const first = await rejection(options.mutationFn.call(observed, arg))
      const refused = await rejection(options.mutationFn.call(observed, arg))
      expect(refused).toMatchObject(retriedWrite)
      expect(refused.cause).toBe(first)

      // The run ends on the refusal: onSettled gets what onMutate returned.
      await options.onSettled.call(
        calledOn(options, observed),
        undefined,
        refused as never,
        arg,
        started
      )

      // The argument and the error are no longer held for these options. An
      // attempt TanStack never makes shows it: with no run of the options
      // pending it is refused as one nobody started, not from a record.
      const stray = await rejection(options.mutationFn.call(observed, arg))
      expect(stray).toMatchObject(nobodyStarted)
      expect(stray.cause).toBeUndefined()
      expect(t.sent()).toBe(1)
    }
  )

  it.each([
    [
      "another run of its options settled",
      async (options: TransferOptions, observed: object) => {
        const other = transfer(null)
        const started = options.onMutate.call(observed, other)
        await options.mutationFn.call(observed, other)
        await options.onSettled.call(observed, 2n, null, other, started)
      },
    ],
    [
      "onSettled was called twice for another run, as an onSettled of the app's might call it",
      async (options: TransferOptions, observed: object) => {
        const other = transfer(null)
        const started = options.onMutate.call(observed, other)
        await options.mutationFn.call(observed, other)
        await options.onSettled.call(observed, 2n, null, other, started)
        await options.onSettled.call(observed, 2n, null, other, started)
      },
    ],
    [
      "a run the client's onMutate did not start settled, of which TanStack hands onSettled nothing",
      async (options: TransferOptions, observed: object) => {
        await options.onSettled.call(
          observed,
          undefined,
          null,
          transfer(null),
          undefined
        )
      },
    ],
  ])(
    "still refuses the retry of a run with no run context after %s (TanStack before 5.89)",
    async (_name, meanwhile) => {
      const t = setup()
      const options = transferOptions(t)
      const observed = { ...options }
      const arg = transfer(null)
      const started = options.onMutate.call(observed, arg)
      t.dropNextReply()
      const first = await rejection(options.mutationFn.call(observed, arg))

      // While the first run waits to retry.
      await meanwhile(options, observed)

      const refused = await rejection(options.mutationFn.call(observed, arg))
      expect(refused).toMatchObject(retriedWrite)
      expect(refused.cause).toBe(first)
      // Once the first run settled too, nothing is kept.
      await options.onSettled.call(
        observed,
        undefined,
        refused as never,
        arg,
        started
      )
      await expect(
        options.mutationFn.call(observed, arg)
      ).rejects.toMatchObject(nobodyStarted)
    }
  )

  /** What `useClient()` returns in a render that shows the current caller. */
  const pinnedView = (t: Setup) => {
    type ViewOf = (principal: string) => typeof t.client
    const viewAs = (t.client as unknown as { [AS_VIEW]: ViewOf })[AS_VIEW]
    return viewAs.call(t.client, t.client.caller())
  }

  it.each([
    [
      "on the client's own QueryClient",
      (t: Setup) => [transferOptions(t), t.client.queryClient] as const,
    ],
    [
      "on another QueryClient",
      (t: Setup) => [transferOptions(t), new QueryClient()] as const,
    ],
    [
      "through the view useClient() returns",
      (t: Setup) =>
        [
          pinnedView(t).mutationOptions(t.ledger, "icrc1_transfer"),
          t.client.queryClient,
        ] as const,
    ],
  ])(
    "knows the run of a write that a function of the app's own calls with both arguments, %s: its retry is not sent",
    async (_name, built) => {
      const t = setup()
      const [options, queryClient] = built(t)
      const observer = new MutationObserver(queryClient, {
        ...options,
        // A step of the app's own before the write, as the guide says to
        // write it: the client's function gets the context TanStack handed
        // this one, and here an argument made anew for each attempt.
        mutationFn: async (arg: icrc1.TransferArg, context?: unknown) => {
          const fee = await t.ledger.icrc1_fee()
          return options.mutationFn({ ...arg, fee }, context)
        },
        retry: 3,
        retryDelay: 0,
      })
      t.dropNextReply()

      const error = await rejection(observer.mutate(transfer(null)))

      if (await sharesRunContext()) {
        expect(error).toMatchObject({ ...retriedWrite, cause: lostReply })
        expect(t.sent()).toBe(1)
      } else {
        // TanStack before 5.89 hands a mutationFn no context to pass on. The
        // client cannot tell which run the call is for, and refuses it.
        expect(error).toMatchObject(nobodyStarted)
        expect(t.sent()).toBe(0)
      }
    }
  )

  it("sends the re-send a function of the app's own makes after a step of its own failed: that failure is not the write's", async () => {
    const t = setup()
    const arg = transfer()
    t.dropNextReply()
    const first = await rejection(t.ledger.icrc1_transfer(arg))
    const again = t.client.resendOf(first, t.ledger, "icrc1_transfer", {
      dedupedBy,
    })
    if (again === undefined) throw new Error("nothing was offered")
    const options = transferOptions(t)
    let failed = false
    const observer = new MutationObserver(t.client.queryClient, {
      ...options,
      // Called on the run's options with the argument alone, so the client
      // looks the run up in TanStack's record, which holds the failure of
      // the app's own step and nothing of the client's.
      mutationFn(this: unknown, offered: icrc1.TransferArg) {
        if (!failed) {
          failed = true
          return Promise.reject(new TypeError("the app's own step failed"))
        }
        return options.mutationFn.call(this, offered)
      },
      retry: 1,
      retryDelay: 0,
    })

    // The re-send went out, and the ledger found the transfer of the first
    // send.
    await expect(observer.mutate(again.arg)).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate", value: { duplicate_of: 1n } },
    })
    expect(t.sent()).toBe(2)
    expect(t.ran()).toBe(1n)
  })

  it("leaves a call of mutationFn by hand alone: it is a new call each time", async () => {
    const t = setup()
    const options = t.client.mutationOptions(t.ledger, "icrc1_transfer")
    const arg = transfer(null)
    t.dropNextReply()
    await expect(options.mutationFn(arg)).rejects.toMatchObject(lostReply)

    // No run of TanStack's: the app decided to call again, as it may with
    // the canister's own method.
    await expect(options.mutationFn(arg)).resolves.toBe(2n)
    expect(t.sent()).toBe(2)
  })

  it("refuses a run TanStack restored from a persister with an attempt that may have run, as a retried write", async () => {
    const t = setup()
    const { queryClient } = t.client
    const arg = transfer(null)
    const paused = await pausedBeforeRetry(t, queryClient, arg)
    // What a persister writes and, after a reload, reads back: JSON, in
    // which the failure is a plain object and no error.
    const persisted = JSON.parse(
      JSON.stringify(dehydrate(queryClient), (_key, value: unknown) =>
        typeof value === "bigint" ? { $bigint: `${value}` } : value
      ),
      (_key, value: unknown) =>
        typeof value === "object" && value !== null && "$bigint" in value
          ? BigInt((value as { $bigint: string }).$bigint)
          : value
    ) as ReturnType<typeof dehydrate>
    expect(persisted.mutations[0]?.state.failureReason).toEqual({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
      method: "icrc1_transfer",
      canisterId: LEDGER,
    })
    queryClient.getMutationCache().clear()
    // A restored mutation takes its mutationFn from the defaults.
    queryClient.setMutationDefaults(paused.options.mutationKey as never, {
      mutationFn: paused.options.mutationFn as never,
    })
    hydrate(queryClient, persisted)
    onlineManager.setOnline(true)
    await queryClient.resumePausedMutations()

    const [restored] = queryClient.getMutationCache().getAll()
    // Not `caller_changed`, which the client answers a restored run whose
    // caller it does not know, and which would say nothing ran.
    await vi.waitFor(() =>
      expect(restored?.state.error).toMatchObject({
        ...retriedWrite,
        cause: lostReply,
      })
    )
    expect(t.sent()).toBe(1)
  })

  it("refuses a restored run whose persister kept no field of its failure as a retried write: nothing says the attempt did not run", async () => {
    const t = setup()
    const { queryClient } = t.client
    const arg = transfer(null)
    const paused = await pausedBeforeRetry(t, queryClient, arg)
    const failed = paused.state.failureReason as ReactorError
    // What a persister that stores the state itself keeps, as IndexedDB
    // does: a structured clone, in which an error is left its message alone.
    const persisted = structuredClone(dehydrate(queryClient))
    const kept = persisted.mutations[0]?.state.failureReason as unknown as Error
    expect(kept).toBeInstanceOf(Error)
    expect(kept.message).toBe(failed.message)
    expect(kept).not.toHaveProperty("mayHaveExecuted")
    queryClient.getMutationCache().clear()
    queryClient.setMutationDefaults(paused.options.mutationKey as never, {
      mutationFn: paused.options.mutationFn as never,
    })
    hydrate(queryClient, persisted)
    onlineManager.setOnline(true)
    await queryClient.resumePausedMutations()

    const [restored] = queryClient.getMutationCache().getAll()
    // Not `caller_changed`, which tells the app to call mutate() again.
    await vi.waitFor(() =>
      expect(restored?.state.error).toMatchObject({
        ...retriedWrite,
        cause: { message: failed.message },
      })
    )
    expect(t.sent()).toBe(1)
  })
})
