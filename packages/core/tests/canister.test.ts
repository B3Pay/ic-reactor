/**
 * `client.canister()` and its direct calls, on a fake replica: the round trip
 * through the generated schemas, the reply collapse and the unwrap rule, the
 * refusals made before anything is sent, and what is re-sent after which
 * failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal, serviceMethods, type Principal } from "@candid-core/schema"
import { encodeArgs } from "@candid-core/schema/codec"
import { AnonymousIdentity, Cbor } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { isReactorError } from "../src/index.js"
import { createTestAuth } from "../src/testing/index.js"
import {
  ANONYMOUS,
  FEE,
  LEDGER,
  MANAGEMENT,
  SHAPES,
  canisterRequests,
  clientAs,
  clientWithAuth,
  deferred,
  ledgerCanister,
  replicaWith,
  requestsFor,
  serve,
  sleep,
} from "./canister-helpers.js"
import { withIdentity } from "./client-helpers.js"
import { icEnvCookie, stubNoWindow, stubPage } from "./network-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as management from "./fixtures/management.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const alice = Ed25519KeyIdentity.generate()
const ALICE = principal(alice.getPrincipal().toText())
const BOB = principal(Ed25519KeyIdentity.generate().getPrincipal().toText())

/** A transfer of `amount` to Bob, with every optional field filled in. */
const transferTo = (owner: Principal, amount: bigint): icrc1.TransferArg => ({
  to: { owner, subaccount: new Uint8Array(32).fill(1) },
  amount,
  fee: FEE,
  memo: new Uint8Array([0xde, 0xad]),
  from_subaccount: null,
  created_at_time: 1_700_000_000_000_000_000n,
})

/** The shapes service, answering with fixed values. */
const shapesCanister = (
  overrides: Parameters<typeof serve<shapes.Actor>>[1] = {}
) =>
  serve<shapes.Actor>(shapes.actor, {
    nothing: () => undefined,
    one: ([n]) => n + 1n,
    many: () => [1n, "two", true],
    small: ([n]) => n + 1,
    pair: ([left, right]) => ({ left, right }),
    maybe: ([value]) => value,
    bytes: ([bytes]) => bytes.slice().reverse(),
    who: (_args, { caller }) => principal(caller),
    lookup: () => null,
    outcome: ([n]) =>
      n === 0n ? { tag: "err", value: "zero" } : { tag: "ok", value: n },
    composite: ([n]) => n * 2n,
    bump: ([n]) =>
      n === 0n
        ? { tag: "err", value: "nothing to bump" }
        : { tag: "ok", value: n + 1n },
    flag: ([on]) => (on ? { tag: "ok" } : { tag: "err", value: "off" }),
    three: () => ({ tag: "Pending" }),
    note: () => undefined,
    fire: () => undefined,
    address: ([seed], { caller }) => `${seed}:${caller}`,
    ...overrides,
  })

/** A replica running the shapes canister, and a client calling it as Alice. */
function shapesSetup(overrides?: Parameters<typeof shapesCanister>[0]) {
  const replica = replicaWith({ [SHAPES]: shapesCanister(overrides) })
  const client = clientAs(replica, alice)
  return {
    replica,
    client,
    canister: client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
  }
}

