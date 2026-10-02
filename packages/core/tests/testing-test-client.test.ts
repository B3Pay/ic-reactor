/**
 * `createTestClient` from `@ic-reactor/core/testing`: a real client over a
 * fake replica, with canisters written as functions of domain values and a
 * sign-in the test controls.
 *
 * Every test here runs in Node, where `createClient` never builds its auth
 * (there is no page to sign in on). The test client has to work there anyway,
 * so a sign-in, a sign-out and a switch of account are all exercised without a
 * browser. The canisters are the generated fixtures: the ICRC-1 ledger for
 * domain values and `Ok`/`Err` replies, the shapes service for the reply
 * collapse, and the management canister for effective-canister-id routing.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { c, principal } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { internalsOf } from "../src/client.js"
import { isReactorError } from "../src/index.js"
import { createTestClient, type TestHandlers } from "../src/testing/index.js"
import {
  ANONYMOUS,
  LEDGER,
  MANAGEMENT,
  SHAPES,
  sleep,
} from "./canister-helpers.js"
import { onPage } from "./client-helpers.js"
import { stubProcessEnv } from "./network-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as management from "./fixtures/management.js"
import * as shapes from "./fixtures/shapes.js"

/** Seeds 1 and 2: the same principals in every run, on every machine. */
const SEED_1 = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
const SEED_2 = "xledz-fktfc-4ywwn-gai5u-ieqce-5x4qc-7lpel-o4ubn-ucngz-7lrzo-5ae"

type Options = NonNullable<Parameters<typeof createTestClient>[0]>
type Test = ReturnType<typeof createTestClient>

const made: Test[] = []

/** A test client that is disposed when the test ends. */
function setup(options?: Options) {
  const test = createTestClient(options)
  made.push(test)
  return test
}

