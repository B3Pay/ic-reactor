/**
 * `client.onCall()`: the one place that hears every canister call a client
 * makes, by whichever route (#1093).
 *
 * A call is two events with one `id`: a `start`, then exactly one of
 * `success`, `error` and `cancelled`. The tests go through the routes (a
 * direct call, the query function of `queryOptions`, the mutation function of
 * `mutationOptions`, a function of `func`, a re-send `resendOf` offered),
 * through each way a call ends, through the refusals the client makes before
 * its call path, and through what a listener may and may not do.
 *
 * Every client here is a real one over the fake replica, so what a test reads
 * in an event is what an app's listener is handed.
 */
import type { Identity } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { c, principal } from "@meantjs/schema"
import {
  MutationObserver,
  QueryObserver,
  dehydrate,
  hydrate,
  onlineManager,
  skipToken,
} from "@tanstack/query-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isReactorError,
  type AuthLike,
  type CallEvent,
  type Client,
  type ReactorError,
} from "../src/index.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import { createTestClient, type TestHandlers } from "../src/testing/index.js"
import {
  ANONYMOUS,
  ARCHIVE,
  LEDGER,
  SHAPES,
  canisterRequests,
  clientAs,
  clientWithAuth,
  deferred,
  replicaWith,
  serve,
  sleep,
} from "./canister-helpers.js"
import { withIdentity } from "./client-helpers.js"
import * as archive from "./fixtures/archive.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

/** Seeds 1 and 2: the same principals in every run, on every machine. */
const SEED_1 = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
const SEED_2 = "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"

type Listener = Parameters<Client["onCall"]>[0]
type Start = Extract<CallEvent, { phase: "start" }>
type Failed = Extract<CallEvent, { phase: "error" | "cancelled" }>
type Options = NonNullable<Parameters<typeof createTestClient>[0]>

const AS = Symbol.for("ic-reactor.client.as")

/** The view of `client` pinned to `caller`, as `useClient()` asks for it. */
function pin(client: Client, caller: string): Client {
  const seam = (client as unknown as Record<symbol, unknown>)[AS]
  if (typeof seam !== "function") throw new Error("the client has no seam")
  return (seam as (this: Client, caller: string) => Client).call(client, caller)
}

/** The shapes canister, answering with fixed values. */
const HANDLERS: TestHandlers<shapes.Actor> = {
  nothing: () => undefined,
  one: (n) => n + 1n,
  pair: (left, right) => ({ left, right }),
  who: ({ caller }) => caller,
  composite: (n) => n * 2n,
  bump: (n) =>
    n === 0n
      ? { tag: "err", value: "nothing to bump" }
      : { tag: "ok", value: n + 1n },
  fire: () => undefined,
  address: (seed, { caller }) => `${seed}:${caller}`,
}

const made: ReturnType<typeof createTestClient>[] = []
const clients: Client[] = []