describe("a direct call", () => {
  it("sends the ledger's argument shapes and resolves with the decoded reply", async () => {
    const balances = new Map([[ALICE as string, 1_000_000n]])
    const seen: unknown[] = []
    const ledgerFake = ledgerCanister(balances)
    const replica = replicaWith({
      [LEDGER]: {
        query: ledgerFake.query,
        update: async (method, arg, context) => {
          seen.push(method)
          return ledgerFake.update!(method, arg, context)
        },
      },
    })
    const ledger = clientAs(replica, alice).canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
    })

    await expect(
      ledger.icrc1_balance_of({ owner: ALICE, subaccount: null })
    ).resolves.toBe(1_000_000n)
    await expect(ledger.icrc1_transfer(transferTo(BOB, 100n))).resolves.toBe(7n)
    expect(balances.get(ALICE)).toBe(1_000_000n - 100n - FEE)
    expect(balances.get(BOB)).toBe(100n)
    // nat8 decodes to a number, every other integer to a bigint.
    await expect(ledger.icrc1_decimals()).resolves.toBe(8)
    await expect(ledger.icrc1_fee()).resolves.toBe(FEE)
    await expect(ledger.icrc1_minting_account()).resolves.toBeNull()
    expect(seen).toEqual(["icrc1_transfer"])
    expect(
      canisterRequests(replica).map(({ endpoint, methodName }) => [
        endpoint,
        methodName,
      ])
    ).toEqual([
      ["query", "icrc1_balance_of"],
      ["call", "icrc1_transfer"],
      ["query", "icrc1_decimals"],
      ["query", "icrc1_fee"],
      ["query", "icrc1_minting_account"],
    ])
  })

  it("hands a handler exactly the values it was called with", async () => {
    let received: unknown
    const replica = replicaWith({
      [LEDGER]: serve<icrc1.Actor>(icrc1.actor, {
        icrc1_transfer: ([arg]) => {
          received = arg
          return { tag: "Ok", value: 1n }
        },
      }),
    })
    const ledger = clientAs(replica, alice).canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
    })
    await ledger.icrc1_transfer(transferTo(BOB, 5n))
    expect(received).toEqual(transferTo(BOB, 5n))
  })

  it("collapses the reply as the generated Actor types it: nothing, the value, or the tuple", async () => {
    const { canister } = shapesSetup()
    await expect(canister.nothing()).resolves.toBeUndefined()
    await expect(canister.one(41n)).resolves.toBe(42n)
    await expect(canister.many()).resolves.toEqual([1n, "two", true])
    await expect(canister.pair(1n, "b")).resolves.toEqual({
      left: 1n,
      right: "b",
    })
    await expect(canister.small(7)).resolves.toBe(8)
    await expect(canister.bytes(new Uint8Array([1, 2, 3]))).resolves.toEqual(
      new Uint8Array([3, 2, 1])
    )
    await expect(canister.who()).resolves.toBe(ALICE)
    await expect(canister.lookup(BOB)).resolves.toBeNull()
  })

  it("keeps a collapsing opt boxed both ways", async () => {
    const { canister } = shapesSetup()
    await expect(canister.maybe({ some: 3n })).resolves.toEqual({ some: 3n })
    await expect(canister.maybe({ some: null })).resolves.toEqual({
      some: null,
    })
    await expect(canister.maybe(null)).resolves.toBeNull()
  })

  it("unwraps a lower-case result and rejects its err arm as canister_err", async () => {
    const { canister, replica } = shapesSetup()
    await expect(canister.bump(1n)).resolves.toBe(2n)
    await expect(canister.outcome(5n)).resolves.toBe(5n)
    const error: unknown = await canister.bump(0n).catch((e: unknown) => e)
    expect(isReactorError(error)).toBe(true)
    expect(error).toMatchObject({
      kind: "canister_err",
      err: "nothing to bump",
      mayHaveExecuted: false,
      method: "bump",
      canisterId: SHAPES,
    })
    await expect(canister.outcome(0n)).rejects.toMatchObject({
      kind: "canister_err",
      err: "zero",
    })
    // A canister_err is the canister's answer, never sent again.
    expect(requestsFor(replica, "bump")).toHaveLength(2)
  })

  it("resolves an ok arm that carries nothing with null", async () => {
    const { canister } = shapesSetup()
    await expect(canister.flag(true)).resolves.toBeNull()
    await expect(canister.flag(false)).rejects.toMatchObject({
      kind: "canister_err",
      err: "off",
    })
  })

  it("does not unwrap a variant with arms besides Ok and Err", async () => {
    const { canister } = shapesSetup()
    await expect(canister.three()).resolves.toEqual({ tag: "Pending" })
    const { canister: other } = shapesSetup({
      three: () => ({ tag: "Err", value: "kept" }),
    })
    await expect(other.three()).resolves.toEqual({ tag: "Err", value: "kept" })
  })

  it("rejects an ICRC-1 Err as canister_err with the typed payload, sent once", async () => {
    const replica = replicaWith({ [LEDGER]: ledgerCanister(new Map()) })
    const ledger = clientAs(replica, alice).canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
    })
    const error = await ledger
      .icrc1_transfer(transferTo(BOB, 1n))
      .catch((e: unknown) => e)
    expect(error).toMatchObject({
      kind: "canister_err",
      mayHaveExecuted: false,
      err: { tag: "InsufficientFunds", value: { balance: 0n } },
    })
    expect((error as Error).message).toContain("Err InsufficientFunds")
    expect(requestsFor(replica, "icrc1_transfer")).toHaveLength(1)
  })

  it("sends a oneway and settles once it is accepted", async () => {
    const { canister, replica } = shapesSetup()
    await expect(canister.fire("go")).resolves.toBeUndefined()
    expect(requestsFor(replica, "fire")).toMatchObject([{ endpoint: "call" }])
  })

  it("refuses arguments that do not encode, naming the path, and sends nothing", async () => {
    const { canister, replica } = shapesSetup()
    const error = await canister
      // @ts-expect-error a nat is a bigint: the codec refuses a number
      .one(1)
      .catch((e: unknown) => e)
    expect(error).toMatchObject({
      kind: "invalid_args",
      mayHaveExecuted: false,
      issues: [{ code: "invalid_type", path: "$args[0]" }],
    })
    await expect(
      canister.lookup("AAAAA-AA" as Principal)
    ).rejects.toMatchObject({
      kind: "invalid_args",
      issues: [{ path: "$args[0]" }],
    })
    expect(canisterRequests(replica)).toEqual([])
  })

  it("rejects a reply that does not decode as invalid_reply: may have executed for an update only", async () => {
    const wrong = new Uint8Array(
      (
        encodeArgs([shapes.Pair], [{ left: 1n, right: "x" }]) as {
          bytes: Uint8Array
        }
      ).bytes
    )
    const replica = replicaWith({
      [SHAPES]: { query: () => wrong, update: () => wrong },
    })
    const canister = clientAs(replica, alice).canister<shapes.Actor>(
      shapes.actor,
      { id: SHAPES }
    )
    await expect(canister.one(1n)).rejects.toMatchObject({
      kind: "invalid_reply",
      mayHaveExecuted: false,
    })
    await expect(canister.bump(1n)).rejects.toMatchObject({
      kind: "invalid_reply",
      mayHaveExecuted: true,
    })
    expect(requestsFor(replica, "bump")).toHaveLength(1)
  })

  it("decodes replies no deeper than the client's maxDepth", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const shallow = clientAs(replica, alice, {
      maxDepth: 1,
    }).canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const deep = clientAs(replica, alice, {
      maxDepth: 2,
    }).canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    await expect(shallow.maybe({ some: 1n })).rejects.toMatchObject({
      kind: "invalid_reply",
      issues: [{ code: "resource_limit_exceeded" }],
    })
    await expect(deep.maybe({ some: 1n })).resolves.toEqual({ some: 1n })
  })
})

