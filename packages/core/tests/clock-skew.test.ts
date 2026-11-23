/**
 * A device whose clock is off.
 *
 * A replica accepts a request only when its ingress expiry is between the
 * replica's clock and five and a half minutes after it. It checks that for
 * every `call`, and for a `query` and a `read_state` whose sender is not
 * anonymous (`rs/validator/src/ingress_validation.rs` in dfinity/ic). An
 * agent signs with the host's clock, four to five minutes ahead of it, so on
 * a host a few minutes ahead of the IC, or behind it, the first signed
 * request is refused. The agent then reads the IC's time and signs by it,
 * but the request that met the refusal fails all the same: the agent sends
 * its `read_state` again as it was signed, with the expiry that was refused.
 * It reads the time on that first refusal only, so when the host's clock is
 * changed later, the client has it read the time again.
 *
 * The fake replica checks no expiry, so `offClock` checks it in front of the
 * fake, with a replica's rule and a replica's answer. The clock it moves is
 * the IC's: the host's stays the true one, and is "ahead" when the IC's time
 * is behind it.
 */
import { Cbor } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { principal } from "@meantjs/schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createClient, type Client } from "../src/client.js"
import { createFakeReplica } from "../src/testing/fake-replica.js"
import {
  FEE,
  LEDGER,
  ledgerCanister,
  onPage,
  sleep,
} from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"

const MINUTE = 60_000
/** How far past its clock a replica accepts an expiry: five minutes, and 30 seconds of drift. */
const MAX_AHEAD_MS = 5.5 * MINUTE
/** What the caller's account starts with. */
const START = 1_000_000_000n
/** What one transfer of `transfer()` takes from the caller. */
const DEBIT = 100n + FEE
/** The block index the fake ledger answers a transfer with. */
const BLOCK = 7n

/** A request the replica was sent, and what it did with its expiry. */
interface Seen {
  readonly endpoint: "call" | "query" | "read_state"
  /** Whether its sender is not anonymous: a replica checks the expiry of such a read. */
  readonly signed: boolean
  readonly refused: boolean
}

const clients: Client[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose()
  vi.unstubAllGlobals()
})

/**
 * A ledger on a replica whose clock is `hostAheadMs` behind the host's, and
 * a client that calls it as an identity of its own.
 */
function offClock(hostAheadMs: number, options: { timeoutMs?: number } = {}) {
  const identity = Ed25519KeyIdentity.generate()
  const me = principal(identity.getPrincipal().toText())
  const payee = principal(Ed25519KeyIdentity.generate().getPrincipal().toText())
  const balances = new Map<string, bigint>([[me, START]])
  let aheadMs = hostAheadMs
  const icNowMs = () => Date.now() - aheadMs
  const replica = createFakeReplica({
    canisters: { [LEDGER]: ledgerCanister(balances) },
    now: () => BigInt(icNowMs()) * 1_000_000n,
  })
  const seen: Seen[] = []
  /** Runs before an anonymous `read_state` is answered: the agent's reads of the IC's time. */
  let beforeSync: (() => Promise<void>) | undefined
  const fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const endpoint = url.slice(url.lastIndexOf("/") + 1)
    if (
      endpoint === "call" ||
      endpoint === "query" ||
      endpoint === "read_state"
    ) {
      const { content } = Cbor.decode<{
        content: { ingress_expiry: bigint | number; sender: Uint8Array }
      }>(new Uint8Array(await new Response(init?.body).arrayBuffer()))
      const sender = new Uint8Array(content.sender)
      const signed = !(sender.length === 1 && sender[0] === 4)
      const aheadOfIc =
        Number(BigInt(content.ingress_expiry) / 1_000_000n) - icNowMs()
      const refused =
        (endpoint === "call" || signed) &&
        (aheadOfIc < 0 || aheadOfIc > MAX_AHEAD_MS)
      seen.push({ endpoint, signed, refused })
      if (refused) {
        return new Response(
          "Invalid request expiry: Specified ingress_expiry not within expected range: " +
            "Minimum allowed expiry: 2026-01-01 00:00:00 UTC, " +
            "Maximum allowed expiry: 2026-01-01 00:05:30 UTC, " +
            "Provided expiry:        2026-01-01 00:14:00 UTC",
          { status: 400 }
        )
      }
      if (endpoint === "read_state" && !signed) await beforeSync?.()
    }
    return replica.fetch(input, init)
  }
  const account = { owner: me, subaccount: null }
  /** A client of its own, as a page builds one: its agent has read no time yet. */
  const open = () => {
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch,
      identity,
    })
    clients.push(client)
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
      ...options,
    })
    return {
      client,
      ledger,
      balance: () => ledger.icrc1_balance_of(account),
      transfer: () =>
        ledger.icrc1_transfer({
          to: { owner: payee, subaccount: null },
          amount: 100n,
          fee: FEE,
          memo: null,
          from_subaccount: null,
          created_at_time: null,
        }),
    }
  }
  return {
    ...open(),
    /** The same caller on the same replica after a reload of the page. */
    reload: open,
    account,
    seen,
    /** The IC's time now, in milliseconds. */
    icNowMs,
    /** Moves the host's clock another `ms` ahead of the IC's. */
    moveHost: (ms: number) => {
      aheadMs += ms
    },
    holdSync: (wait: () => Promise<void>) => {
      beforeSync = wait
    },
    /** What left the caller's account: `DEBIT` for each transfer the ledger ran. */
    moved: () => START - (balances.get(me) ?? 0n),
    /** The requests of `endpoint` the replica was sent, refused or not. */
    sent: (endpoint: Seen["endpoint"]) =>
      seen.filter((request) => request.endpoint === endpoint),
  }
}