afterEach(() => {
  for (const test of made.splice(0)) test.client.dispose()
  for (const client of clients.splice(0)) client.dispose()
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A test client signed in as seed 1, and the shapes canister it mocks. */
function setup(overrides: TestHandlers<shapes.Actor> = {}, options?: Options) {
  const test = createTestClient(options)
  made.push(test)
  test.mock<shapes.Actor>(shapes.actor, SHAPES, { ...HANDLERS, ...overrides })
  return {
    ...test,
    canister: test.client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
    /** The queries and calls the fake replica was sent. */
    sent: () =>
      test.requests.filter(
        ({ endpoint }) => endpoint === "query" || endpoint === "call"
      ),
  }
}

/** Every event `client` hands out from now on, and the function that stops it. */
function listen(client: Client) {
  const events: CallEvent[] = []
  const stop = client.onCall((event) => {
    events.push(event)
  })
  return { events, stop }
}

/** The `start` at `index` of `events`. */
function startAt(events: readonly CallEvent[], index: number): Start {
  const event = events[index]
  if (event?.phase !== "start") {
    throw new Error(`event ${index} is ${event?.phase}, not a start`)
  }
  return event
}

/** The `error` or `cancelled` at `index` of `events`. */
function failureAt(events: readonly CallEvent[], index: number): Failed {
  const event = events[index]
  if (event?.phase !== "error" && event?.phase !== "cancelled") {
    throw new Error(`event ${index} is ${event?.phase}, not a failure`)
  }
  return event
}

/** What `call` rejects with. */
const rejection = (call: Promise<unknown>): Promise<ReactorError<unknown>> =>
  call.then(
    (value) => {
      throw new Error(`resolved with ${String(value)}`)
    },
    (error: unknown) => error as ReactorError<unknown>
  )

/** The fields of a `start` these tests do not vary. */
const start = (fields: Partial<Start> & Pick<Start, "id" | "method">) => ({
  phase: "start",
  via: "direct",
  canisterId: SHAPES,
  mode: "query",
  certified: false,
  caller: SEED_1,
  args: [],
  resendOf: false,
  at: expect.any(Number) as number,
  ...fields,
})

/** The end of a call that resolved with `data`. */
const success = (id: number, data: unknown, sends = 1) => ({
  phase: "success",
  id,
  data,
  sends,
  ms: expect.any(Number) as number,
})

describe("the two events of a call, by the route it was made through", () => {
  it("reports a direct call: its start as it is made, then its success with the reply", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)

    const before = Date.now()
    const began = performance.now()
    const call = canister.one(1n)
    // Handed out as the call is made, before anything is waited for.
    expect(events).toHaveLength(1)
    const reply = await call
    const took = performance.now() - began
    const after = Date.now()

    expect(reply).toBe(2n)
    // These fields, and no other: no identity, no delegation, no signature
    // and no request bytes.
    expect(events).toStrictEqual([
      {
        phase: "start",
        id: 1,
        via: "direct",
        canisterId: SHAPES,
        method: "one",
        mode: "query",
        certified: false,
        caller: SEED_1,
        args: [1n],
        resendOf: false,
        at: expect.any(Number),
      },
      { phase: "success", id: 1, data: 2n, sends: 1, ms: expect.any(Number) },
    ])
    const { at } = startAt(events, 0)
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(after)
    const end = events[1] as Exclude<CallEvent, Start>
    expect(end.ms).toBeGreaterThan(0)
    expect(end.ms).toBeLessThanOrEqual(took)
  })

  it("measures how long a call took on performance.now(), which a correction of the device's clock does not move", async () => {
    let now = 1_000
    const test = setup({
      one: (n) => {
        // The call takes a quarter of a second on that clock, whatever
        // `Date.now()` says meanwhile.
        now += 250
        return n
      },
    })
    const { events } = listen(test.client)
    vi.spyOn(performance, "now").mockImplementation(() => now)

    await test.canister.one(1n)

    expect(events[1]).toMatchObject({ phase: "success", ms: 250 })
  })

  it("reports the query function of queryOptions, with the arguments and the data by reference", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)
    const vars: [bigint, string] = [1n, "x"]

    const data = await client.queryClient.fetchQuery(
      client.queryOptions(canister, "pair", vars)
    )

    expect(events).toStrictEqual([
      start({ id: 1, via: "query", method: "pair", args: [1n, "x"] }),
      success(1, { left: 1n, right: "x" }),
    ])
    // Handed over, not copied: the list the app gave and the object the
    // caller receives.
    expect(startAt(events, 0).args).toBe(vars)
    expect((events[1] as { data?: unknown }).data).toBe(data)
  })

  it("reports the mutation function of mutationOptions, with the Ok payload the caller receives", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "bump")
    )

    await expect(observer.mutate(1n)).resolves.toBe(2n)

    expect(events).toStrictEqual([
      start({
        id: 1,
        via: "mutation",
        method: "bump",
        mode: "update",
        args: [1n],
      }),
      success(1, 2n),
    ])
  })

  it("reports a function of func, by the canister and the method its reference names", async () => {
    const test = setup()
    const service = c.service({ notify: archive.NotifyFn })
    test.mock<{ notify: (text: string) => Promise<bigint> }>(service, ARCHIVE, {
      notify: (text) => BigInt(text.length),
    })
    const { events } = listen(test.client)
    const notify = test.client.func<(text: string) => Promise<bigint>>(
      archive.NotifyFn,
      { principal: principal(ARCHIVE), method: "notify" }
    )

    await expect(notify("hello")).resolves.toBe(5n)

    expect(events).toStrictEqual([
      start({
        id: 1,
        via: "func",
        canisterId: ARCHIVE,
        method: "notify",
        mode: "update",
        args: ["hello"],
      }),
      success(1, 5n),
    ])
  })

  it("reports a re-send of a write resendOf offered, through send() and through a mutation", async () => {
    // A ledger that runs a transfer once, and answers Duplicate after that.
    const test = createTestClient()
    made.push(test)
    let booked = false
    test.mock<icrc1.Actor>(icrc1.actor, LEDGER, {
      icrc1_transfer: () => {
        if (booked) {
          return {
            tag: "Err",
            value: { tag: "Duplicate", value: { duplicate_of: 7n } },
          }
        }
        booked = true
        return { tag: "Ok", value: 7n }
      },
    })
    const { client } = test
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const { events } = listen(client)
    const arg: icrc1.TransferArg = {
      to: { owner: principal("aaaaa-aa"), subaccount: null },
      amount: 100n,
      fee: null,
      memo: null,
      from_subaccount: null,
      created_at_time: 1_000n,
    }

    // The ledger ran it, and its reply is lost.
    test.dropNextReply()
    const lost = await rejection(ledger.icrc1_transfer(arg))
    const again = client.resendOf(lost, ledger, "icrc1_transfer", {
      dedupedBy: (sent) => sent.created_at_time,
    })
    if (again === undefined) throw new Error("no re-send was offered")
    const bySend = await rejection(again.send())
    const byMutation = await rejection(
      new MutationObserver(
        client.queryClient,
        client.mutationOptions(ledger, "icrc1_transfer")
      ).mutate(again.arg)
    )

    const transfer = { canisterId: LEDGER, method: "icrc1_transfer" } as const
    expect(events).toMatchObject([
      start({ id: 1, ...transfer, mode: "update", args: [arg] }),
      { phase: "error", id: 1, sends: 1, error: { kind: "outcome_unknown" } },
      // `send()` is a call made by hand.
      start({
        id: 2,
        ...transfer,
        mode: "update",
        args: [arg],
        resendOf: true,
      }),
      { phase: "error", id: 2, sends: 1, error: { kind: "canister_err" } },
      start({
        id: 3,
        ...transfer,
        via: "mutation",
        mode: "update",
        args: [arg],
        resendOf: true,
      }),
      { phase: "error", id: 3, sends: 1, error: { kind: "canister_err" } },
    ])
    expect(failureAt(events, 1).error).toBe(lost)
    expect(failureAt(events, 3).error).toBe(bySend)
    expect(failureAt(events, 5).error).toBe(byMutation)
    // The canister's answer to the second and the third request.
    expect(bySend.err).toEqual({
      tag: "Duplicate",
      value: { duplicate_of: 7n },
    })
  }, 20_000)

  it("names the mode of the method, and a certified read", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })

    await canister.composite(2n)
    await canister.fire("x")
    await canister.nothing()
    await certified.one(1n)
    // Only a read is certified: an update of the same canister is not.
    await certified.address("x")

    expect(events.filter(({ phase }) => phase === "start")).toMatchObject([
      { id: 1, method: "composite", mode: "composite_query", certified: false },
      { id: 2, method: "fire", mode: "oneway", certified: false },
      { id: 3, method: "nothing", mode: "query", certified: false },
      { id: 4, method: "one", mode: "query", certified: true },
      { id: 5, method: "address", mode: "update", certified: false },
    ])
    // A oneway and a method without results resolve with nothing.
    expect(events.filter(({ phase }) => phase !== "start")).toStrictEqual([
      success(1, 4n),
      success(2, undefined),
      success(3, undefined),
      success(4, 2n),
      success(5, `x:${SEED_1}`),
    ])
  })
})

