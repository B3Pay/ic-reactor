/**
 * `client.queryOptions` and `client.mutationOptions`, driven by real TanStack
 * Query observers on the client's own `QueryClient`, against a fake replica.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal, type Principal } from "@candid-core/schema"
import { HttpErrorCode, ProtocolError } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  focusManager,
  onlineManager,
  skipToken,
  type QueryKey,
} from "@tanstack/query-core"
import { classifyError } from "../src/errors.js"
import type { Client } from "../src/index.js"
import type { CanisterMutationOptions } from "../src/types.js"
import { createTestAuth } from "../src/testing/index.js"
import {
  ANONYMOUS,
  ARCHIVE,
  FEE,
  LEDGER,
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
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"
import { icEnvCookie, stubPage } from "./network-helpers.js"

afterEach(() => {
  vi.unstubAllGlobals()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

const alice = Ed25519KeyIdentity.generate()
const ALICE = principal(alice.getPrincipal().toText())
const BOB = principal(Ed25519KeyIdentity.generate().getPrincipal().toText())

/** The canister a local redeploy moves a `{ name }` to, in the tests that redeploy. */
const REDEPLOYED = ARCHIVE

/** A shapes canister whose `who` answers with the caller, held back for a caller while a gate is set. */
function whoCanister(holds: Map<string, Promise<void>>) {
  return serve<shapes.Actor>(shapes.actor, {
    who: async (_args, { caller }) => {
      await holds.get(caller)
      return principal(caller)
    },
    one: ([n]) => n + 1n,
    address: ([seed], { caller }) => `${seed}:${caller}`,
    bump: ([n]) => ({ tag: "ok", value: n + 1n }),
    note: () => undefined,
  })
}