describe("who an update is sent as", () => {
  it("refuses an update while nobody is signed in, and sends nothing", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const canister = clientWithAuth(replica, auth).canister<shapes.Actor>(
      shapes.actor,
      { id: SHAPES }
    )
    for (const write of [() => canister.bump(1n), () => canister.fire("x")]) {
      await expect(write()).rejects.toMatchObject({
        kind: "unauthenticated",
        code: "anonymous_write",
        mayHaveExecuted: false,
      })
    }
    expect(canisterRequests(replica)).toEqual([])
    // A read needs nobody.
    await expect(canister.who()).resolves.toBe(ANONYMOUS)
  })

  it('refuses an update of a client built with identity: "anonymous", and sends nothing', async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const canister = clientAs(replica, "anonymous").canister<shapes.Actor>(
      shapes.actor,
      { id: SHAPES }
    )
    await expect(canister.note("hi")).rejects.toMatchObject({
      kind: "unauthenticated",
    })
    expect(canisterRequests(replica)).toEqual([])
  })

  it("sends an update as an explicit AnonymousIdentity, the written-out way to write anonymously", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const canister = clientAs(
      replica,
      new AnonymousIdentity()
    ).canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    await expect(canister.address("x")).resolves.toBe(`x:${ANONYMOUS}`)
    expect(requestsFor(replica, "address")).toMatchObject([
      { endpoint: "call", caller: ANONYMOUS },
    ])
  })

  it("sends a call as whoever is signed in when it is made", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
    })
    const first = client.caller()
    await expect(canister.who()).resolves.toBe(first)
    auth.switchTo(2)
    await expect(canister.who()).resolves.toBe(client.caller())
    expect(client.caller()).not.toBe(first)
  })
})