afterEach(() => {
  for (const test of made.splice(0)) test.client.dispose()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The shapes canister, called through a test client that mocks it. */
function withShapes(handlers: TestHandlers<shapes.Actor>, options?: Options) {
  const test = setup(options)
  test.mock<shapes.Actor>(shapes.actor, SHAPES, handlers)
  return {
    ...test,
    canister: test.client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
  }
}

/** The canister requests (queries and calls) the fake saw. */
const canisterRequests = (test: Pick<Test, "requests">) =>
  test.requests.filter(
    (request) => request.endpoint === "query" || request.endpoint === "call"
  )

describe("who a handler is told called", () => {
  it("is the principal that is signed in, by default the identity of seed 1", async () => {
    const { canister, auth } = withShapes({
      who: ({ caller }) => caller,
      address: (seed, { caller }) => `${seed}:${caller}`,
    })

    // A query and an update, both signed by the signed-in principal.
    await expect(canister.who()).resolves.toBe(SEED_1)
    await expect(canister.address("x")).resolves.toBe(`x:${SEED_1}`)
    expect(auth.getPrincipal()?.toText()).toBe(SEED_1)
  })

  it("is the other principal after a switch of account, in Node", async () => {
    // Node is a server to `createClient`: with no page, it never builds an
    // auth. If the test client lost that difference, the switch would change
    // nothing the canister could see.
    expect(typeof window).toBe("undefined")
    const { canister, client, auth } = withShapes({
      who: ({ caller }) => caller,
      address: (seed, { caller }) => `${seed}:${caller}`,
    })
    await expect(canister.who()).resolves.toBe(SEED_1)

    auth.switchTo(2)

    expect(client.caller()).toBe(SEED_2)
    await expect(canister.who()).resolves.toBe(SEED_2)
    await expect(canister.address("y")).resolves.toBe(`y:${SEED_2}`)
  })

  it("is the principal that signed the request, even when the account is switched while the call is in flight", async () => {
    // The request carries its sender, and the fake verifies it. A handler that
    // were told whoever is signed in when it runs would see the account that
    // was switched to after the call went out. The switch is made after 0, 1,
    // 2 ... microtasks of a call that is already on its way, so one of them
    // lands between the signing and the handler, whatever the number of
    // microtasks that takes.
    const told: string[] = []
    const live: string[] = []
    const { canister, auth, client, requests } = withShapes({
      who: ({ caller }) => {
        told.push(caller)
        live.push(client.caller())
        return caller
      },
      address: (seed, { caller }) => {
        told.push(caller)
        live.push(client.caller())
        return seed
      },
    })

    for (const send of [
      () => canister.who(),
      () => canister.address("x"),
    ] as const) {
      for (let microtasks = 0; microtasks < 40; microtasks += 1) {
        auth.switchTo(1)
        const call = send()
        for (let tick = 0; tick < microtasks; tick += 1) {
          await Promise.resolve()
        }
        auth.switchTo(2)
        // A call whose caller changed before it went out is cancelled: it
        // sent nothing, so it told no handler anything.
        await call.catch(() => undefined)
      }
    }

    // Every call went out as the account it was made as, and the handler was
    // told that, and not the other account the client is on by then.
    expect(told).toEqual(canisterRequests({ requests }).map((r) => r.caller))
    expect(told.length).toBeGreaterThan(0)
    expect(told.every((caller) => caller === SEED_1)).toBe(true)
    // The sweep reached the moment the test is about: a call signed by one
    // principal, run after the client had moved on to the other.
    expect(live).toContain(SEED_2)
  })

  it("is the identity it was given, whether a seed or a key", async () => {
    const key = Ed25519KeyIdentity.generate()
    const byKey = withShapes({ who: ({ caller }) => caller }, { identity: key })
    const bySeed = withShapes({ who: ({ caller }) => caller }, { identity: 2 })

    await expect(byKey.canister.who()).resolves.toBe(
      key.getPrincipal().toText()
    )
    await expect(bySeed.canister.who()).resolves.toBe(SEED_2)
  })

  it("is the anonymous principal for a client that starts signed out, and refuses its updates", async () => {
    const calls: string[] = []
    const { canister, auth, requests } = withShapes(
      {
        who: ({ caller }) => caller,
        address: (seed) => {
          calls.push(seed)
          return seed
        },
      },
      { signedIn: false }
    )

    await expect(canister.who()).resolves.toBe(ANONYMOUS)
    await expect(canister.address("x")).rejects.toMatchObject({
      kind: "unauthenticated",
      mayHaveExecuted: false,
    })
    expect(calls).toEqual([])
    expect(requests.filter((request) => request.endpoint === "call")).toEqual(
      []
    )

    // `identity` is what a later sign-in signs in as.
    await auth.signIn()
    await expect(canister.address("x")).resolves.toBe("x")
    await expect(canister.who()).resolves.toBe(SEED_1)
  })

  it("signs in and out through the client, as an app does", async () => {
    const { client, canister } = withShapes(
      { who: ({ caller }) => caller },
      { identity: 2, signedIn: false }
    )
    const seen: string[] = []
    client.subscribe(() => seen.push(client.authState().status))

    await client.signIn()
    await expect(canister.who()).resolves.toBe(SEED_2)
    await client.signOut()
    await expect(canister.who()).resolves.toBe(ANONYMOUS)

    expect(seen).toEqual(["signed-in", "anonymous"])
  })

  it("is anonymous once the session expires, though the principal is still named", async () => {
    const { canister, auth } = withShapes({ who: ({ caller }) => caller })

    auth.expire()

    expect(auth.getStatus().state).toBe("expired")
    await expect(canister.who()).resolves.toBe(ANONYMOUS)
  })
})

describe("the handlers' values", () => {
  /** A small ICRC-1 ledger: balances by owner text, transfers debit the caller. */
  function ledger(balances: Map<string, bigint>) {
    const test = setup()
    const fee = 10_000n
    test.mock<icrc1.Actor>(icrc1.actor, LEDGER, {
      icrc1_fee: () => fee,
      icrc1_decimals: () => 8,
      icrc1_balance_of: ({ owner }) => balances.get(owner) ?? 0n,
      icrc1_minting_account: () => null,
      icrc1_supported_standards: () => [
        { name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" },
      ],
      icrc1_metadata: () => [["icrc1:symbol", { tag: "Text", value: "ICP" }]],
      icrc1_transfer: (arg, { caller }) => {
        const debit = arg.amount + fee
        const balance = balances.get(caller) ?? 0n
        if (balance < debit) {
          return {
            tag: "Err",
            value: { tag: "InsufficientFunds", value: { balance } },
          }
        }
        balances.set(caller, balance - debit)
        balances.set(
          arg.to.owner,
          (balances.get(arg.to.owner) ?? 0n) + arg.amount
        )
        return { tag: "Ok", value: 1n }
      },
    })
    return {
      ...test,
      canister: test.client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER }),
    }
  }

  const to = principal("rrkah-fqaaa-aaaaa-aaaaq-cai")
  const transfer = (amount: bigint): icrc1.TransferArg => ({
    to: { owner: to, subaccount: null },
    amount,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  })

  it("take and return what a generated module's types say: bigint, principals, variants", async () => {
    const balances = new Map([[SEED_1, 1_000_000n]])
    const { canister } = ledger(balances)

    await expect(canister.icrc1_fee()).resolves.toBe(10_000n)
    await expect(canister.icrc1_decimals()).resolves.toBe(8)
    await expect(canister.icrc1_minting_account()).resolves.toBeNull()
    // A vec is one result, not the list of results.
    await expect(canister.icrc1_supported_standards()).resolves.toEqual([
      { name: "ICRC-1", url: "https://github.com/dfinity/ICRC-1" },
    ])
    await expect(canister.icrc1_metadata()).resolves.toEqual([
      ["icrc1:symbol", { tag: "Text", value: "ICP" }],
    ])
    // The handler returned `{ tag: "Ok", value }`; the client unwraps it.
    await expect(canister.icrc1_transfer(transfer(500n))).resolves.toBe(1n)
    await expect(
      canister.icrc1_balance_of({ owner: to, subaccount: null })
    ).resolves.toBe(500n)
    expect(balances.get(SEED_1)).toBe(1_000_000n - 500n - 10_000n)
  })

  it("reject a direct call with the typed Err arm when the handler returns one", async () => {
    const { canister } = ledger(new Map([[SEED_1, 5n]]))

    const failure: unknown = await canister
      .icrc1_transfer(transfer(500n))
      .catch((error: unknown) => error)

    expect(isReactorError(failure)).toBe(true)
    expect(failure).toMatchObject({
      kind: "canister_err",
      err: { tag: "InsufficientFunds", value: { balance: 5n } },
      mayHaveExecuted: false,
    })
  })

  it("take the arguments in order, then the context", async () => {
    const seen: unknown[][] = []
    const { canister } = withShapes({
      pair: (left, right, ctx) => {
        seen.push([left, right, ctx])
        return { left, right }
      },
    })

    await expect(canister.pair(7n, "seven")).resolves.toEqual({
      left: 7n,
      right: "seven",
    })
    expect(seen).toEqual([[7n, "seven", { caller: SEED_1 }]])
  })

  it("return one value, a tuple or nothing, as the method's results are", async () => {
    const { canister } = withShapes({
      one: async (n) => n + 1n,
      many: () => [1n, "two", true],
      nothing: () => undefined,
      note: () => undefined,
      small: (n) => n + 1,
      bytes: (bytes) => bytes.slice().reverse(),
      maybe: (value) => value,
    })

    await expect(canister.one(1n)).resolves.toBe(2n)
    await expect(canister.many()).resolves.toEqual([1n, "two", true])
    await expect(canister.nothing()).resolves.toBeUndefined()
    await expect(canister.note("hello")).resolves.toBeUndefined()
    await expect(canister.small(7)).resolves.toBe(8)
    await expect(canister.bytes(new Uint8Array([1, 2, 3]))).resolves.toEqual(
      new Uint8Array([3, 2, 1])
    )
    await expect(canister.maybe({ some: null })).resolves.toEqual({
      some: null,
    })
  })

  it("make a void update that returns whatever it likes a method with no results", async () => {
    const seen: string[] = []
    const { canister } = withShapes({
      // A handler that stores a value and returns it by habit.
      note: (text) => {
        seen.push(text)
        return seen.length as never
      },
    })

    await expect(canister.note("a")).resolves.toBeUndefined()
    expect(seen).toEqual(["a"])
  })

  it("answer a oneway with the handler run, and a lower-case result like any other", async () => {
    const fired: string[] = []
    const { canister } = withShapes({
      fire: (text) => {
        fired.push(text)
      },
      outcome: (n) =>
        n === 0n ? { tag: "err", value: "zero" } : { tag: "ok", value: n },
    })

    await expect(canister.fire("now")).resolves.toBeUndefined()
    expect(fired).toEqual(["now"])
    await expect(canister.outcome(3n)).resolves.toBe(3n)
    await expect(canister.outcome(0n)).rejects.toMatchObject({
      kind: "canister_err",
      err: "zero",
    })
  })
})

describe("the paths a call takes", () => {
  it("answers a query method on the query path and an update on the call path", async () => {
    const { canister, requests } = withShapes({
      one: (n) => n,
      composite: (n) => n,
      bump: (n) => ({ tag: "ok", value: n }),
    })

    await canister.one(1n)
    await canister.composite(2n)
    await canister.bump(3n)

    expect(
      requests
        .filter((r) => r.endpoint === "query" || r.endpoint === "call")
        .map((r) => [r.endpoint, r.methodName, r.caller])
    ).toEqual([
      ["query", "one", SEED_1],
      ["query", "composite", SEED_1],
      ["call", "bump", SEED_1],
    ])
  })

  it("answers a query method sent as a replicated call, as a certified canister does", async () => {
    const test = setup()
    test.mock<shapes.Actor>(shapes.actor, SHAPES, { one: (n) => n * 2n })
    const certified = test.client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })

    await expect(certified.one(4n)).resolves.toBe(8n)

    expect(canisterRequests(test)).toMatchObject([
      { endpoint: "call", methodName: "one" },
    ])
  })

  it("refuses to run an update method as a query", async () => {
    // The client believes `ping` is a query; the canister it mocks says it is
    // an update. A canister cannot answer a query call to an update method.
    const asQuery = c.service({ ping: c.func([], [c.text], "query") })
    const asUpdate = c.service({ ping: c.func([], [c.text], "update") })
    const test = setup()
    test.mock<{ ping: () => Promise<string> }>(asUpdate, SHAPES, {
      ping: () => "pong",
    })

    await expect(
      test.client
        .canister<{ ping: () => Promise<string> }>(asQuery, { id: SHAPES })
        .ping()
    ).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      message: expect.stringContaining("ping is an update method"),
    })
  })

  it("answers the management canister, routed by the effective canister id", async () => {
    const test = setup()
    const stopped: string[] = []
    test.mock<management.Actor>(management.actor, MANAGEMENT, {
      stop_canister: ({ canister_id }, { caller }) => {
        stopped.push(`${canister_id} by ${caller}`)
      },
      upload_chunk: ({ chunk }) => ({ hash: chunk.slice(0, 2) }),
    })
    const ic = test.client.canister<management.Actor>(management.actor, {
      id: MANAGEMENT,
    })

    await expect(
      ic.stop_canister({ canister_id: principal(SHAPES) })
    ).resolves.toBeUndefined()
    await expect(
      ic.upload_chunk({
        canister_id: principal(LEDGER),
        chunk: new Uint8Array([9, 8, 7]),
      })
    ).resolves.toEqual({ hash: new Uint8Array([9, 8]) })

    expect(stopped).toEqual([`${SHAPES} by ${SEED_1}`])
    expect(canisterRequests(test)).toMatchObject([
      {
        endpoint: "call",
        canisterId: MANAGEMENT,
        effectiveCanisterId: SHAPES,
        methodName: "stop_canister",
      },
      {
        endpoint: "call",
        canisterId: MANAGEMENT,
        effectiveCanisterId: LEDGER,
        methodName: "upload_chunk",
      },
    ])
  })

  it("replaces the canister at an id when it is mocked again", async () => {
    const test = setup()
    test.mock<shapes.Actor>(shapes.actor, SHAPES, { one: () => 1n })
    const canister = test.client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
    })
    await expect(canister.one(0n)).resolves.toBe(1n)

    test.mock<shapes.Actor>(shapes.actor, SHAPES, { one: () => 2n })

    await expect(canister.one(0n)).resolves.toBe(2n)
  })
})