describe("queryOptions", () => {
  it("reads through the client's QueryClient, as the caller in the key", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const options = client.queryOptions(canister, "who", undefined)
    await expect(client.queryClient.fetchQuery(options)).resolves.toBe(ALICE)
    expect(client.queryClient.getQueryData(options.queryKey)).toBe(ALICE)
    expect(requestsFor(replica, "who")).toMatchObject([
      { endpoint: "query", caller: ALICE },
    ])
  })

  it("never shows one principal's data under another's key, across sign-in, a switch with a read in flight, and sign-out", async () => {
    const holds = new Map<string, Promise<void>>()
    const replica = replicaWith({ [SHAPES]: whoCanister(holds) })
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    // The options a component would build on each render, without retries
    // so that a refused read settles at once.
    const options = () => ({
      ...client.queryOptions(canister, "who", undefined),
      retry: false,
    })
    const observer = new QueryObserver(client.queryClient, options())
    const shown: { caller: unknown; data: unknown }[] = []
    const unsubscribe = observer.subscribe((result) => {
      shown.push({ caller: observer.options.queryKey[2], data: result.data })
    })
    // A component re-renders when the caller changes, and builds its options
    // again: the read moves to the new caller's key.
    const stop = client.subscribe(() => observer.setOptions(options()))
    const shows = (who: string) =>
      vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(who))

    await shows(ANONYMOUS)
    await client.signIn()
    const a = client.caller()
    await shows(a)
    const keyOfA: QueryKey = observer.options.queryKey

    // A's next read is held in flight, past the switch to B.
    const held = deferred()
    holds.set(a, held.promise)
    void observer.refetch()
    await vi.waitFor(() =>
      expect(
        requestsFor(replica, "who").filter((r) => r.caller === a)
      ).toHaveLength(2)
    )
    auth.switchTo(2)
    const b = client.caller()
    await shows(b)
    held.resolve()
    holds.delete(a)
    await sleep(100)
    expect(observer.getCurrentResult().data).toBe(b)

    // A read of A's key that starts now runs A's query function, made for A:
    // it must not be sent as B, whose answer would land under A's key.
    await client.queryClient.refetchQueries({ queryKey: keyOfA })
    expect(client.queryClient.getQueryData(keyOfA)).toBe(a)

    // Back to A: A's key shows A's data and nobody else's.
    auth.switchTo(1)
    await shows(a)
    await auth.signOut()
    await shows(ANONYMOUS)
    await sleep(100)
    stop()
    unsubscribe()

    const callers = new Set(shown.map(({ caller }) => caller))
    expect(callers).toEqual(new Set([ANONYMOUS, a, b]))
    for (const { caller, data } of shown) {
      if (data !== undefined) expect(data).toBe(caller)
    }
    // Every request went out as the principal of the key it was made for.
    expect(
      requestsFor(replica, "who").every((r) =>
        [ANONYMOUS, a, b].includes(r.caller as string)
      )
    ).toBe(true)
  })

  it("refuses to run once the caller its key holds is no longer current, and sends nothing", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const options = client.queryOptions(canister, "who", undefined)
    auth.switchTo(2)
    await expect(
      client.queryClient.fetchQuery({ ...options, retry: false })
    ).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    })
    expect(canisterRequests(replica)).toEqual([])
  })

  it("does not re-send itself: TanStack's retry decides", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    replica.refuseNext(503)
    await expect(
      client.queryClient.fetchQuery({
        ...client.queryOptions(canister, "one", 1n),
        retry: false,
      })
    ).rejects.toMatchObject({ kind: "not_delivered", httpStatus: 503 })
    expect(requestsFor(replica, "one")).toHaveLength(1)
  })

  it("retries only a failure that proves the read was not delivered, and never on a server", () => {
    const replica = replicaWith({})
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const { retry } = client.queryOptions(canister, "one", 1n)
    const refused = classifyError(
      ProtocolError.fromCode(new HttpErrorCode(503, "busy", [])),
      { method: "one", canisterId: SHAPES, mode: "query" }
    )
    const rejected = classifyError(
      { kind: "Reject", code: { rejectCode: 4 } },
      { method: "one", canisterId: SHAPES, mode: "query" }
    )
    // Node is a server: nothing is retried.
    expect(retry(0, refused)).toBe(false)
    vi.stubGlobal("window", {})
    expect(retry(0, refused)).toBe(true)
    expect(retry(3, refused)).toBe(false)
    expect(retry(0, rejected)).toBe(false)
  })

  it("builds a tagged key for arguments that do not encode, and rejects invalid_args when run, sending nothing", async () => {
    const replica = replicaWith({ [LEDGER]: ledgerCanister(new Map()) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    // Half-typed input, as a form holds it mid-edit.
    const typing = { owner: "rrkah-" as Principal, subaccount: null }
    let options: ReturnType<
      typeof client.queryOptions<icrc1.Actor, "icrc1_balance_of">
    >
    expect(() => {
      options = client.queryOptions(ledger, "icrc1_balance_of", typing)
    }).not.toThrow()
    expect(options!.queryKey.slice(4, 6)).toEqual([
      "icrc1_balance_of",
      "$invalid",
    ])
    await expect(
      client.queryClient.fetchQuery({ ...options!, retry: false })
    ).rejects.toMatchObject({
      kind: "invalid_args",
      issues: [{ code: "invalid_type", path: "$args[0].owner" }],
      mayHaveExecuted: false,
    })
    expect(canisterRequests(replica)).toEqual([])
  })

  it("rejects canister_id_unresolved for an unresolved { name }, sending nothing", async () => {
    const replica = replicaWith({})
    const client = clientAs(replica, alice)
    const byName = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
    })
    await expect(
      client.queryClient.fetchQuery({
        ...client.queryOptions(byName, "one", 1n),
        retry: false,
      })
    ).rejects.toMatchObject({
      kind: "invalid_args",
      code: "canister_id_unresolved",
    })
    expect(replica.requests).toEqual([])
  })

  it("skips a read with skipToken", () => {
    const { client, canister } = (() => {
      const c = clientAs(replicaWith({}), alice)
      return {
        client: c,
        canister: c.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
      }
    })()
    const options = client.queryOptions(canister, "one", skipToken)
    expect(options.queryFn).toBe(skipToken)
    expect(options.queryKey[options.queryKey.length - 1]).toBe("$skip")
  })

  it("throws a TypeError for an update or oneway method, a certified composite query, or an unknown fourth argument", () => {
    const client = clientAs(replicaWith({}), alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    expect(() => client.queryOptions(canister, "bump", 1n)).toThrow(
      /bump is an update method/
    )
    expect(() => client.queryOptions(canister, "note", "x")).toThrow(TypeError)
    expect(() =>
      client.queryOptions(canister, "fire", "x", { update: "idempotent" })
    ).toThrow(/oneway/)
    expect(() => client.queryOptions(certified, "composite", 1n)).toThrow(
      /composite query/
    )
    expect(() =>
      client.queryOptions(canister, "one", 1n, {
        update: "always",
      } as unknown as { update: "idempotent" })
    ).toThrow(TypeError)
    expect(() => client.queryOptions(canister, "composite", 1n)).not.toThrow()
  })

  it("throws a TypeError for a method without results, which leaves a read nothing to cache, and its direct call still resolves", async () => {
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        nothing: () => undefined,
      }),
    })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    // Its call resolves undefined, which TanStack Query reports as a failed
    // read with nothing cached: refused when the options are built instead.
    expect(() => client.queryOptions(canister, "nothing")).toThrow(TypeError)
    expect(() => client.queryOptions(canister, "nothing", skipToken)).toThrow(
      /nothing has no results, and a method without results has nothing to cache\. Call it directly\./
    )
    // An update without results, opted in as a read, has nothing to cache
    // either.
    expect(() =>
      client.queryOptions(canister, "note", "x", { update: "idempotent" })
    ).toThrow(
      /note has no results.*Call it directly, or through mutationOptions/
    )
    expect(canisterRequests(replica)).toEqual([])
    await expect(canister.nothing()).resolves.toBeUndefined()
    expect(requestsFor(replica, "nothing")).toMatchObject([
      { endpoint: "query" },
    ])
  })
})