/** The IC's time `client.time()` resolved, as milliseconds from `icNowMs`. */
const offIcTime = (nanoseconds: bigint, icNowMs: number) =>
  Math.abs(Number(nanoseconds / 1_000_000n) - icNowMs)

describe.each([
  ["ten minutes ahead of the IC's", 10 * MINUTE],
  ["ten minutes behind the IC's", -10 * MINUTE],
])("a device whose clock is %s", (_name, hostAheadMs) => {
  it("answers a signed read that is the first request, sent again once the agent has read the IC's time", async () => {
    const t = offClock(hostAheadMs)
    await expect(t.balance()).resolves.toBe(START)
    // The replica refused the first query, and answered one signed by the
    // IC's time.
    const queries = t.sent("query")
    expect(queries[0]).toMatchObject({ signed: true, refused: true })
    expect(queries[queries.length - 1]).toMatchObject({ refused: false })
  })

  it("answers a read made with queryOptions in a browser page, which TanStack asks again", async () => {
    onPage()
    const t = offClock(hostAheadMs)
    await expect(
      t.client.queryClient.fetchQuery({
        ...t.client.queryOptions(t.ledger, "icrc1_balance_of", t.account),
        retryDelay: 0,
      })
    ).resolves.toBe(START)
    expect(t.sent("query")[0]).toMatchObject({ signed: true, refused: true })
  })

  it("rejects a read made with queryOptions on a server, where TanStack retries nothing, and answers the next", async () => {
    const t = offClock(hostAheadMs)
    const read = () =>
      t.client.queryClient.fetchQuery({
        ...t.client.queryOptions(t.ledger, "icrc1_balance_of", t.account),
        staleTime: 0,
      })
    await expect(read()).rejects.toMatchObject({
      kind: "not_delivered",
      mayHaveExecuted: false,
      message: expect.stringContaining(
        "the replica refused the request's ingress expiry"
      ),
    })
    await expect(read()).resolves.toBe(START)
  })

  it("resolves client.time() as the first signed request, with the IC's time and not the host's", async () => {
    const t = offClock(hostAheadMs)
    const time = await t.client.time(t.ledger)
    expect(offIcTime(time, t.icNowMs())).toBeLessThan(MINUTE)
    // Its first read_state was refused, and so was the agent's own second
    // send of that request: the one that answered is a new one.
    expect(t.sent("read_state").filter((request) => request.signed)).toEqual([
      { endpoint: "read_state", signed: true, refused: true },
      { endpoint: "read_state", signed: true, refused: true },
      { endpoint: "read_state", signed: true, refused: false },
    ])
  })

  it("answers signed reads and a client.time() that go out together as the first requests", async () => {
    const t = offClock(hostAheadMs)
    // A page that mounts several reads at once: the replica refuses each of
    // them, and each is asked again.
    const [first, second, time] = await Promise.all([
      t.balance(),
      t.balance(),
      t.client.time(t.ledger),
    ])
    expect([first, second]).toEqual([START, START])
    expect(offIcTime(time, t.icNowMs())).toBeLessThan(MINUTE)
    expect(
      t.sent("query").filter((request) => request.refused).length
    ).toBeGreaterThanOrEqual(2)
  })

  it.each([
    ["a signed read", (t: ReturnType<typeof offClock>) => t.balance()],
    [
      "client.time()",
      (t: ReturnType<typeof offClock>) => t.client.time(t.ledger),
    ],
  ])("sends a write once after %s", async (_first, first) => {
    const t = offClock(hostAheadMs)
    await first(t)
    await expect(t.transfer()).resolves.toBe(BLOCK)
    expect(t.sent("call")).toEqual([
      { endpoint: "call", signed: true, refused: false },
    ])
    expect(t.moved()).toBe(DEBIT)
  })
})

