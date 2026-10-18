/**
 * `client.encode()` and `Resend.bytes`: the exact Candid bytes a call sends,
 * for an ICRC-21 consent request's `arg` or an audit log (#877).
 *
 * The fake canisters here keep the raw bytes each request carried, so every
 * check compares with what reached the replica, not with a second encoding.
 */
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { afterEach, describe, expect, it, vi } from "vitest"
import { isReactorError } from "../src/index.js"
import {
  createFakeReplica,
  type FakeCanister,
} from "../src/testing/fake-replica.js"
import {
  LEDGER,
  SHAPES,
  clientAs,
  ledgerCanister,
  serve,
} from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"
import { icEnvCookie, stubPage } from "./network-helpers.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** `canister`, keeping the bytes of every request it gets, by method. */
function recording(canister: FakeCanister) {
  const received: { method: string; arg: Uint8Array }[] = []
  const keep =
    (run: FakeCanister["query"]): FakeCanister["query"] =>
    (method, arg, context) => {
      received.push({ method, arg: arg.slice() })
      if (run === undefined) throw new Error(`no method ${method}`)
      return run(method, arg, context)
    }
  return {
    received,
    canister: { query: keep(canister.query), update: keep(canister.update) },
  }
}

function setup() {
  const shapesFake = recording(
    serve<shapes.Actor>(shapes.actor, {
      one: ([n]) => n + 1n,
      many: () => [1n, "a", true],
      pair: ([left, right]) => ({ left, right }),
    })
  )
  const ledgerFake = recording(ledgerCanister(new Map()))
  const replica = createFakeReplica({
    canisters: { [SHAPES]: shapesFake.canister, [LEDGER]: ledgerFake.canister },
  })
  return { replica, shapes: shapesFake, ledger: ledgerFake }
}

describe("client.encode()", () => {
  it("gives the bytes the replica receives, for one, no and two arguments", async () => {
    const t = setup()
    const client = clientAs(t.replica, "anonymous")
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })

    const one = client.encode(canister, "one", 41n)
    await canister.one(41n)
    const none = client.encode(canister, "many", undefined)
    await canister.many()
    const two = client.encode(canister, "pair", [7n, "seven"])
    await canister.pair(7n, "seven")

    expect(t.shapes.received.map(({ method }) => method)).toEqual([
      "one",
      "many",
      "pair",
    ])
    const [sentOne, sentNone, sentTwo] = t.shapes.received
    expect(one).toEqual(sentOne?.arg)
    expect(none).toEqual(sentNone?.arg)
    expect(two).toEqual(sentTwo?.arg)
    expect(one).toBeInstanceOf(Uint8Array)
  })

  it("sends nothing, and encodes for a { name } the cookie does not resolve", () => {
    const t = setup()
    stubPage("http://localhost:5173", { cookie: icEnvCookie({}) })
    const client = clientAs(t.replica, "anonymous")
    const resolved = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
    })
    const unresolved = client.canister<shapes.Actor>(shapes.actor, {
      name: "missing",
    })
    expect(client.encode(unresolved, "one", 1n)).toEqual(
      client.encode(resolved, "one", 1n)
    )
    expect(t.replica.requests).toEqual([])
  })

  it("throws the invalid_args a call rejects with for variables that do not encode", async () => {
    const t = setup()
    const client = clientAs(t.replica, "anonymous")
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    let thrown: unknown
    try {
      client.encode(canister, "one", "not a nat" as never)
    } catch (error) {
      thrown = error
    }
    const rejected: unknown = await canister
      .one("not a nat" as never)
      .catch((error: unknown) => error)
    expect(isReactorError(thrown, canister, "one")).toBe(true)
    expect(isReactorError(rejected, canister, "one")).toBe(true)
    const pick = (error: unknown) => {
      const { kind, method, canisterId, issues, reason, mayHaveExecuted } =
        error as Record<string, unknown>
      return { kind, method, canisterId, issues, reason, mayHaveExecuted }
    }
    expect(pick(thrown)).toEqual(pick(rejected))
    expect(pick(thrown)).toMatchObject({ kind: "invalid_args" })
    expect((thrown as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
    expect(t.shapes.received).toEqual([])
  })

  it("throws a TypeError for a method the service does not have", () => {
    const t = setup()
    const client = clientAs(t.replica, "anonymous")
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    expect(() => client.encode(canister, "nope" as never, 1n as never)).toThrow(
      TypeError
    )
  })
})

describe("Resend.bytes", () => {
  it("is what the lost attempt sent, and send() sends it again unchanged; a copy on every read", async () => {
    const t = setup()
    const client = clientAs(t.replica, Ed25519KeyIdentity.generate())
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const arg: icrc1.TransferArg = {
      to: { owner: "aaaaa-aa" as never, subaccount: null },
      amount: 1n,
      fee: null,
      memo: null,
      from_subaccount: null,
      created_at_time: 1_000n,
    }
    t.replica.dropNextReply()
    const error: unknown = await ledger
      .icrc1_transfer(arg)
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ kind: "outcome_unknown" })
    const again = client.resendOf(error, ledger, "icrc1_transfer", {
      dedupedBy: (sent) => sent.created_at_time,
    })
    expect(again).toBeDefined()
    const [first] = t.ledger.received
    expect(again?.bytes).toEqual(first?.arg)
    expect(again?.bytes).toEqual(client.encode(ledger, "icrc1_transfer", arg))

    // Changing the copy changes nothing that is sent.
    again?.bytes.fill(0)
    expect(again?.bytes).toEqual(first?.arg)
    await again?.send().catch(() => undefined)
    expect(t.ledger.received).toHaveLength(2)
    expect(t.ledger.received[1]?.arg).toEqual(first?.arg)
  })
})
