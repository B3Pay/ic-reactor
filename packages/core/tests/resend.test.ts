/**
 * `client.resendOf()`: a write whose outcome is unknown, offered to send again
 * exactly as it was sent, by whoever sent it, for a method the app says
 * deduplicates.
 *
 * The ledger here deduplicates as an ICRC-1 ledger does: a transfer whose
 * sender and argument it has seen, `created_at_time` set, is answered
 * `Duplicate` and moves nothing. Each test loses a reply with
 * `dropNextReply()`, so the first attempt ran and its sender cannot tell.
 */
import { principal } from "@candid-core/schema"
import { MutationObserver } from "@tanstack/query-core"
import { afterEach, describe, expect, it } from "vitest"
import { createTestClient } from "../src/testing/index.js"
import { ANONYMOUS, LEDGER, SHAPES } from "./canister-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"

/** Seed 1, who signs in first: the same principal in every run. */
const SEED_1 = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
const BOB = principal("aaaaa-aa")
const AS_VIEW = Symbol.for("ic-reactor.client.as")

const made: ReturnType<typeof createTestClient>[] = []
afterEach(() => {
  for (const test of made.splice(0)) test.client.dispose()
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

/** A test client with a ledger that deduplicates by sender and argument. */
function setup() {
  const test = createTestClient({ identity: 1 })
  made.push(test)
  const seen = new Map<string, bigint>()
  let blocks = 0n
  test.mock<icrc1.Actor>(icrc1.actor, LEDGER, {
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
      blocks += 1n
      if (key !== undefined) seen.set(key, blocks)
      if (arg.amount > 1_000n) {
        return {
          tag: "Err",
          value: { tag: "InsufficientFunds", value: { balance: 1_000n } },
        }
      }
      return { tag: "Ok", value: blocks }
    },
  })
  const ledger = test.client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
  /** How many transfers the ledger ran, duplicates left out. */
  const ran = () => blocks
  const sent = () =>
    test.requests.filter((r) => r.methodName === "icrc1_transfer").length
  return { ...test, ledger, ran, sent }
}

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
})