describe("a write the replica refuses for its ingress expiry", () => {
  it("rejects not_delivered and is not sent again, so nothing ran", async () => {
    const t = offClock(10 * MINUTE)
    // The agent has read the IC's time once. The host's clock then moves
    // again, as when its owner sets it, so the agent signs by a clock that
    // is off again.
    await t.balance()
    t.moveHost(10 * MINUTE)
    await expect(t.transfer()).rejects.toMatchObject({
      kind: "not_delivered",
      mayHaveExecuted: false,
      method: "icrc1_transfer",
      canisterId: LEDGER,
      message: expect.stringContaining(
        "the replica refused the request's ingress expiry"
      ),
    })
    // One request: a second one, signed while the first can still become
    // valid, would be two requests for one transfer.
    expect(t.sent("call")).toEqual([
      { endpoint: "call", signed: true, refused: true },
    ])
    expect(t.moved()).toBe(0n)
  })
})

const REFUSED_READ = {
  kind: "not_delivered",
  mayHaveExecuted: false,
  message: expect.stringContaining(
    "the replica refused the request's ingress expiry"
  ),
}

/** The anonymous `read_state` requests: an agent sends three for each read of the IC's time. */
const timeReads = (t: ReturnType<typeof offClock>) =>
  t.sent("read_state").filter((request) => !request.signed).length

// The clock is ten minutes ahead when the agent reads the IC's time, on its
// first refused request. An agent reads the time on that refusal and never
// again, so once the clock is changed it signs by a clock that is off again,
// and the client has it read the time once more.
describe.each([
  ["set right", -10 * MINUTE],
  ["moved ten more minutes ahead", 10 * MINUTE],
])(
  "a device whose clock is %s after the agent has read the IC's time",
  (_name, moveMs) => {
    it("answers a signed read, sent again once the agent has read the time again", async () => {
      const t = offClock(10 * MINUTE)
      await t.balance()
      const before = {
        queries: t.sent("query").length,
        timeReads: timeReads(t),
      }
      t.moveHost(moveMs)
      await expect(t.balance()).resolves.toBe(START)
      expect(t.sent("query").slice(before.queries)).toEqual([
        { endpoint: "query", signed: true, refused: true },
        { endpoint: "query", signed: true, refused: false },
      ])
      // One read of the time for the one refusal.
      expect(timeReads(t) - before.timeReads).toBe(3)
    })

    it("answers a read made with queryOptions in a browser page, which TanStack asks again", async () => {
      onPage()
      const t = offClock(10 * MINUTE)
      await t.balance()
      t.moveHost(moveMs)
      await expect(
        t.client.queryClient.fetchQuery({
          ...t.client.queryOptions(t.ledger, "icrc1_balance_of", t.account),
          retryDelay: 0,
        })
      ).resolves.toBe(START)
    })

    it("rejects a read made with queryOptions on a server once, and answers the next", async () => {
      const t = offClock(10 * MINUTE)
      await t.balance()
      t.moveHost(moveMs)
      const read = () =>
        t.client.queryClient.fetchQuery({
          ...t.client.queryOptions(t.ledger, "icrc1_balance_of", t.account),
          staleTime: 0,
        })
      await expect(read()).rejects.toMatchObject(REFUSED_READ)
      await expect(read()).resolves.toBe(START)
    })

    it("resolves client.time() on its second read, with the IC's time", async () => {
      const t = offClock(10 * MINUTE)
      // A read, and not a time: what `offClock` moves is the IC's clock, and
      // after a time read before it is set back, the next certificate would
      // be an old one, which `client.time()` refuses.
      await t.balance()
      const before = t.sent("read_state").length
      t.moveHost(moveMs)
      const time = await t.client.time(t.ledger)
      expect(offIcTime(time, t.icNowMs())).toBeLessThan(MINUTE)
      expect(
        t
          .sent("read_state")
          .slice(before)
          .filter((request) => request.signed)
      ).toEqual([
        { endpoint: "read_state", signed: true, refused: true },
        { endpoint: "read_state", signed: true, refused: false },
      ])
    })

    it("rejects a write not_delivered once, and sends it once when it is sent again", async () => {
      const t = offClock(10 * MINUTE)
      await t.balance()
      t.moveHost(moveMs)
      await expect(t.transfer()).rejects.toMatchObject(REFUSED_READ)
      expect(t.moved()).toBe(0n)
      // The agent has read the time again by the time the write rejects, so
      // the write sent again is signed by it. The client signs no second
      // request for the first one.
      await expect(t.transfer()).resolves.toBe(BLOCK)
      expect(t.sent("call")).toEqual([
        { endpoint: "call", signed: true, refused: true },
        { endpoint: "call", signed: true, refused: false },
      ])
      expect(t.moved()).toBe(DEBIT)
    })
  }
)