describe("the failures a test makes happen", () => {
  it("rejects an update with the code reject() was given, and the handler ran once", async () => {
    let ran = 0
    const { canister, reject } = withShapes({
      bump: () => {
        ran += 1
        return reject(4, "not today")
      },
    })

    await expect(canister.bump(1n)).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 4,
      mayHaveExecuted: true,
      message: expect.stringContaining("not today"),
    })
    // A reject 4 proves the canister ran: it is never sent again.
    await sleep(1_100)
    expect(ran).toBe(1)
  })

  it("rejects a query too, and a query that was rejected may not have changed anything", async () => {
    const { canister, reject } = withShapes({ one: () => reject(4) })

    await expect(canister.one(1n)).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 4,
      mayHaveExecuted: false,
    })
  })

  it("loses the reply to the next update only, and the handler ran exactly once", async () => {
    let ran = 0
    const { canister, dropNextReply, requests } = withShapes({
      bump: (n) => {
        ran += 1
        return { tag: "ok", value: n }
      },
    })
    dropNextReply()

    await expect(canister.bump(1n)).rejects.toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    // Nothing re-sends it, however long the client waits.
    await sleep(1_100)
    expect(ran).toBe(1)
    expect(requests.filter((request) => request.dropped)).toMatchObject([
      { endpoint: "call", methodName: "bump" },
    ])

    // The loss was for that one call: the next works, and runs.
    await expect(canister.bump(2n)).resolves.toBe(2n)
    expect(ran).toBe(2)
  })

  it("refuses the next request with an HTTP status before the canister sees it", async () => {
    let ran = 0
    const { canister, refuseNext, requests } = withShapes({
      bump: (n) => {
        ran += 1
        return { tag: "ok", value: n }
      },
    })
    refuseNext(429)

    // A refused update is sent again once, and the second send is let through.
    await expect(canister.bump(5n)).resolves.toBe(5n)

    expect(ran).toBe(1)
    expect(canisterRequests({ requests })).toMatchObject([
      { refused: expect.stringContaining("429") },
      { methodName: "bump" },
    ])
  })

  it("traps when a handler throws anything but reject()", async () => {
    const { canister } = withShapes({
      bump: () => {
        throw new Error("the ledger is corrupt")
      },
    })

    await expect(canister.bump(1n)).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      mayHaveExecuted: true,
      message: expect.stringContaining("the ledger is corrupt"),
    })
  })

  it("traps a call to a method the test gave no handler, naming it", async () => {
    const { canister } = withShapes({ one: () => 1n })

    await expect(canister.who()).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      message: expect.stringContaining("no handler for who"),
    })
  })

  it("traps a call whose arguments do not decode with the mocked service", async () => {
    // The client sends a nat; the canister it mocks was told `one` takes text.
    const mocked = c.service({ one: c.func([c.text], [c.nat], "query") })
    const test = setup()
    test.mock<{ one: (text: string) => Promise<bigint> }>(mocked, SHAPES, {
      one: () => 1n,
    })
    const canister = test.client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
    })

    await expect(canister.one(1n)).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      message: expect.stringContaining("do not decode with the mocked service"),
    })
  })

  it("traps a handler that returns something its method's result does not hold", async () => {
    const { canister } = withShapes({
      one: () => "one" as never,
      many: () => [1n] as never,
    })

    await expect(canister.one(1n)).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      message: expect.stringContaining(
        "returned a value that is not its result"
      ),
    })
    await expect(canister.many()).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 5,
      message: expect.stringContaining("returns a tuple of 3 values"),
    })
  })
})