describe("how a call ends", () => {
  it("ends as an error with the canister's typed Err for a canister_err", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)

    const error = await rejection(canister.bump(0n))

    expect(events).toStrictEqual([
      start({ id: 1, method: "bump", mode: "update", args: [0n] }),
      { phase: "error", id: 1, error, sends: 1, ms: expect.any(Number) },
    ])
    const failure = failureAt(events, 1)
    // The very error the caller caught.
    expect(failure.error).toBe(error)
    expect(failure.error.kind).toBe("canister_err")
    // The guard that types `err` takes the event's error as it takes the
    // caller's.
    if (!isReactorError(failure.error, canister, "bump")) {
      throw new Error("not this call's error")
    }
    const err: string | undefined = failure.error.err
    expect(err).toBe("nothing to bump")
  })

  it("ends as an error for a call the canister rejects", async () => {
    const test = setup({ one: () => test.reject(4, "not today") })
    const { events } = listen(test.client)

    const error = await rejection(test.canister.one(1n))

    expect(error).toMatchObject({ kind: "rejected", rejectCode: 4 })
    expect(events).toStrictEqual([
      start({ id: 1, method: "one", args: [1n] }),
      { phase: "error", id: 1, error, sends: 1, ms: expect.any(Number) },
    ])
  })

  it("ends as an error with sends: 0 for arguments that do not encode: nothing was sent", async () => {
    const { client, canister, sent } = setup()
    const { events } = listen(client)

    const error = await rejection(canister.one("one" as never))

    expect(error).toMatchObject({ kind: "invalid_args" })
    expect(events).toStrictEqual([
      start({ id: 1, method: "one", args: ["one"] }),
      { phase: "error", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(sent()).toEqual([])
  })

  it("ends as an error with sends: 0 for a canister name that does not resolve, and names it as the error does", async () => {
    const { client, sent } = setup()
    const { events } = listen(client)
    // In Node there is no page, so no `ic_env` cookie names a canister.
    const backend = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
    })

    const error = await rejection(backend.one(1n))

    expect(error).toMatchObject({
      kind: "invalid_args",
      code: "canister_id_unresolved",
      canisterId: "$unresolved:backend",
    })
    expect(events).toStrictEqual([
      start({
        id: 1,
        canisterId: "$unresolved:backend",
        method: "one",
        args: [1n],
      }),
      { phase: "error", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(sent()).toEqual([])
  })

  it("ends as an error with sends: 0 for a write nobody is signed in for", async () => {
    const { client, canister, sent } = setup({}, { signedIn: false })
    const { events } = listen(client)

    const error = await rejection(canister.address("x"))

    expect(error).toMatchObject({
      kind: "unauthenticated",
      code: "anonymous_write",
    })
    expect(events).toStrictEqual([
      start({
        id: 1,
        method: "address",
        mode: "update",
        caller: ANONYMOUS,
        args: ["x"],
      }),
      { phase: "error", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(sent()).toEqual([])
  })

  it("ends as an error with sends: 1 for a write whose reply is lost, however often its one request is posted", async () => {
    const alice = Ed25519KeyIdentity.generate()
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        address: ([seed]) => seed,
      }),
    })
    // How often a call request is posted, a request posted again included:
    // the fake logs only the first of a request whose reply it lost.
    let posted = 0
    const fetch: typeof replica.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith("/call")) posted += 1
      return replica.fetch(input, init)
    }
    const client = clientAs({ ...replica, fetch }, alice)
    clients.push(client)
    const { events } = listen(client)

    replica.dropNextReply()
    const error = await rejection(
      client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }).address("x")
    )

    expect(error).toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    expect(events).toMatchObject([
      { phase: "start", id: 1, method: "address" },
      { phase: "error", id: 1, sends: 1 },
    ])
    expect(failureAt(events, 1).error).toBe(error)
    // The client posted the request it had signed again, to read its
    // outcome back (#1036): one request, which counts once.
    expect(posted).toBeGreaterThan(1)
    expect(canisterRequests(replica)).toHaveLength(1)
  }, 20_000)

  it("ends as an error with sends: 0 for a write the signer declines to sign", async () => {
    const alice = Ed25519KeyIdentity.generate()
    const declined = new Error("declined on the device")
    const identity: Identity = {
      getPrincipal: () => alice.getPrincipal(),
      transformRequest: () => Promise.reject(declined),
    }
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        address: ([seed]) => seed,
      }),
    })
    const client = clientAs(replica, identity)
    clients.push(client)
    const { events } = listen(client)

    const error = await rejection(
      client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }).address("x")
    )

    expect(error).toMatchObject({ kind: "not_delivered", cause: declined })
    expect(events).toMatchObject([
      { phase: "start", id: 1, caller: alice.getPrincipal().toText() },
      { phase: "error", id: 1, sends: 0 },
    ])
    expect(failureAt(events, 1).error).toBe(error)
    expect(canisterRequests(replica)).toEqual([])
  })

  it.each([
    ["a read", "one", 1n, "cancelled"],
    ["a write, which may have executed", "address", "x", "outcome_unknown"],
  ] as const)(
    "ends as an error, not as cancelled, when the timeoutMs of %s passes",
    async (_name, method, arg, kind) => {
      const { client } = setup({
        one: () => new Promise<bigint>(() => {}),
        address: () => new Promise<string>(() => {}),
      })
      const { events } = listen(client)
      const bounded = client.canister<shapes.Actor>(shapes.actor, {
        id: SHAPES,
        timeoutMs: 50,
      })

      const error = await rejection(
        method === "one" ? bounded.one(arg) : bounded.address(arg)
      )

      expect(error).toMatchObject({ kind, code: "timeout" })
      expect(events).toMatchObject([
        { phase: "start", id: 1, method },
        { phase: "error", id: 1, sends: 1 },
      ])
      expect(failureAt(events, 1).error).toBe(error)
    }
  )

  it("ends as cancelled for a read whose caller is no longer the one signed in", async () => {
    const { client, auth, canister, sent } = setup()
    const { events } = listen(client)
    const options = client.queryOptions(canister, "who")

    auth.switchTo(2)
    const error = await rejection(client.queryClient.fetchQuery(options))

    expect(error).toMatchObject({ kind: "cancelled", code: "caller_changed" })
    // Made for the first account, and never sent as the second.
    expect(events).toStrictEqual([
      start({ id: 1, via: "query", method: "who" }),
      { phase: "cancelled", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(sent()).toEqual([])
  })

  it("ends as cancelled for a query whose signal aborts", async () => {
    const entered = deferred()
    const release = deferred()
    const { client, canister } = setup({
      one: async (n) => {
        entered.resolve()
        await release.promise
        return n
      },
    })
    const { events } = listen(client)
    const options = client.queryOptions(canister, "one", 1n)
    const read = client.queryClient.fetchQuery(options)
    read.catch(() => undefined)
    await entered.promise

    await client.queryClient.cancelQueries({ queryKey: options.queryKey })
    await vi.waitFor(() => expect(events).toHaveLength(2))

    expect(events).toMatchObject([
      { phase: "start", id: 1, via: "query", method: "one" },
      {
        phase: "cancelled",
        id: 1,
        // Its request was out when the query was cancelled.
        sends: 1,
        error: { kind: "cancelled", mayHaveExecuted: false },
      },
    ])
    expect(failureAt(events, 1).error.code).toBeUndefined()
    release.resolve()
  })

  it("ends as cancelled for a query removed while it fetches", async () => {
    const entered = deferred()
    const release = deferred()
    const { client, canister } = setup({
      one: async (n) => {
        entered.resolve()
        await release.promise
        return n
      },
    })
    const { events } = listen(client)
    const options = client.queryOptions(canister, "one", 1n)
    client.queryClient.fetchQuery(options).catch(() => undefined)
    await entered.promise

    client.queryClient.removeQueries({ queryKey: options.queryKey })
    await vi.waitFor(() => expect(events).toHaveLength(2))

    expect(events).toMatchObject([
      { phase: "start", id: 1 },
      { phase: "cancelled", id: 1, sends: 1, error: { kind: "cancelled" } },
    ])
    release.resolve()
    // Nothing more comes for it once the canister answers.
    await sleep(20)
    expect(events).toHaveLength(2)
  })

  it("ends as cancelled for a call the client is disposed under, while it waits for its caller's identity", async () => {
    const gate = deferred()
    const auth = createTestAuth({ seed: 1 })
    const slow = withIdentity(auth, async () => {
      const identity = await auth.getIdentity()
      await gate.promise
      return identity
    })
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        address: ([seed]) => seed,
      }),
    })
    const client = clientWithAuth(replica, slow)
    clients.push(client)
    const { events } = listen(client)
    const write = rejection(
      client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }).address("x")
    )

    client.dispose()
    gate.resolve()
    const error = await write

    expect(error).toMatchObject({ kind: "cancelled", code: "client_disposed" })
    expect(events).toStrictEqual([
      start({ id: 1, method: "address", mode: "update", args: ["x"] }),
      { phase: "cancelled", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(canisterRequests(replica)).toEqual([])
  })
})

