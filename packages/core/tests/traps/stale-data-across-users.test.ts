/**
 * Trap: one user's data shown to the next user of the same browser.
 *
 * The mistake a hand-written integration makes: its cache key names the
 * method and the arguments and leaves out who is calling
 * (`["balance", account]`). After a sign-in, a switch of account or a
 * sign-out, the cache still holds the previous user's answer under the key
 * the new user reads, so it is shown to them until a refetch replaces it. And
 * a read that was slow, started for one user and answered after the switch,
 * lands in whatever key the app has by then, or is sent again as the user who
 * is signed in now: either way an answer to one principal sits under another.
 * Where a canister answers each caller differently (a ledger that tells an
 * account's balance to its owner only) it is a privacy leak.
 *
 * The guarantee: a read's key holds the principal that calls, so after a
 * sign-in, a switch or a sign-out the new caller's key is empty until it
 * loads, a read made for a user is sent as that user and lands under that
 * user's key, and once the caller has changed the read made for the previous
 * one is cancelled instead of being sent as the new one. This file plays a
 * session through real TanStack Query observers (two views of a private
 * ledger: the caller's own balance, which a component rebuilds with the
 * caller, and Alice's, a fixed account that every user of the page looks at)
 * and requires that nothing an observer shows was meant for somebody else.
 */
import { principal } from "@candid-core/schema"
import { QueryObserver } from "@tanstack/query-core"
import { afterAll, expect, it } from "vitest"
import {
  ALICE,
  ANONYMOUS,
  BOB,
  disposeAll,
  eventually,
  setupLedger,
} from "./ledger.js"

afterAll(disposeAll)

it("never shows the balance of one principal to another through a sign-in, a switch with a slow read, and a sign-out", async () => {
  const l = setupLedger({ signedIn: false, privateBalances: true })
  const { client, ledger, auth } = l
  const own = new Map<string, bigint>([
    [ANONYMOUS, 0n],
    [ALICE, 1_000_000n],
    [BOB, 500_000n],
  ])

  // What a component builds on each render: its own balance, and Alice's.
  const mine = () => ({
    ...client.queryOptions(ledger, "icrc1_balance_of", {
      owner: principal(client.caller()),
      subaccount: null,
    }),
    retry: false,
  })
  const alices = () => ({
    ...client.queryOptions(ledger, "icrc1_balance_of", {
      owner: ALICE,
      subaccount: null,
    }),
    retry: false,
  })
  const views = {
    mine: new QueryObserver(client.queryClient, mine()),
    alices: new QueryObserver(client.queryClient, alices()),
  }

  // The balance the ledger tells `viewer` for each view: what they may see.
  const entitled = (view: keyof typeof views, viewer: string): bigint =>
    view === "mine"
      ? (own.get(viewer) ?? 0n)
      : viewer === ALICE
        ? 1_000_000n
        : 0n

  // Everything an observer ever shows, with who was looking: a component
  // builds its options again when the caller changes, which is what the
  // client's subscription stands for here.
  let viewer: string = client.caller()
  const shown: { view: string; viewer: string; data: bigint | undefined }[] = []
  const stops = Object.entries(views).map(([view, observer]) =>
    observer.subscribe((result) =>
      shown.push({ view, viewer, data: result.data })
    )
  )
  const stop = client.subscribe(() => {
    viewer = client.caller()
    views.mine.setOptions(mine())
    views.alices.setOptions(alices())
    // What the new caller is shown at the moment of the change, before
    // anything has loaded for them: empty, or what is theirs to see.
    shown.push(
      { view: "mine", viewer, data: views.mine.getCurrentResult().data },
      { view: "alices", viewer, data: views.alices.getCurrentResult().data }
    )
  })
  const showing = (mineData: bigint, alicesData: bigint) =>
    eventually(() => {
      expect(views.mine.getCurrentResult().data).toBe(mineData)
      expect(views.alices.getCurrentResult().data).toBe(alicesData)
    })

  // Nobody is signed in: the anonymous principal reads, and sees nothing of
  // Alice's.
  await showing(0n, 0n)

  // Alice signs in: both views move to her keys.
  await client.signIn()
  expect(client.caller()).toBe(ALICE)
  await showing(1_000_000n, 1_000_000n)
  const aliceKey = client.queryKey(ledger, "icrc1_balance_of", {
    owner: ALICE,
    subaccount: null,
  })
  const aliceOptions = alices()

  // Alice's next read of her balance is held in flight, past her switch to
  // Bob.
  const release = l.hold(ALICE)
  const before = l.sent().length
  void client.queryClient.refetchQueries({ queryKey: aliceKey })
  await eventually(() => expect(l.sent()).toHaveLength(before + 1))
  auth.switchTo(2)
  expect(client.caller()).toBe(BOB)
  await showing(500_000n, 0n)

  // Alice's slow read is answered, to the key it was made for: Bob's views
  // are as they were.
  release()
  await eventually(() =>
    expect(client.queryClient.isFetching({ queryKey: aliceKey })).toBe(0)
  )
  expect(views.mine.getCurrentResult().data).toBe(500_000n)
  expect(views.alices.getCurrentResult().data).toBe(0n)
  expect(client.queryClient.getQueryData(aliceKey)).toBe(1_000_000n)

  // A read of Alice's key that starts now runs the function made for Alice.
  // It must not go out as Bob, whose answer, zero, would sit under her key.
  const sentBefore = l.sent().length
  await client.queryClient
    .fetchQuery({ ...aliceOptions, staleTime: 0 })
    .catch((error: unknown) => error)
  expect(l.sent()).toHaveLength(sentBefore)
  expect(client.queryClient.getQueryData(aliceKey)).toBe(1_000_000n)

  // Back to Alice, and then to nobody.
  auth.switchTo(1)
  expect(client.caller()).toBe(ALICE)
  await showing(1_000_000n, 1_000_000n)
  await auth.signOut()
  expect(client.caller()).toBe(ANONYMOUS)
  await showing(0n, 0n)

  stop()
  for (const unsubscribe of stops) unsubscribe()

  // Every view of every principal was seen, and what was shown to each of
  // them was empty or theirs.
  expect(new Set(shown.map((entry) => entry.viewer))).toEqual(
    new Set([ANONYMOUS, ALICE, BOB])
  )
  for (const { view, viewer: who, data } of shown) {
    if (data !== undefined) {
      expect(data, `${view} shown to ${who}`).toBe(
        entitled(view as keyof typeof views, who)
      )
    }
  }
})