describe("what it leaves alone", () => {
  it("never replaces or uses globalThis.fetch", async () => {
    const real = vi.fn(() => {
      throw new Error("the network was reached")
    })
    vi.stubGlobal("fetch", real)

    const test = setup()
    test.mock<shapes.Actor>(shapes.actor, SHAPES, {
      one: (n) => n,
      bump: (n) => ({ tag: "ok", value: n }),
    })
    test.dropNextReply()
    test.refuseNext(503)
    const canister = test.client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
    })
    await canister.one(1n)
    await canister.bump(1n).catch(() => undefined)
    await canister.bump(2n).catch(() => undefined)
    test.client.dispose()

    expect(globalThis.fetch).toBe(real)
    expect(real).not.toHaveBeenCalled()
  })

  it("keeps two test clients apart: their canisters, callers and logs", async () => {
    const first = setup({ identity: 1 })
    const second = setup({ identity: 2 })
    first.mock<shapes.Actor>(shapes.actor, SHAPES, {
      address: (seed, { caller }) => `first:${seed}:${caller}`,
    })
    second.mock<shapes.Actor>(shapes.actor, SHAPES, {
      address: (seed, { caller }) => `second:${seed}:${caller}`,
    })
    const call = (test: typeof first) =>
      test.client
        .canister<shapes.Actor>(shapes.actor, { id: SHAPES })
        .address("a")

    await expect(call(first)).resolves.toBe(`first:a:${SEED_1}`)
    await expect(call(second)).resolves.toBe(`second:a:${SEED_2}`)

    // Each log holds only its own client's call.
    expect(canisterRequests(first)).toMatchObject([{ caller: SEED_1 }])
    expect(canisterRequests(second)).toMatchObject([{ caller: SEED_2 }])
  })

  it("holds the fake's own root key, so no root key is ever fetched", async () => {
    const { canister, requests } = withShapes({ one: (n) => n })

    await canister.one(1n)

    expect(requests.map((request) => request.endpoint)).not.toContain("status")
  })
})