describe("a call the client refuses before its call path", () => {
  it("reports the attempt a retry of the app's asks for after one that may have executed: refused, with sends: 0", async () => {
    const { client, canister, sent, dropNextReply } = setup()
    const { events } = listen(client)
    const observer = new MutationObserver(client.queryClient, {
      ...client.mutationOptions(canister, "address"),
      // An app's own retry, against the guide.
      retry: 1,
      retryDelay: 0,
    })

    dropNextReply()
    const error = await rejection(observer.mutate("x"))

    expect(error).toMatchObject({
      kind: "outcome_unknown",
      code: "retried_write",
    })
    const attempt = {
      via: "mutation",
      method: "address",
      mode: "update",
      args: ["x"],
    } as const
    expect(events).toStrictEqual([
      start({ id: 1, ...attempt }),
      {
        phase: "error",
        id: 1,
        error: error.cause,
        sends: 1,
        ms: expect.any(Number),
      },
      // The attempt TanStack made for the retry: a call of its own.
      start({ id: 2, ...attempt }),
      { phase: "error", id: 2, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(failureAt(events, 3).error).toBe(error)
    expect(new Set(sent().map(({ requestId }) => requestId)).size).toBe(1)
  }, 20_000)

  it("reports a write refused because nobody knows who started it, as the caller current then", async () => {
    const { client, canister, sent } = setup()
    const { events } = listen(client)
    const options = client.mutationOptions(canister, "address")
    const observer = new MutationObserver(client.queryClient, options)
    const cache = client.queryClient.getMutationCache()
    // Held back offline. Waited for until TanStack has really paused it,
    // which is after its onMutate: a run that is only marked as paused
    // would start by itself once the test is online again.
    const paused = deferred()
    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "updated" && event.action.type === "pause") {
        paused.resolve()
      }
    })
    onlineManager.setOnline(false)
    observer.mutate("x").catch(() => undefined)
    await paused.promise
    unsubscribe()
    // What a persister writes and, after a reload, reads back: TanStack
    // runs no onMutate for the run it restores, so nobody read its caller.
    const persisted = dehydrate(client.queryClient)
    cache.clear()
    client.queryClient.setMutationDefaults(options.mutationKey, {
      mutationFn: options.mutationFn as never,
    })
    hydrate(client.queryClient, persisted)
    onlineManager.setOnline(true)
    await client.queryClient.resumePausedMutations()
    await vi.waitFor(() => expect(events).toHaveLength(2))

    const [restored] = cache.getAll()
    expect(events).toStrictEqual([
      start({
        id: 1,
        via: "mutation",
        method: "address",
        mode: "update",
        args: ["x"],
      }),
      {
        phase: "cancelled",
        id: 1,
        error: restored?.state.error,
        sends: 0,
        ms: expect.any(Number),
      },
    ])
    expect(failureAt(events, 1).error).toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
    })
    // Long enough for a request to arrive, had one been sent.
    await sleep(100)
    expect(events).toHaveLength(2)
    expect(sent()).toEqual([])
  })

  it("reports a write through a view whose principal is no longer the caller, as that principal", async () => {
    const { client, auth, canister, sent } = setup()
    const { events } = listen(client)
    // What `useClient()` returned in the render the user still sees.
    const options = pin(client, SEED_1).mutationOptions(canister, "address")

    auth.switchTo(2)
    const error = await rejection(options.mutationFn("x"))

    expect(error).toMatchObject({ kind: "cancelled", code: "caller_changed" })
    expect(events).toStrictEqual([
      start({
        id: 1,
        via: "mutation",
        method: "address",
        mode: "update",
        caller: SEED_1,
        args: ["x"],
      }),
      { phase: "cancelled", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(failureAt(events, 1).error).toBe(error)
    expect(sent()).toEqual([])
  })

  it("reports the retry a view refuses after an attempt that may have executed, whoever is current by then", async () => {
    const { client, auth, canister, sent, dropNextReply } = setup()
    const { events } = listen(client)
    const observer = new MutationObserver(client.queryClient, {
      ...pin(client, SEED_1).mutationOptions(canister, "address"),
      retry: (failureCount: number) => {
        // The account is switched before the attempt `retry` asks for.
        auth.switchTo(2)
        return failureCount < 1
      },
      retryDelay: 0,
    })

    dropNextReply()
    const error = await rejection(observer.mutate("x"))

    expect(error).toMatchObject({
      kind: "outcome_unknown",
      code: "retried_write",
    })
    expect(events).toMatchObject([
      { phase: "start", id: 1, via: "mutation", caller: SEED_1 },
      { phase: "error", id: 1, sends: 1, error: { kind: "outcome_unknown" } },
      { phase: "start", id: 2, via: "mutation", caller: SEED_1, args: ["x"] },
      { phase: "error", id: 2, sends: 0 },
    ])
    expect(failureAt(events, 3).error).toBe(error)
    expect(new Set(sent().map(({ requestId }) => requestId)).size).toBe(1)
  }, 20_000)

  it("reports a read a pinned view built for a principal who is not the caller", async () => {
    const { client, canister, sent } = setup()
    const { events } = listen(client)
    // A hydrating render builds the server's anonymous read while the
    // browser's session is already signed in.
    const options = pin(client, ANONYMOUS).queryOptions(canister, "who")

    const error = await rejection(client.queryClient.fetchQuery(options))

    expect(error).toMatchObject({ kind: "cancelled", code: "caller_changed" })
    expect(events).toStrictEqual([
      start({ id: 1, via: "query", method: "who", caller: ANONYMOUS }),
      { phase: "cancelled", id: 1, error, sends: 0, ms: expect.any(Number) },
    ])
    expect(sent()).toEqual([])
  })

  it("leaves a refusal as it is when what was refused cannot be read: an auth that throws when asked who is signed in", async () => {
    const auth = createTestAuth({ seed: 1 })
    let broken = false
    const faulty: AuthLike = {
      ...withIdentity(auth, () => auth.getIdentity()),
      getStatus: () => {
        if (broken) throw new Error("the auth is gone")
        return auth.getStatus()
      },
    }
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        address: ([seed]) => seed,
      }),
    })
    const client = clientWithAuth(replica, faulty)
    clients.push(client)
    expect(client.caller()).toBe(SEED_1)
    const options = client.mutationOptions(
      client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
      "address"
    )
    const { events } = listen(client)

    broken = true
    // A context the client saw no run start with: nobody knows who started
    // this write, and now nobody can say who is signed in either.
    const refusal = options.mutationFn("x", {} as never)
    broken = false

    // The refusal the app receives without a listener, and no event for it.
    await expect(refusal).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
    })
    expect(events).toEqual([])
    expect(canisterRequests(replica)).toEqual([])
  })

  it("has no events for a query built with skipToken, which never runs", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)
    const observer = new QueryObserver(
      client.queryClient,
      client.queryOptions(canister, "one", skipToken)
    )

    const stop = observer.subscribe(() => undefined)
    await sleep(20)
    stop()

    expect(events).toEqual([])
  })

  it("has no events for client.time() and client.encode(), which call no canister method", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)

    await client.time(canister)
    client.encode(canister, "one", 1n)

    expect(events).toEqual([])
  })
})

