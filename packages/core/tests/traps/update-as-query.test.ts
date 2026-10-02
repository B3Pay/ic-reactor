/**
 * Trap: an update method read through a query.
 *
 * The mistake a hand-written integration makes: it wraps a canister call in
 * `useQuery`, because that is how data is fetched, and the method it wraps is
 * `icrc1_transfer`. TanStack Query runs a query function again whenever it
 * refetches: when the window regains focus, when the network comes back, when
 * a component mounts again, after an invalidation, when it retries. Each run
 * is another transfer.
 *
 * The guarantee: `client.queryOptions` throws a `TypeError` for an update (or
 * oneway) method at the line that builds the read, which says to use
 * `mutationOptions`, and sends nothing. The one case where an update is a read,
 * a method that answers the same however often it runs (ckBTC's
 * `get_btc_address`), is a written-out opt-in, `{ update: "idempotent" }`,
 * which is bounded: the read runs once per caller, and focus, reconnect and
 * remount do not run it again.
 */
import {
  QueryObserver,
  focusManager,
  onlineManager,
} from "@tanstack/query-core"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import * as shapes from "../fixtures/shapes.js"
import {
  ALICE,
  SIGNED_CALLS_TIMEOUT_MS,
  disposeAll,
  eventually,
  setupLedger,
  sleep,
  transferArg,
  type Ledger,
} from "./ledger.js"

vi.setConfig({ testTimeout: SIGNED_CALLS_TIMEOUT_MS })
afterAll(disposeAll)
afterEach(() => {
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

/** Where the traps run a canister with an update method that is safe to read. */
const BOOK = "qoctq-giaaa-aaaaa-aaaea-cai"

/** A ledger, and next to it a canister whose `address` update answers the same every time. */
function withAddressBook(options?: Parameters<typeof setupLedger>[0]) {
  const l = setupLedger(options)
  l.mock<shapes.Actor>(shapes.actor, BOOK, {
    address: (seed, { caller }) => `${seed}:${caller}`,
  })
  return {
    ...l,
    book: l.client.canister<shapes.Actor>(shapes.actor, { id: BOOK }),
  }
}

/**
 * Plays out what makes TanStack Query refetch: the window losing and regaining
 * focus, the network dropping and coming back, and the component mounting
 * again. After each, `settle` waits for whatever that is going to send.
 */
async function triggerRefetches(
  l: Ledger,
  mountAgain: () => () => void,
  settle: () => Promise<void>
) {
  focusManager.setFocused(false)
  focusManager.setFocused(true)
  await settle()
  onlineManager.setOnline(false)
  onlineManager.setOnline(true)
  await settle()
  const unmount = mountAgain()
  await settle()
  unmount()
  l.client.queryClient.unmount()
}

describe("a read built for an update method", () => {
  it("is refused when it is built, and nothing is sent", () => {
    const l = setupLedger()

    expect(() =>
      l.client.queryOptions(l.ledger, "icrc1_transfer", transferArg(500n))
    ).toThrow(TypeError)
    expect(() =>
      l.client.queryOptions(l.ledger, "icrc1_transfer", transferArg(500n))
    ).toThrow(/mutationOptions/)
    expect(l.sent()).toEqual([])
    expect(l.executed()).toBe(0)
  })

  it("is sent again by a refetch when the method is a plain query, which is what the opt-in below must not be", async () => {
    const l = setupLedger()
    l.client.queryClient.mount()
    const options = () => l.client.queryOptions(l.ledger, "icrc1_fee")
    const observer = new QueryObserver(l.client.queryClient, options())
    const stop = observer.subscribe(() => undefined)
    await eventually(() =>
      expect(observer.getCurrentResult().data).toBe(10_000n)
    )

    // Each trigger sends the read again: the log grows after every one.
    let seen = l.sent().length
    await triggerRefetches(
      l,
      () =>
        new QueryObserver(l.client.queryClient, options()).subscribe(
          () => undefined
        ),
      async () => {
        await eventually(() => expect(l.sent().length).toBeGreaterThan(seen))
        seen = l.sent().length
      }
    )
    stop()

    expect(l.sent().length).toBeGreaterThanOrEqual(4)
  })
})

describe("an update read with { update: 'idempotent' }", () => {
  it("runs once, and is not run again on focus, reconnect or remount", async () => {
    const l = withAddressBook()
    l.client.queryClient.mount()
    const options = () =>
      l.client.queryOptions(l.book, "address", "home", {
        update: "idempotent",
      })
    const observer = new QueryObserver(l.client.queryClient, options())
    const stop = observer.subscribe(() => undefined)
    await eventually(() =>
      expect(observer.getCurrentResult().data).toBe(`home:${ALICE}`)
    )

    // Time enough for a refetch to be sent, if one is going to be.
    await triggerRefetches(
      l,
      () =>
        new QueryObserver(l.client.queryClient, options()).subscribe(
          () => undefined
        ),
      () => sleep(150)
    )
    stop()

    // One call, as Alice; not one per trigger.
    expect(l.calls()).toMatchObject([{ methodName: "address", caller: ALICE }])
  })

  it("is refused for a caller who is not signed in, like any update", async () => {
    const l = withAddressBook({ signedIn: false })

    await expect(
      l.client.queryClient.fetchQuery({
        ...l.client.queryOptions(l.book, "address", "home", {
          update: "idempotent",
        }),
        retry: false,
      })
    ).rejects.toMatchObject({ kind: "unauthenticated", mayHaveExecuted: false })
    expect(l.calls()).toEqual([])
  })
})
