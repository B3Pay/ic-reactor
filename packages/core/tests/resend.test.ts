/**
 * `client.resendOf()`: a write whose outcome is unknown, offered to send again
 * exactly as it was sent, by whoever sent it, for a method the app says
 * deduplicates.
 *
 * The ledger here deduplicates as an ICRC-1 ledger does: a transfer whose
 * sender and argument it has seen, `created_at_time` set, is answered
 * `Duplicate` and moves nothing. Each test loses a reply with
 * `dropNextReply()`, so the first attempt ran and its sender cannot tell.
 *
 * A second such ledger runs at ARCHIVE, which has seen no transfer: the
 * canister a `{ name }` moves to after a redeploy, where the same argument
 * would be a new transfer.
 */
import { principal } from "@candid-core/schema"
import { MutationObserver } from "@tanstack/query-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { isReactorError } from "../src/index.js"
import { createTestClient } from "../src/testing/index.js"
import {
  ANONYMOUS,
  ARCHIVE,
  LEDGER,
  MANAGEMENT,
  SHAPES,
} from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as management from "./fixtures/management.js"
import * as shapes from "./fixtures/shapes.js"
import { icEnvCookie, stubPage } from "./network-helpers.js"

/** Seed 1, who signs in first: the same principal in every run. */
const SEED_1 = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
const BOB = principal("aaaaa-aa")
const AS_VIEW = Symbol.for("ic-reactor.client.as")

const made: ReturnType<typeof createTestClient>[] = []
afterEach(() => {
  for (const test of made.splice(0)) test.client.dispose()
  vi.unstubAllGlobals()
})

/** A dedupe key, as an ICRC-1 transfer has it. */
const dedupedBy = (arg: icrc1.TransferArg) => arg.created_at_time

const transfer = (
  created_at_time: bigint | null = 1_000n
): icrc1.TransferArg => ({
  to: { owner: BOB, subaccount: null },
  amount: 100n,
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time,
})

/** A test client with ledgers that deduplicate by sender and argument. */
function setup(options: Parameters<typeof createTestClient>[0] = {}) {
  const test = createTestClient({ identity: 1, ...options })
  made.push(test)
  const blocks = new Map<string, bigint>()
  for (const id of [LEDGER, ARCHIVE]) {
    const seen = new Map<string, bigint>()
    test.mock<icrc1.Actor>(icrc1.actor, id, {
      icrc1_transfer: (arg, { caller }) => {
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
        const block = (blocks.get(id) ?? 0n) + 1n
        blocks.set(id, block)
        if (key !== undefined) seen.set(key, block)
        if (arg.amount > 1_000n) {
          return {
            tag: "Err",
            value: { tag: "InsufficientFunds", value: { balance: 1_000n } },
          }
        }
        return { tag: "Ok", value: block }
      },
    })
  }
  const ledger = test.client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
  /** How many transfers a ledger ran, duplicates left out. */
  const ran = (id = LEDGER) => blocks.get(id) ?? 0n
  /** The canister id of every transfer the replica was sent. */
  const transfers = () =>
    test.requests
      .filter((r) => r.methodName === "icrc1_transfer")
      .map((r) => r.canisterId)
  const sent = () => transfers().length
  return { ...test, ledger, ran, sent, transfers }
}

/** A field of an argument, written as an app that reuses the object would. */
const rewrite = <T extends object>(arg: T, fields: Partial<T>) =>
  Object.assign(arg as Record<string, unknown>, fields)

/** A direct transfer whose reply is lost, and the error it rejected with. */
async function lostTransfer(
  t: ReturnType<typeof setup>,
  arg = transfer()
): Promise<unknown> {
  t.dropNextReply()
  const error = await t.ledger.icrc1_transfer(arg).catch((e: unknown) => e)
  expect(error).toMatchObject({
    kind: "outcome_unknown",
    mayHaveExecuted: true,
  })
  return error
}