describe("a call the client sends again", () => {
  it("stays one call, whose end counts the requests: sends above 1", async () => {
    const { client, canister, sent, refuseNext } = setup()
    const { events } = listen(client)

    // A 429 proves the request was not delivered: the client sends the
    // call again by itself.
    refuseNext(429)
    await expect(canister.address("x")).resolves.toBe(`x:${SEED_1}`)

    expect(events).toStrictEqual([
      start({ id: 1, method: "address", mode: "update", args: ["x"] }),
      success(1, `x:${SEED_1}`, 2),
    ])
    expect(sent()).toHaveLength(2)
  })

  it("is a call of its own for each run of a query function TanStack retries", async () => {
    let asked = 0
    const test = setup({
      one: (n) => (asked++ === 0 ? test.reject(4, "not yet") : n),
    })
    const { events } = listen(test.client)

    await expect(
      test.client.queryClient.fetchQuery({
        ...test.client.queryOptions(test.canister, "one", 1n),
        retry: 1,
        retryDelay: 0,
      })
    ).resolves.toBe(1n)

    expect(events).toMatchObject([
      { phase: "start", id: 1, via: "query", method: "one" },
      { phase: "error", id: 1, sends: 1, error: { kind: "rejected" } },
      { phase: "start", id: 2, via: "query", method: "one" },
      { phase: "success", id: 2, sends: 1, data: 1n },
    ])
  })
})