describe("what is sent again", () => {
  /** Waits past both re-send delays, so a re-send would be in the log. */
  const pastResendDelays = () => sleep(300 + 600 + 200)

  it.each([
    [4, "rejected"],
    [5, "rejected"],
  ] as const)(
    "never re-sends an update rejected with code %i",
    async (code, kind) => {
      const { canister, replica } = shapesSetup({
        bump: () => replica.reject(code),
      })
      await expect(canister.bump(1n)).rejects.toMatchObject({
        kind,
        rejectCode: code,
        mayHaveExecuted: true,
      })
      await pastResendDelays()
      expect(requestsFor(replica, "bump")).toHaveLength(1)
    }
  )

  it("never re-sends an update whose reply was lost", async () => {
    const { canister, replica } = shapesSetup()
    replica.dropNextReply()
    await expect(canister.bump(1n)).rejects.toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    await pastResendDelays()
    expect(requestsFor(replica, "bump")).toMatchObject([{ dropped: true }])
  })

  it.each([408, 500, 503])(
    "never re-sends an update answered with HTTP %i",
    async (status) => {
      const { canister, replica } = shapesSetup()
      replica.refuseNext(status)
      await expect(canister.bump(1n)).rejects.toMatchObject({
        kind: "outcome_unknown",
        httpStatus: status,
        mayHaveExecuted: true,
      })
      await pastResendDelays()
      expect(requestsFor(replica, "bump")).toHaveLength(1)
    }
  )

  it("re-sends an update once after a SysTransient reject, and resolves", async () => {
    let attempts = 0
    const { canister, replica } = shapesSetup({
      bump: ([n]) => {
        attempts += 1
        if (attempts === 1) replica.reject(2)
        return { tag: "ok", value: n }
      },
    })
    await expect(canister.bump(9n)).resolves.toBe(9n)
    expect(requestsFor(replica, "bump")).toHaveLength(2)
  })

  it("re-sends an update once after HTTP 429, and resolves", async () => {
    const { canister, replica } = shapesSetup()
    replica.refuseNext(429)
    await expect(canister.bump(1n)).resolves.toBe(2n)
    expect(requestsFor(replica, "bump")).toMatchObject([
      { refused: expect.stringContaining("429") },
      { methodName: "bump" },
    ])
  })

  it("re-sends an update at most twice", async () => {
    const { canister, replica } = shapesSetup()
    replica.refuseNext(429, 3)
    await expect(canister.bump(1n)).rejects.toMatchObject({
      kind: "not_delivered",
      httpStatus: 429,
      mayHaveExecuted: false,
    })
    await pastResendDelays()
    expect(requestsFor(replica, "bump")).toHaveLength(3)
  })

  it.each([
    ["a SysTransient reject", "reject"],
    ["HTTP 429", "429"],
  ] as const)(
    "never re-sends an update to aaaaa-aa after %s",
    async (_label, failure) => {
      const replica = replicaWith({})
      replica.addCanister(
        MANAGEMENT,
        serve<management.Actor>(management.actor, {
          start_canister: () => replica.reject(2),
        })
      )
      if (failure === "429") replica.refuseNext(429)
      const ic = clientAs(replica, alice).canister<management.Actor>(
        management.actor,
        { id: MANAGEMENT }
      )
      await expect(
        ic.start_canister({ canister_id: principal(SHAPES) })
      ).rejects.toSatisfy(isReactorError)
      await pastResendDelays()
      expect(requestsFor(replica, "start_canister")).toHaveLength(1)
    }
  )

  it("re-sends a direct read after a failure that proves it was not delivered", async () => {
    const { canister, replica } = shapesSetup()
    replica.refuseNext(503)
    await expect(canister.one(1n)).resolves.toBe(2n)
    expect(requestsFor(replica, "one")).toHaveLength(2)
  })

  it("does not re-send a direct read the canister rejected", async () => {
    const { canister, replica } = shapesSetup({
      one: () => replica.reject(4),
    })
    await expect(canister.one(1n)).rejects.toMatchObject({
      kind: "rejected",
      rejectCode: 4,
      mayHaveExecuted: false,
    })
    await pastResendDelays()
    expect(requestsFor(replica, "one")).toHaveLength(1)
  })
})