describe("client.resendOf", () => {
  it("offers the attempt's own argument after a lost reply, and the re-send answers Duplicate", async () => {
    const t = setup()
    const arg = transfer()
    const error = await lostTransfer(t, arg)

    const again = t.client.resendOf(error, t.ledger, "icrc1_transfer", {
      dedupedBy,
    })
    expect(again).toMatchObject({ from: SEED_1 })
    expect(again?.arg).toBe(arg)
    await expect(again?.send()).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate", value: { duplicate_of: 1n } },
    })
    expect(t.ran()).toBe(1n)
    expect(t.sent()).toBe(2)
  })

  it("offers nothing after a failure whose outcome is known", async () => {
    const t = setup()
    const offerFor = (error: unknown) =>
      t.client.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })

    // The canister answered: it ran the call and refused it.
    const refused = await t.ledger
      .icrc1_transfer({ ...transfer(), amount: 5_000n })
      .catch((e: unknown) => e)
    expect(refused).toMatchObject({
      kind: "canister_err",
      mayHaveExecuted: false,
    })
    expect(offerFor(refused)).toBeUndefined()

    // Turned away before any canister saw it.
    t.refuseNext(400)
    const turnedAway = await t.ledger
      .icrc1_transfer(transfer(2_000n))
      .catch((e: unknown) => e)
    expect(turnedAway).toMatchObject({
      kind: "not_delivered",
      mayHaveExecuted: false,
    })
    expect(offerFor(turnedAway)).toBeUndefined()

    // No failure at all.
    expect(offerFor(null)).toBeUndefined()
  })

  it("offers nothing after a sign-out, nor to another account, and again once the sender signs back in", async () => {
    const t = setup()
    const error = await lostTransfer(t)
    const offer = () =>
      t.client.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })

    await t.client.signOut()
    expect(t.client.caller()).toBe(ANONYMOUS)
    expect(offer()).toBeUndefined()

    t.auth.switchTo(2)
    expect(t.client.caller()).not.toBe(SEED_1)
    expect(offer()).toBeUndefined()

    await t.client.signIn(1)
    expect(t.client.caller()).toBe(SEED_1)
    expect(offer()).toMatchObject({ from: SEED_1 })
  })

  it("sends an offered argument only as its sender, by send() or by the mutation", async () => {
    const t = setup()
    const mutation = new MutationObserver(
      t.client.queryClient,
      t.client.mutationOptions(t.ledger, "icrc1_transfer")
    )
    t.dropNextReply()
    await expect(mutation.mutate(transfer())).rejects.toMatchObject({
      kind: "outcome_unknown",
    })
    const again = t.client.resendOf(
      mutation.getCurrentResult().error,
      t.ledger,
      "icrc1_transfer",
      { dedupedBy }
    )
    expect(again?.arg).toBe(mutation.getCurrentResult().variables)

    // Someone else signs in before the re-send is pressed.
    t.auth.switchTo(2)
    const cancelled = {
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    }
    await expect(again?.send()).rejects.toMatchObject(cancelled)
    await expect(mutation.mutate(again!.arg)).rejects.toMatchObject(cancelled)
    expect(t.sent()).toBe(1)

    // The sender again: the mutation re-sends it, and the ledger says it ran.
    t.auth.switchTo(1)
    await expect(mutation.mutate(again!.arg)).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate" },
    })
    expect(t.ran()).toBe(1n)
  })

  it("offers nothing for an argument with no dedupe key, and needs dedupedBy", async () => {
    const t = setup()
    const error = await lostTransfer(t, transfer(null))
    expect(
      t.client.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })
    ).toBeUndefined()
    expect(() =>
      t.client.resendOf(error, t.ledger, "icrc1_transfer", undefined as never)
    ).toThrow(/needs \{ dedupedBy/)
  })

  it("offers nothing for an argument that is not an object", async () => {
    const t = setup()
    t.mock<shapes.Actor>(shapes.actor, SHAPES, {
      bump: (n) => ({ tag: "ok", value: n }),
    })
    const canister = t.client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
    })
    t.dropNextReply()
    const error = await canister.bump(7n).catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: "outcome_unknown" })
    expect(
      t.client.resendOf(error, canister, "bump", { dedupedBy: (n) => n })
    ).toBeUndefined()
  })

  it("offers nothing for another method's or canister object's error", async () => {
    const t = setup()
    const error = await lostTransfer(t)
    const certified = t.client.canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
      certified: true,
    })
    expect(
      t.client.resendOf(error, certified, "icrc1_transfer", { dedupedBy })
    ).toBeUndefined()
    expect(
      t.client.resendOf(error, t.ledger, "icrc1_fee", {
        dedupedBy: () => 1,
      })
    ).toBeUndefined()
  })

  it("answers for the live caller on a view pinned to another principal", async () => {
    const t = setup()
    const error = await lostTransfer(t)
    type ViewOf = (principal: string) => typeof t.client
    const viewAs = (t.client as unknown as { [AS_VIEW]: ViewOf })[AS_VIEW]

    // Hydrating as the server's anonymous caller, while the sender is live.
    const hydrating = viewAs.call(t.client, ANONYMOUS)
    expect(hydrating.caller()).toBe(ANONYMOUS)
    expect(
      hydrating.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })
    ).toMatchObject({ from: SEED_1 })

    // Pinned to the sender, while nobody is signed in.
    await t.client.signOut()
    const pinned = viewAs.call(t.client, SEED_1)
    expect(pinned.caller()).toBe(SEED_1)
    expect(
      pinned.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })
    ).toBeUndefined()
  })

  it("sends the bytes the attempt sent, whatever became of its argument since, and offers nothing once it changed", async () => {
    const t = setup()
    const arg = transfer()
    const error = await lostTransfer(t, arg)
    const offer = () =>
      t.client.resendOf(error, t.ledger, "icrc1_transfer", { dedupedBy })
    const again = offer()
    expect(again?.arg).toBe(arg)

    // The app reuses the object for its next transfer, with a new dedupe key.
    rewrite(arg, { created_at_time: 2_000n })
    expect(offer()).toBeUndefined()
    await expect(again?.send()).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate", value: { duplicate_of: 1n } },
    })
    expect(t.ran()).toBe(1n)
    expect(t.sent()).toBe(2)
  })

  it("refuses a mutation of an offered argument changed since it was sent, and sends nothing", async () => {
    const t = setup()
    const mutation = new MutationObserver(
      t.client.queryClient,
      t.client.mutationOptions(t.ledger, "icrc1_transfer")
    )
    const arg = transfer()
    t.dropNextReply()
    await expect(mutation.mutate(arg)).rejects.toMatchObject({
      kind: "outcome_unknown",
    })
    const again = t.client.resendOf(
      mutation.getCurrentResult().error,
      t.ledger,
      "icrc1_transfer",
      { dedupedBy }
    )
    expect(again?.arg).toBe(arg)

    // Changed after the offer, as a form bound to the object would change it.
    rewrite(arg, { amount: 200n })
    const refused = await mutation.mutate(again!.arg).catch((e: unknown) => e)
    expect(refused).toMatchObject({
      kind: "invalid_args",
      code: "arg_changed",
      mayHaveExecuted: false,
      canisterId: LEDGER,
    })
    expect(isReactorError(refused, t.ledger, "icrc1_transfer")).toBe(true)
    expect(t.sent()).toBe(1)

    // As it was sent again, it is the same write, and the ledger says it ran.
    rewrite(arg, { amount: 100n })
    await expect(mutation.mutate(again!.arg)).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate", value: { duplicate_of: 1n } },
    })
    expect(t.ran()).toBe(1n)
    expect(t.sent()).toBe(2)
  })

  it("keeps a { name } canister's re-send on the canister the write went to after the name moves", async () => {
    // A local page whose ic_env cookie maps "ledger" to LEDGER until a
    // redeploy maps it to ARCHIVE; the cookie is read afresh every time.
    let deployed = LEDGER
    stubPage("http://localhost:5173")
    vi.stubGlobal("document", {
      get cookie() {
        return icEnvCookie({ "PUBLIC_CANISTER_ID:ledger": deployed })
      },
    })
    const t = setup({ allowEnvConfig: true })
    const named = t.client.canister<icrc1.Actor>(icrc1.actor, {
      name: "ledger",
    })
    const mutation = new MutationObserver(
      t.client.queryClient,
      t.client.mutationOptions(named, "icrc1_transfer")
    )
    t.dropNextReply()
    await expect(mutation.mutate(transfer())).rejects.toMatchObject({
      kind: "outcome_unknown",
      canisterId: LEDGER,
    })
    const error = mutation.getCurrentResult().error
    const offer = () =>
      t.client.resendOf(error, named, "icrc1_transfer", { dedupedBy })
    const again = offer()
    expect(again).toMatchObject({ from: SEED_1 })

    deployed = ARCHIVE
    expect(offer()).toBeUndefined()
    await expect(mutation.mutate(again!.arg)).rejects.toMatchObject({
      kind: "cancelled",
      code: "target_changed",
      mayHaveExecuted: false,
      canisterId: ARCHIVE,
    })
    expect(t.sent()).toBe(1)

    // send() goes where the write went, and that ledger says it ran.
    await expect(again?.send()).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate", value: { duplicate_of: 1n } },
    })
    expect(t.transfers()).toEqual([LEDGER, LEDGER])
    expect(t.ran(ARCHIVE)).toBe(0n)

    // Mapped back, the mutation re-sends it to that ledger as well.
    deployed = LEDGER
    expect(offer()).toMatchObject({ from: SEED_1 })
    await expect(mutation.mutate(again!.arg)).rejects.toMatchObject({
      kind: "canister_err",
      err: { tag: "Duplicate" },
    })
    expect(t.ran()).toBe(1n)
  })

  it("refuses an offered argument given to a mutation of another method that takes the same type, and offers it for none", async () => {
    const t = setup()
    const calls: string[] = []
    t.mock<management.Actor>(management.actor, MANAGEMENT, {
      stop_canister: () => {
        calls.push("stop")
      },
      start_canister: () => {
        calls.push("start")
      },
    })
    const ic = t.client.canister<management.Actor>(management.actor, {
      id: MANAGEMENT,
    })
    const stop = new MutationObserver(
      t.client.queryClient,
      t.client.mutationOptions(ic, "stop_canister")
    )
    t.dropNextReply()
    await expect(
      stop.mutate({ canister_id: principal(SHAPES) })
    ).rejects.toMatchObject({ kind: "outcome_unknown" })
    const error = stop.getCurrentResult().error
    const dedupedBy = (arg: { canister_id: unknown }) => arg.canister_id
    expect(
      t.client.resendOf(error, ic, "start_canister", { dedupedBy })
    ).toBeUndefined()
    const again = t.client.resendOf(error, ic, "stop_canister", { dedupedBy })
    expect(again).toBeDefined()

    const start = new MutationObserver(
      t.client.queryClient,
      t.client.mutationOptions(ic, "start_canister")
    )
    await expect(start.mutate(again!.arg)).rejects.toMatchObject({
      kind: "cancelled",
      code: "target_changed",
      mayHaveExecuted: false,
    })
    expect(calls).toEqual(["stop"])
  })

  it("routes a management write's re-send by the effective canister id its write went out with", async () => {
    const t = setup()
    t.mock<management.Actor>(management.actor, MANAGEMENT, {
      stop_canister: () => undefined,
    })
    const ic = t.client.canister<management.Actor>(management.actor, {
      id: MANAGEMENT,
    })
    const arg = { canister_id: principal(SHAPES) }
    t.dropNextReply()
    const error = await ic.stop_canister(arg).catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: "outcome_unknown" })
    const again = t.client.resendOf(error, ic, "stop_canister", {
      dedupedBy: (arg) => arg.canister_id,
    })
    expect(again?.arg).toBe(arg)

    // The bytes still name SHAPES, so the call must still be routed by it.
    rewrite(arg, { canister_id: principal(LEDGER) })
    await expect(again?.send()).resolves.toBeUndefined()
    const stops = t.requests.filter((r) => r.methodName === "stop_canister")
    expect(stops.map((r) => r.effectiveCanisterId)).toEqual([SHAPES, SHAPES])
  })
})