describe("a listener", () => {
  it("cannot fail a call: what it throws is dropped, and so is the rejection of a promise it returns", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const { client, canister } = setup()
      const throws = vi.fn(() => {
        throw new Error("a listener's bug")
      })
      const rejects = vi.fn(() => Promise.reject(new Error("an async bug")))
      // Never settles: nothing waits for what a listener returns.
      const hangs = vi.fn(() => new Promise<void>(() => {}))
      client.onCall(throws)
      // A listener's type returns nothing. An async function fits it all the
      // same, as it fits any callback that returns nothing, so the client
      // has to be safe for one.
      client.onCall(rejects as unknown as Listener)
      client.onCall(hangs as unknown as Listener)
      // Added after them: it hears every event all the same.
      const { events } = listen(client)

      await expect(canister.one(1n)).resolves.toBe(2n)
      const error = await rejection(canister.bump(0n))

      // The call's own error, not the listener's.
      expect(error).toMatchObject({ kind: "canister_err" })
      expect(events.map(({ id, phase }) => [id, phase])).toEqual([
        [1, "start"],
        [1, "success"],
        [2, "start"],
        [2, "error"],
      ])
      for (const listener of [throws, rejects, hangs]) {
        expect(listener).toHaveBeenCalledTimes(4)
      }
      // Long enough for Node to report a rejection nobody handled.
      await sleep(20)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("runs with the others in the order they were added, as the event happens", async () => {
    const { client, canister } = setup()
    const heard: string[] = []
    for (const name of ["first", "second", "third"]) {
      client.onCall(({ phase }) => {
        heard.push(`${name}:${phase}`)
      })
    }

    const call = canister.one(1n)
    // Synchronously: nothing was waited for yet.
    expect(heard).toEqual(["first:start", "second:start", "third:start"])
    await call

    expect(heard.slice(3)).toEqual([
      "first:success",
      "second:success",
      "third:success",
    ])
  })

  it("hears the end of a call before the caller goes on", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)

    const heardByThen = await canister
      .one(1n)
      .then(() => events.map(({ phase }) => phase))
    const heardByCatch = await canister
      .bump(0n)
      .catch(() => events.map(({ phase }) => phase))

    expect(heardByThen).toEqual(["start", "success"])
    expect(heardByCatch).toEqual(["start", "success", "start", "error"])
  })

  it("leaves a call's rejection to its caller, as without a listener: once the caller handles it, nothing is left unhandled", async () => {
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const { client, canister } = setup()
      listen(client)

      await canister.bump(0n).catch(() => undefined)
      await client.queryClient
        .fetchQuery(client.queryOptions(canister, "one", "one" as never))
        .catch(() => undefined)

      // Long enough for Node to report a rejection nobody handled.
      await sleep(20)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("counts from the next event when it is added or removed while an event is handed out", async () => {
    const { client, canister } = setup()
    const heard: string[] = []
    let stopLast = (): void => undefined
    client.onCall(({ phase }) => {
      heard.push(`first:${phase}`)
      if (phase !== "start") return
      // Added during the start: it hears the end, and not this start.
      client.onCall((event) => {
        heard.push(`added:${event.phase}`)
      })
      // Removed during the start: it still hears this start, and no end.
      stopLast()
    })
    stopLast = client.onCall(({ phase }) => {
      heard.push(`last:${phase}`)
    })

    await canister.one(1n)

    expect(heard).toEqual([
      "first:start",
      "last:start",
      "first:success",
      "added:success",
    ])
  })

  it("stops when the function onCall returned is called, and calling it twice is harmless", async () => {
    const { client, canister } = setup()
    const listener = vi.fn()
    // The same function twice is two listeners.
    const stopOne = client.onCall(listener)
    const stopTwo = client.onCall(listener)

    await canister.one(1n)
    expect(listener).toHaveBeenCalledTimes(4)

    stopOne()
    // Does nothing: the other registration of the function stays.
    stopOne()
    await canister.one(1n)
    expect(listener).toHaveBeenCalledTimes(6)

    stopTwo()
    stopTwo()
    await canister.one(1n)
    expect(listener).toHaveBeenCalledTimes(6)
  })

  it("is handed frozen events, and cannot change a call that has read its arguments", async () => {
    const { client, canister } = setup()
    const errors: unknown[] = []
    client.onCall((event) => {
      if (event.phase === "start") {
        // The list of a direct call's arguments is the call's own.
        ;(event.args as unknown[])[0] = 41n
      }
      try {
        ;(event as { id: number }).id = 99
      } catch (error) {
        errors.push(error)
      }
    })
    const { events } = listen(client)

    // The canister was sent 1, and answers 2.
    await expect(canister.one(1n)).resolves.toBe(2n)

    expect(events.map(({ id }) => id)).toEqual([1, 1])
    expect(events.every((event) => Object.isFrozen(event))).toBe(true)
    expect(errors).toHaveLength(2)
    expect(errors[0]).toBeInstanceOf(TypeError)
  })

  it("is refused when it is not a function", () => {
    const { client } = setup()

    expect(() => client.onCall(undefined as never)).toThrow(TypeError)
    expect(() => client.onCall("log" as never)).toThrow(
      '[ic-reactor] client.onCall() takes a listener function, got "log".'
    )
  })

  it("hears the events that come after it was added: of a call under way, the end only when another listener heard its start", async () => {
    const entered = deferred()
    const release = deferred()
    const { client, canister } = setup({
      one: async (n) => {
        entered.resolve()
        await release.promise
        return n
      },
    })

    // Nobody listens when this call starts, so it is not reported at all.
    const unheard = canister.one(1n)
    await entered.promise
    const first = listen(client)
    release.resolve()
    await unheard
    expect(first.events).toEqual([])

    // This one is reported, and a listener added meanwhile hears its end.
    const heard = canister.who()
    const second = listen(client)
    await heard
    expect(first.events.map(({ id, phase }) => [id, phase])).toEqual([
      [1, "start"],
      [1, "success"],
    ])
    expect(second.events.map(({ id, phase }) => [id, phase])).toEqual([
      [1, "success"],
    ])
  })

  it("costs a call nothing while nobody listens: such a call takes no id", async () => {
    const { client, canister } = setup()
    const first = listen(client)
    await canister.one(1n)
    first.stop()

    await canister.one(1n)
    await canister.bump(0n).catch(() => undefined)
    const second = listen(client)
    await canister.one(1n)

    expect(first.events.map(({ id }) => id)).toEqual([1, 1])
    expect(second.events.map(({ id }) => id)).toEqual([2, 2])
  })
})

describe("one log for a client and its views", () => {
  it("listens on the client a view was made over, and names each call's caller: an account switch needs no new listener", async () => {
    const { client, auth, canister } = setup()
    const view = pin(client, SEED_1)
    expect(view.onCall).toBe(client.onCall)
    const { events } = listen(view)

    await canister.who()
    auth.switchTo(2)
    // The render after the switch asks for the new caller's view. Nobody
    // subscribes again.
    const next = pin(client, SEED_2)
    await client.queryClient.fetchQuery(next.queryOptions(canister, "who"))
    await new MutationObserver(
      client.queryClient,
      next.mutationOptions(canister, "address")
    ).mutate("x")

    expect(
      events.flatMap((event) =>
        event.phase === "start" ? [[event.via, event.caller]] : []
      )
    ).toEqual([
      ["direct", SEED_1],
      ["query", SEED_2],
      ["mutation", SEED_2],
    ])
    expect(events).toHaveLength(6)
  })

  it("keeps the listeners of two clients apart, and their ids", async () => {
    const one = setup()
    const other = setup()
    const heardByOne = listen(one.client).events
    const heardByOther = listen(other.client).events

    await other.canister.one(1n)
    await other.canister.one(1n)
    expect(heardByOne).toEqual([])
    await one.canister.one(1n)

    expect(heardByOne.map(({ id }) => id)).toEqual([1, 1])
    expect(heardByOther.map(({ id }) => id)).toEqual([1, 1, 2, 2])
  })
})

describe("dispose()", () => {
  it("drops the listeners after the calls it cancels have reported cancelled", async () => {
    const entered = deferred()
    const release = deferred()
    const { client, canister } = setup({
      one: async (n) => {
        entered.resolve()
        await release.promise
        return n
      },
    })
    const { events } = listen(client)
    client.queryClient
      .fetchQuery(client.queryOptions(canister, "one", 1n))
      .catch(() => undefined)
    await entered.promise

    client.dispose()
    // Not yet: the read it cancelled has not ended.
    expect(events).toHaveLength(1)
    await vi.waitFor(() => expect(events).toHaveLength(2))

    expect(events[1]).toMatchObject({
      phase: "cancelled",
      id: 1,
      sends: 1,
      error: { kind: "cancelled" },
    })
    // Dropped now: a call on the disposed client is cancelled, and nobody
    // is told.
    await expect(canister.one(2n)).rejects.toMatchObject({
      code: "client_disposed",
    })
    expect(events).toHaveLength(2)
    release.resolve()
  })

  it("drops the listeners at once when no call is under way, and onCall adds none after it", async () => {
    const { client, canister } = setup()
    const { events } = listen(client)
    await canister.one(1n)

    client.dispose()
    const late = vi.fn()
    const stop = client.onCall(late)
    await expect(canister.one(1n)).rejects.toMatchObject({
      code: "client_disposed",
    })
    stop()

    expect(events).toHaveLength(2)
    expect(late).not.toHaveBeenCalled()
  })

  it("keeps the listeners for a call still under way, and until then reports a call made on the disposed client", async () => {
    const entered = deferred()
    const release = deferred()
    const { client, canister } = setup({
      address: async (seed) => {
        entered.resolve()
        await release.promise
        return seed
      },
    })
    const { events } = listen(client)
    // A direct write, which dispose() does not cancel: its request is out.
    const write = canister.address("x")
    await entered.promise

    client.dispose()
    const refused = await rejection(canister.one(1n))
    release.resolve()
    await expect(write).resolves.toBe("x")

    expect(events).toStrictEqual([
      start({ id: 1, method: "address", mode: "update", args: ["x"] }),
      // Made on the disposed client, whose caller is nobody.
      start({ id: 2, method: "one", caller: ANONYMOUS, args: [1n] }),
      {
        phase: "cancelled",
        id: 2,
        error: refused,
        sends: 0,
        ms: expect.any(Number),
      },
      success(1, "x"),
    ])
    expect(refused).toMatchObject({ code: "client_disposed" })
    // The last call under way has ended: the listeners are gone.
    await canister.one(1n).catch(() => undefined)
    expect(events).toHaveLength(4)
  })
})