describe("the network it believes it is on", () => {
  const ONE = { one: (n: bigint) => n + 1n }

  it("is a replica of its own by default", async () => {
    const { client, canister } = withShapes(ONE)

    await expect(canister.one(1n)).resolves.toBe(2n)
    expect(client.network).toMatch(/^https?:\/\//)
  })

  it("is mainnet's key segment and host for `ic`, answered by the fake", async () => {
    const test = withShapes(ONE, { network: "ic" })

    await expect(test.canister.one(1n)).resolves.toBe(2n)

    expect(test.client.network).toBe("ic")
    expect(test.client.queryKey(test.canister, "one", 1n)).toContain("ic")
    // The client is on mainnet's host as far as it can tell (what it would
    // trust there, it trusts here); the fake answers on that host.
    expect(internalsOf(test.client).network.host).toBe("https://icp-api.io")
    expect(canisterRequests(test)).toMatchObject([{ canisterId: SHAPES }])
  })

  it("keeps the name a network object is given, and ignores a root key of its own", async () => {
    const test = withShapes(ONE, {
      network: {
        host: "https://replica.example.test",
        name: "staging",
        // Not the fake's key: the fake signs with its own, so this must go.
        rootKey: new Uint8Array(133).fill(1),
      },
    })

    await expect(test.canister.one(1n)).resolves.toBe(2n)
    expect(test.client.network).toBe("staging")
    expect(internalsOf(test.client).network.host).toBe(
      "https://replica.example.test"
    )
  })

  it("follows a local network to its host", async () => {
    const test = withShapes(ONE, { network: "local" })

    await expect(test.canister.one(1n)).resolves.toBe(2n)
    expect(test.client.network).toBe("local")
    expect(internalsOf(test.client).network.host).toBe("http://127.0.0.1:4943")
  })

  it("follows the environment's host for `env`", async () => {
    stubProcessEnv()
    // `env` outside a page says once that a { name } canister cannot resolve.
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const test = withShapes(ONE, { network: "env" })

    await expect(test.canister.one(1n)).resolves.toBe(2n)
    expect(test.client.network).toBe("https://icp-api.io")
  })

  it("works the same on a page, where createClient builds the auth itself", async () => {
    onPage()
    expect(typeof window).toBe("object")
    const { canister, auth } = withShapes({ who: ({ caller }) => caller })

    await expect(canister.who()).resolves.toBe(SEED_1)
    auth.switchTo(2)
    await expect(canister.who()).resolves.toBe(SEED_2)
  })
})

describe("what it refuses", () => {
  it("an option it does not have, naming it", () => {
    expect(() => createTestClient({ seed: 2 } as unknown as Options)).toThrow(
      /no option seed.*Its options: identity, signedIn/
    )
  })

  it("a seed that is not a non-negative integer", () => {
    expect(() => createTestClient({ identity: -1 })).toThrow(RangeError)
    expect(() => createTestClient({ identity: 1.5 })).toThrow(RangeError)
  })

  it("a mock of something that is not a service, or an id that is not a canister", () => {
    const { mock } = setup()

    expect(() => mock(c.nat as never, SHAPES, {})).toThrow(
      /takes the service schema of a generated module/
    )
    expect(() =>
      mock<shapes.Actor>(shapes.actor, "not-a-canister", {})
    ).toThrow(/takes a canister id.*"not-a-canister"/)
  })

  it("handlers for a method the service lacks, or that are not functions", () => {
    const { mock } = setup()

    expect(() =>
      mock<shapes.Actor>(shapes.actor, SHAPES, {
        ...({ unknown_method: () => 1n } as object),
      })
    ).toThrow(/handler for unknown_method, which the service does not have/)
    expect(() =>
      mock<shapes.Actor>(shapes.actor, SHAPES, {
        one: 5 as never,
      })
    ).toThrow(/handler for one is a function.*got number/)
    expect(() =>
      mock<shapes.Actor>(shapes.actor, SHAPES, null as never)
    ).toThrow(/handlers as an object/)
  })
})