describe("an update read as a query, with { update: 'idempotent' }", () => {
  /** A signed-in client in a page, mounted so focus and network events reach its queries. */
  function mounted() {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    client.queryClient.mount()
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    return { replica, auth, client, canister }
  }

  /** Plays out what makes TanStack refetch: losing and regaining focus and the network, and a remount. */
  async function refocusReconnectRemount(
    remount: () => () => void
  ): Promise<void> {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await sleep(100)
    onlineManager.setOnline(false)
    onlineManager.setOnline(true)
    await sleep(100)
    const unsubscribe = remount()
    await sleep(100)
    unsubscribe()
  }

  it("is fetched once and never refetched on focus, reconnect or remount", async () => {
    const { replica, client, canister } = mounted()
    const build = () =>
      client.queryOptions(canister, "address", "x", { update: "idempotent" })
    expect(build()).toMatchObject({
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })
    const observer = new QueryObserver(client.queryClient, build())
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toBe(`x:${client.caller()}`)
    )
    await refocusReconnectRemount(() =>
      new QueryObserver(client.queryClient, build()).subscribe(() => {})
    )
    unsubscribe()
    client.queryClient.unmount()
    expect(requestsFor(replica, "address")).toMatchObject([
      { endpoint: "call" },
    ])
  })

  it("is refetched on focus, reconnect and remount when it is a plain read (the harness can see a refetch)", async () => {
    const { replica, client, canister } = mounted()
    const build = () => client.queryOptions(canister, "one", 1n)
    const observer = new QueryObserver(client.queryClient, build())
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(2n))
    await refocusReconnectRemount(() =>
      new QueryObserver(client.queryClient, build()).subscribe(() => {})
    )
    unsubscribe()
    client.queryClient.unmount()
    expect(requestsFor(replica, "one").length).toBeGreaterThanOrEqual(3)
  })

  it("is read again after a write to its canister, unless invalidates leaves it out", async () => {
    const { replica, client, canister } = mounted()
    const observer = new QueryObserver(
      client.queryClient,
      client.queryOptions(canister, "address", "x", { update: "idempotent" })
    )
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toBe(`x:${client.caller()}`)
    )
    // Q10's default: every read of the canister written to, this one too.
    await new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "bump")
    ).mutate(1n)
    expect(requestsFor(replica, "address")).toHaveLength(2)
    await new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "bump", {
        invalidates: [[canister, "one"]],
      })
    ).mutate(1n)
    expect(requestsFor(replica, "address")).toHaveLength(2)
    unsubscribe()
    client.queryClient.unmount()
  })

  it("is refused before sending for a caller who is not signed in", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const client = clientAs(replica, "anonymous")
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    await expect(
      client.queryClient.fetchQuery({
        ...client.queryOptions(canister, "address", "x", {
          update: "idempotent",
        }),
        retry: false,
      })
    ).rejects.toMatchObject({ kind: "unauthenticated" })
    expect(canisterRequests(replica)).toEqual([])
  })

  it("retries only a failure that proves the update never got in", () => {
    vi.stubGlobal("window", {})
    const client = clientAs(replicaWith({}), alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const { retry } = client.queryOptions(canister, "address", "x", {
      update: "idempotent",
    })
    const update = {
      method: "address",
      canisterId: SHAPES,
      mode: "update",
      accepted: false,
    } as const
    expect(
      retry(
        0,
        classifyError(
          ProtocolError.fromCode(new HttpErrorCode(429, "slow down", [])),
          update
        )
      )
    ).toBe(true)
    expect(
      retry(
        0,
        classifyError(
          ProtocolError.fromCode(new HttpErrorCode(503, "busy", [])),
          update
        )
      )
    ).toBe(false)
    expect(retry(0, classifyError(new TypeError("lost"), update))).toBe(false)
  })
})