describe("the client's own read of the IC's time", () => {
  it("is not made for an agent's first refusal, when the agent reads the time itself", async () => {
    const t = offClock(10 * MINUTE)
    await t.balance()
    expect(timeReads(t)).toBe(3)
  })

  it("leaves a read refused after its two re-sends when the time cannot be read", async () => {
    const t = offClock(10 * MINUTE)
    await t.balance()
    const before = t.sent("query").length
    t.moveHost(-10 * MINUTE)
    t.holdSync(() => Promise.reject(new Error("offline")))
    await expect(t.balance()).rejects.toMatchObject(REFUSED_READ)
    // The call and its two re-sends, and no more.
    expect(t.sent("query").slice(before)).toEqual([
      { endpoint: "query", signed: true, refused: true },
      { endpoint: "query", signed: true, refused: true },
      { endpoint: "query", signed: true, refused: true },
    ])
  })

  it("leaves a refused write not_delivered when its timeoutMs passes meanwhile", async () => {
    const t = offClock(10 * MINUTE, { timeoutMs: 1_000 })
    await t.balance()
    t.moveHost(-10 * MINUTE)
    // The read of the time gets no answer until the test lets it go.
    let release = () => {}
    t.holdSync(() => new Promise<void>((resolve) => (release = resolve)))
    const started = Date.now()
    // Not `cancelled` with `mayHaveExecuted: true`, as a write that is out
    // when its bound passes is: the replica refused this one.
    await expect(t.transfer()).rejects.toMatchObject(REFUSED_READ)
    // At its bound: not at once, and not when the read of the time ends.
    const waited = Date.now() - started
    expect(waited).toBeGreaterThanOrEqual(900)
    expect(waited).toBeLessThan(2_500)
    expect(t.sent("call")).toEqual([
      { endpoint: "call", signed: true, refused: true },
    ])
    expect(t.moved()).toBe(0n)
    release()
  })
})

describe("client.time() on a device whose clock is off, with a timeoutMs", () => {
  it("sends no second read once the bound has passed", async () => {
    const t = offClock(10 * MINUTE, { timeoutMs: 100 })
    // The agent's reads of the IC's time take longer than the bound.
    t.holdSync(() => sleep(300))
    await expect(t.client.time(t.ledger)).rejects.toMatchObject({
      kind: "cancelled",
      code: "timeout",
      mayHaveExecuted: false,
    })
    await sleep(600)
    // The refused read, and the agent's own second send of it: no new one.
    expect(t.sent("read_state").filter((request) => request.signed)).toEqual([
      { endpoint: "read_state", signed: true, refused: true },
      { endpoint: "read_state", signed: true, refused: true },
    ])
  })
})