describe("an update the replica answers later", () => {
  const STATUS = new TextEncoder().encode("request_status")
  const same = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((byte, i) => byte === b[i])

  /**
   * Wraps the replica's `fetch` so that a call is answered 202 (accepted, the
   * answer to be polled for), and the first `failures` polls of its status
   * fail as a lost connection before the certificate the replica made is
   * handed out.
   */
  function answerLater(
    fetch: typeof globalThis.fetch,
    failures: number
  ): { fetch: typeof globalThis.fetch; polls: () => number } {
    let certificate: Uint8Array | undefined
    let polls = 0
    const wrapped = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.endsWith("/call")) {
        const response = await fetch(input, init)
        const body = Cbor.decode(new Uint8Array(await response.arrayBuffer()))
        certificate = (body as { certificate: Uint8Array }).certificate
        return new Response(null, { status: 202 })
      }
      if (url.endsWith("/read_state") && certificate !== undefined) {
        const envelope = Cbor.decode(
          new Uint8Array(
            await new Response(init?.body as BodyInit).arrayBuffer()
          )
        ) as { content: { paths: Uint8Array[][] } }
        if (envelope.content.paths.some(([label]) => same(label, STATUS))) {
          polls += 1
          if (polls <= failures) {
            throw new TypeError("the connection was lost")
          }
          return new Response(Cbor.encode({ certificate }) as BodyInit, {
            status: 200,
            headers: { "content-type": "application/cbor" },
          })
        }
      }
      return fetch(input, init)
    }
    return { fetch: wrapped, polls: () => polls }
  }

  it("polls the same request again after a lost poll, and resolves with the reply", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const later = answerLater(replica.fetch, 1)
    const canister = clientAs(
      { ...replica, fetch: later.fetch },
      alice
    ).canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    await expect(canister.bump(4n)).resolves.toBe(5n)
    expect(later.polls()).toBe(2)
    expect(requestsFor(replica, "bump")).toHaveLength(1)
  })

  it("gives up as outcome_unknown when polls keep failing, without sending the update again", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const later = answerLater(replica.fetch, Infinity)
    const canister = clientAs(
      { ...replica, fetch: later.fetch },
      alice
    ).canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    await expect(canister.bump(4n)).rejects.toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    expect(later.polls()).toBe(4)
    expect(requestsFor(replica, "bump")).toHaveLength(1)
  }, 10_000)
})