describe("mutationOptions", () => {
  /** A ledger, a balance read observed on the client's QueryClient, and a transfer mutation. */
  async function wallet(client?: Client) {
    const balances = new Map<string, bigint>([[ALICE, 1_000_000n]])
    const replica = replicaWith({ [LEDGER]: ledgerCanister(balances) })
    const reader = clientAs(replica, alice)
    const writer = client ?? reader
    const ledger = reader.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const balance = new QueryObserver(
      reader.queryClient,
      reader.queryOptions(ledger, "icrc1_balance_of", {
        owner: ALICE,
        subaccount: null,
      })
    )
    const unsubscribe = balance.subscribe(() => {})
    await vi.waitFor(() =>
      expect(balance.getCurrentResult().data).toBe(1_000_000n)
    )
    return { replica, reader, writer, ledger, balance, unsubscribe }
  }

  const transfer = (amount: bigint): icrc1.TransferArg => ({
    to: { owner: BOB, subaccount: null },
    amount,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: null,
  })

  const reads = (replica: ReturnType<typeof replicaWith>) =>
    requestsFor(replica, "icrc1_balance_of").length

  it("returns retry: false and calls the method as the caller current when it runs", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const options = client.mutationOptions(canister, "address")
    expect(options.retry).toBe(false)
    expect(options.mutationKey).toEqual([
      "ic-reactor",
      client.network,
      SHAPES,
      "address",
    ])
    await expect(options.mutationFn("x")).rejects.toMatchObject({
      kind: "unauthenticated",
    })
    expect(canisterRequests(replica)).toEqual([])
    await auth.signIn()
    await expect(options.mutationFn("x")).resolves.toBe(`x:${client.caller()}`)
  })

  it("invalidates the canister's reads after a lost reply, and the re-read shows the debit", async () => {
    const { replica, writer, ledger, balance, unsubscribe } = await wallet()
    const mutation = new MutationObserver(
      writer.queryClient,
      writer.mutationOptions(ledger, "icrc1_transfer")
    )
    replica.dropNextReply()
    await expect(mutation.mutate(transfer(100n))).rejects.toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
    })
    // onSettled has invalidated and waited for the active read to refetch.
    expect(balance.getCurrentResult().data).toBe(1_000_000n - 100n - FEE)
    expect(reads(replica)).toBe(2)
    expect(requestsFor(replica, "icrc1_transfer")).toHaveLength(1)
    unsubscribe()
  })

  it.each([
    ["a success", 100n],
    ["a canister_err", 5_000_000n],
  ])("invalidates the canister's reads after %s", async (_label, amount) => {
    const { replica, writer, ledger, unsubscribe } = await wallet()
    const mutation = new MutationObserver(
      writer.queryClient,
      writer.mutationOptions(ledger, "icrc1_transfer")
    )
    await mutation.mutate(transfer(amount)).catch(() => undefined)
    expect(reads(replica)).toBe(2)
    unsubscribe()
  })

  it("does not invalidate after invalid_args, not_delivered or unauthenticated", async () => {
    const { replica, writer, reader, ledger, balance, unsubscribe } =
      await wallet()
    const key = balance.options.queryKey
    const mutation = new MutationObserver(
      writer.queryClient,
      writer.mutationOptions(ledger, "icrc1_transfer")
    )
    await expect(
      mutation.mutate({ ...transfer(1n), amount: -1n })
    ).rejects.toMatchObject({ kind: "invalid_args" })
    replica.refuseNext(400)
    await expect(mutation.mutate(transfer(1n))).rejects.toMatchObject({
      kind: "not_delivered",
    })
    const signedOut = createClientSignedOut(replica)
    const anonymousLedger = signedOut.canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
    })
    // The anonymous client's own QueryClient holds a read of the ledger too.
    const otherRead = signedOut.queryOptions(anonymousLedger, "icrc1_fee")
    await signedOut.queryClient.fetchQuery(otherRead)
    await expect(
      new MutationObserver(
        signedOut.queryClient,
        signedOut.mutationOptions(anonymousLedger, "icrc1_transfer")
      ).mutate(transfer(1n))
    ).rejects.toMatchObject({ kind: "unauthenticated" })
    expect(
      signedOut.queryClient.getQueryState(otherRead.queryKey)?.isInvalidated
    ).toBe(false)
    expect(reader.queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    expect(reads(replica)).toBe(1)
    unsubscribe()
  })

  it("does not invalidate after a write cancelled before it was sent", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const auth = createTestAuth({ seed: 1 })
    // The identity of the write's caller arrives only after they signed out.
    const asked = deferred()
    const gate = deferred()
    let slow = false
    const slowAuth = withIdentity(auth, async () => {
      const identity = await auth.getIdentity()
      if (slow) {
        asked.resolve()
        await gate.promise
      }
      return identity
    })
    const client = clientWithAuth(replica, slowAuth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const read = client.queryOptions(canister, "one", 1n)
    await client.queryClient.fetchQuery(read)

    slow = true
    const write = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "address")
    ).mutate("x")
    await asked.promise
    await auth.signOut()
    gate.resolve()
    await expect(write).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
      mayHaveExecuted: false,
    })
    expect(requestsFor(replica, "address")).toEqual([])
    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      false
    )
    expect(requestsFor(replica, "one")).toHaveLength(1)
  })

  it("invalidates only what invalidates lists, and nothing for []", async () => {
    const { replica, writer, ledger, unsubscribe } = await wallet()
    const fee = writer.queryOptions(ledger, "icrc1_fee")
    await writer.queryClient.fetchQuery(fee)
    const only = new MutationObserver(
      writer.queryClient,
      writer.mutationOptions(ledger, "icrc1_transfer", {
        invalidates: [[ledger, "icrc1_fee"]],
      })
    )
    await only.mutate(transfer(1n))
    expect(writer.queryClient.getQueryState(fee.queryKey)?.isInvalidated).toBe(
      true
    )
    expect(reads(replica)).toBe(1)
    const none = new MutationObserver(
      writer.queryClient,
      writer.mutationOptions(ledger, "icrc1_transfer", { invalidates: [] })
    )
    await none.mutate(transfer(1n))
    expect(reads(replica)).toBe(1)
    unsubscribe()
  })

  it("invalidates the reads of every caller, certified or not", async () => {
    const holds = new Map<string, Promise<void>>()
    const replica = replicaWith({ [SHAPES]: whoCanister(holds) })
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    const asA = client.queryOptions(canister, "who", undefined)
    const certifiedAsA = client.queryOptions(certified, "one", 1n)
    await client.queryClient.fetchQuery(asA)
    await client.queryClient.fetchQuery(certifiedAsA)
    auth.switchTo(2)
    await client
      .mutationOptions(canister, "note")
      .onSettled(undefined, null, "x")
    for (const { queryKey } of [asA, certifiedAsA]) {
      expect(client.queryClient.getQueryState(queryKey)?.isInvalidated).toBe(
        true
      )
    }
  })

  /**
   * A client on a local page, where the ic_env cookie is trusted, and a
   * `{ name: "backend" }` canister of it. The cookie is read afresh every
   * time, and `redeploy()` moves the name from SHAPES to REDEPLOYED, as a
   * local redeploy rewrites the cookie. `bump` at SHAPES waits for `hold`.
   */
  function redeployable(hold?: Promise<void>) {
    let deployed = SHAPES
    stubPage("http://localhost:5173")
    vi.stubGlobal("document", {
      get cookie() {
        return icEnvCookie({ "PUBLIC_CANISTER_ID:backend": deployed })
      },
    })
    const backendAt = (wait?: Promise<void>) =>
      serve<shapes.Actor>(shapes.actor, {
        one: ([n]) => n + 1n,
        bump: async ([n]) => {
          await wait
          return { tag: "ok", value: n + 1n }
        },
      })
    const replica = replicaWith({
      [SHAPES]: backendAt(hold),
      [REDEPLOYED]: backendAt(),
    })
    const client = clientAs(replica, alice)
    const backend = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
    })
    const redeploy = () => {
      deployed = REDEPLOYED
    }
    return { replica, client, backend, redeploy }
  }

  type BumpOptions = CanisterMutationOptions<bigint, bigint, string>

  it.each([
    ["as given", (options: BumpOptions) => options],
    [
      "under an onMutate of the app's that spreads the given one's result into its own",
      (options: BumpOptions) => ({
        ...options,
        onMutate: (vars: bigint, context?: unknown) => ({
          ...options.onMutate(vars, context),
          previous: "the app's own context",
        }),
      }),
    ],
  ])(
    "invalidates the canister a { name } write went to when the cookie moves the name before the write settles, with the options %s",
    async (_label, compose) => {
      const held = deferred()
      const { replica, client, backend, redeploy } = redeployable(held.promise)
      const before = client.queryOptions(backend, "one", 1n)
      expect(before.queryKey[3]).toBe(SHAPES)
      await client.queryClient.fetchQuery(before)

      const write = new MutationObserver(
        client.queryClient,
        compose(client.mutationOptions(backend, "bump"))
      ).mutate(1n)
      await vi.waitFor(() =>
        expect(requestsFor(replica, "bump")).toHaveLength(1)
      )
      // The update is in flight at the first canister; a redeploy gives the
      // name another one, and a read made now goes there.
      redeploy()
      const after = client.queryOptions(backend, "one", 1n)
      expect(after.queryKey[3]).toBe(REDEPLOYED)
      await client.queryClient.fetchQuery(after)
      held.resolve()
      await expect(write).resolves.toBe(2n)

      expect(requestsFor(replica, "bump")).toMatchObject([
        { canisterId: SHAPES },
      ])
      // The reads of the canister written to are stale; the other's are not.
      expect(
        client.queryClient.getQueryState(before.queryKey)?.isInvalidated
      ).toBe(true)
      expect(
        client.queryClient.getQueryState(after.queryKey)?.isInvalidated
      ).toBe(false)
    }
  )

  it("sends a { name } write that waited offline to the canister resolved when it started, whose reads it invalidates", async ({
    skip,
  }) => {
    if (!(await sharesRunContext())) {
      skip(
        "this TanStack Query does not pass mutationFn the run's context, so mutationFn resolves the canister when it starts"
      )
    }
    const { replica, client, backend, redeploy } = redeployable()
    const read = client.queryOptions(backend, "one", 1n)
    await client.queryClient.fetchQuery(read)

    // Offline, the write is paused after onMutate ran and before mutationFn
    // does; the name moves to another canister in between.
    onlineManager.setOnline(false)
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(backend, "bump")
    )
    const write = observer.mutate(1n)
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isPaused).toBe(true)
      expect(observer.getCurrentResult().context).toBeDefined()
    })
    redeploy()
    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()
    await expect(write).resolves.toBe(2n)

    expect(requestsFor(replica, "bump")).toMatchObject([{ canisterId: SHAPES }])
    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      true
    )
  })

  it("throws a TypeError for an unknown third argument or a canister of another client", () => {
    const client = clientAs(replicaWith({}), alice)
    const other = clientAs(replicaWith({}), alice)
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const foreign = other.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    expect(() =>
      client.mutationOptions(ledger, "icrc1_transfer", {
        retry: 3,
      } as unknown as { invalidates: [] })
    ).toThrow(/never retried/)
    expect(() =>
      client.mutationOptions(ledger, "icrc1_transfer", {
        invalidates: [foreign],
      })
    ).toThrow(/another client/)
    expect(() =>
      client.mutationOptions(ledger, "icrc1_transfer", {
        invalidates: [[ledger, "nope"]],
      })
    ).toThrow(/has no method "nope"/)
  })
})

/**
 * Whether the installed TanStack Query hands `onMutate` and `mutationFn` the
 * same function context for one run (5.89 and later), through which
 * `mutationFn` finds the canister `onMutate` resolved. The peer-floor check
 * runs these tests on an older release, which passes `mutationFn` nothing.
 */
async function sharesRunContext(): Promise<boolean> {
  let atMutate: unknown
  return new MutationObserver(new QueryClient(), {
    onMutate: (_vars: void, context?: unknown) => {
      atMutate = context
    },
    mutationFn: (_vars: void, context?: unknown) =>
      Promise.resolve(context !== undefined && context === atMutate),
  }).mutate()
}

/** A client in a page, on `replica`, with nobody signed in. */
function createClientSignedOut(replica: ReturnType<typeof replicaWith>) {
  return clientWithAuth(replica, createTestAuth({ seed: 3, signedIn: false }))
}