describe("the target", () => {
  it("is the same canister object for the same service and target, so it can be made in render", () => {
    const replica = replicaWith({})
    const client = clientAs(replica, alice)
    const first = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    expect(client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })).toBe(
      first
    )
    expect(
      client.canister<shapes.Actor>(shapes.actor, {
        id: SHAPES,
        certified: false,
      })
    ).toBe(first)
    expect(
      client.canister<shapes.Actor>(shapes.actor, {
        id: SHAPES,
        certified: true,
      })
    ).not.toBe(first)
    expect(
      client.canister<shapes.Actor>(shapes.actor, { id: LEDGER })
    ).not.toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
    // Its methods and nothing else: no property a Candid name could collide with.
    expect(Object.keys(first).sort()).toEqual(
      [...serviceMethods(shapes.actor).keys()].sort()
    )
  })

  it("throws a TypeError naming an id that is not principal text", () => {
    const client = clientAs(replicaWith({}), alice)
    expect(() =>
      client.canister<shapes.Actor>(shapes.actor, { id: "not-a-canister" })
    ).toThrow(/"not-a-canister" is not a valid canister id/)
  })

  it.each([
    ["both id and name", { id: SHAPES, name: "backend" }],
    ["neither", {}],
    ["an unknown option", { canisterId: SHAPES }],
    ["a certified flag that is not a boolean", { id: SHAPES, certified: 1 }],
  ])("throws a TypeError for a target with %s", (_label, target) => {
    const client = clientAs(replicaWith({}), alice)
    expect(() =>
      client.canister<shapes.Actor>(
        shapes.actor,
        target as unknown as { id: string }
      )
    ).toThrow(TypeError)
  })

  it("throws a TypeError for a schema that is not a service", () => {
    const client = clientAs(replicaWith({}), alice)
    expect(() => client.canister(shapes.Pair as never, { id: SHAPES })).toThrow(
      /service schema/
    )
  })

  it.each([
    ["on a server, where there is no cookie to read", false],
    ["on a page whose host the cookie is not trusted for", true],
  ])(
    "rejects every call to an unresolved { name } %s, and sends nothing",
    async (_label, page) => {
      // The cookie names the canister, but on this page anyone on a sibling
      // subdomain could have written it, so it must not be believed.
      const cookie = icEnvCookie({ "PUBLIC_CANISTER_ID:backend": SHAPES })
      if (page) stubPage("https://app.example.com", { cookie })
      else stubNoWindow({ cookie })
      const replica = replicaWith({ [SHAPES]: shapesCanister() })
      const canister = clientAs(replica, alice).canister<shapes.Actor>(
        shapes.actor,
        { name: "backend" }
      )
      for (const call of [() => canister.who(), () => canister.bump(1n)]) {
        const error = await call().catch((e: unknown) => e)
        expect(error).toMatchObject({
          kind: "invalid_args",
          code: "canister_id_unresolved",
          canisterId: "$unresolved:backend",
          mayHaveExecuted: false,
        })
        expect((error as Error).message).toContain("backend")
      }
      expect(replica.requests).toEqual([])
    }
  )
})

describe("a certified canister", () => {
  it("sends its query methods as replicated calls", async () => {
    const { client, replica } = shapesSetup()
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    await expect(certified.one(1n)).resolves.toBe(2n)
    await expect(certified.who()).resolves.toBe(ALICE)
    expect(canisterRequests(replica).map((r) => r.endpoint)).toEqual([
      "call",
      "call",
    ])
  })

  it("lets anybody read certified: a certified read is not a write", async () => {
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const certified = clientAs(replica, "anonymous").canister<shapes.Actor>(
      shapes.actor,
      { id: SHAPES, certified: true }
    )
    await expect(certified.who()).resolves.toBe(ANONYMOUS)
  })

  it("refuses a composite query, which has no certified path, and sends nothing", async () => {
    const { client, replica, canister } = shapesSetup()
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    await expect(certified.composite(2n)).rejects.toMatchObject({
      kind: "invalid_args",
      code: "no_certified_path",
      mayHaveExecuted: false,
    })
    expect(canisterRequests(replica)).toEqual([])
    await expect(canister.composite(2n)).resolves.toBe(4n)
    expect(canisterRequests(replica)).toMatchObject([{ endpoint: "query" }])
  })
})

describe("a call made as a caller who signs out before it is sent", () => {
  it("is cancelled rather than sent as somebody else", async () => {
    const gate = deferred()
    const replica = replicaWith({ [SHAPES]: shapesCanister() })
    const auth = createTestAuth({ seed: 1 })
    const slowAuth = withIdentity(auth, async () => {
      const identity = await auth.getIdentity()
      await gate.promise
      return identity
    })
    const canister = clientWithAuth(replica, slowAuth).canister<shapes.Actor>(
      shapes.actor,
      { id: SHAPES }
    )
    const call = canister.address("x")
    await auth.signOut()
    gate.resolve()
    await expect(call).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    })
    expect(canisterRequests(replica)).toEqual([])
  })
})
