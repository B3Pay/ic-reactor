/**
 * `client.queryOptions` and `client.mutationOptions`, driven by real TanStack
 * Query observers on the client's own `QueryClient`, against a fake replica.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { principal, type Principal } from "@meantjs/schema"
import { HttpErrorCode, ProtocolError } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  dehydrate,
  focusManager,
  hydrate,
  onlineManager,
  skipToken,
  type MutationObserverOptions,
  type QueryKey,
} from "@tanstack/query-core"
import { classifyError, type ReactorError } from "../src/errors.js"
import { createClient, type Client } from "../src/index.js"
import type { CanisterMutationOptions } from "../src/types.js"
import { createTestAuth } from "../src/testing/test-auth.js"
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
  type HandWritten,
} from "./canister-helpers.js"
import { withIdentity } from "./client-helpers.js"
import * as icrc1 from "./fixtures/icrc1.js"
import * as shapes from "./fixtures/shapes.js"
import * as skippable from "./fixtures/skippable.js"
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

/**
 * Another canister of the shapes interface, reached by its id, in the test
 * that writes to one canister and lists a `{ name }` in `invalidates`.
 */
const BY_ID = "r7inp-6aaaa-aaaaa-aaabq-cai"

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
    const optionsOfA = observer.options

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

    // A's reads left the cache when B became current, and A's slow answer
    // did not bring them back.
    expect(client.queryClient.getQueryData(keyOfA)).toBeUndefined()

    // A read of A's key that starts now runs A's query function, made for A:
    // it must not be sent as B, whose answer would land under A's key.
    const sent = requestsFor(replica, "who").length
    await client.queryClient
      .fetchQuery({ ...optionsOfA, staleTime: 0 })
      .catch((error: unknown) => error)
    expect(requestsFor(replica, "who")).toHaveLength(sent)
    expect(client.queryClient.getQueryData(keyOfA)).toBeUndefined()

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

  it("gives a query function for every value in place of the variables, and skipToken only for skipToken", async () => {
    // The types drop SkipToken from the options' queryFn for variables that
    // cannot be skipToken, so the builder must run each such read: an empty
    // record, a record of opts alone, an opt and null, each null where it can
    // be, and no arguments.
    const replica = replicaWith({
      [SHAPES]: serve<skippable.Actor>(skippable.actor, {
        empty_record: () => 1n,
        only_opts: ([{ limit }]) => limit ?? 2n,
        maybe_nat: ([n]) => n ?? 3n,
        nothing_at_all: () => 4n,
        no_args: () => 5n,
        anything: () => 6n,
      }),
    })
    const client = clientAs(replica, alice)
    const canister = client.canister<skippable.Actor>(skippable.actor, {
      id: SHAPES,
    })
    const reads = [
      [client.queryOptions(canister, "empty_record", {}), 1n],
      [
        client.queryOptions(canister, "only_opts", {
          limit: null,
          prefix: null,
        }),
        2n,
      ],
      [client.queryOptions(canister, "maybe_nat", null), 3n],
      [client.queryOptions(canister, "nothing_at_all", null), 4n],
      [client.queryOptions(canister, "no_args"), 5n],
      [client.queryOptions(canister, "no_args", undefined), 5n],
      [client.queryOptions(canister, "anything", null), 6n],
    ] as const
    for (const [options, expected] of reads) {
      expect(typeof options.queryFn).toBe("function")
      await expect(client.queryClient.fetchQuery(options)).resolves.toBe(
        expected
      )
    }
    for (const method of [
      "empty_record",
      "only_opts",
      "maybe_nat",
      "nothing_at_all",
      "no_args",
      "anything",
    ] as const) {
      const options = client.queryOptions(canister, method, skipToken)
      expect(options.queryFn).toBe(skipToken)
    }
  })

  it("refuses another copy's skipToken, which it cannot tell from an argument, and still skips its own and passes a symbol to reserved", async () => {
    const replica = replicaWith({
      [SHAPES]: serve<skippable.Actor>(skippable.actor, {
        anything: () => 6n,
      }),
    })
    const client = clientAs(replica, alice)
    const canister = client.canister<skippable.Actor>(skippable.actor, {
      id: SHAPES,
    })
    // What a second copy of @tanstack/query-core exports: its own Symbol().
    const foreign = Symbol() as never
    const twoCopies =
      /a symbol, not core's skipToken: two copies of @tanstack\/query-core are installed.*`npm ls @tanstack\/query-core` must show one copy/
    expect(() => client.queryOptions(canister, "maybe_nat", foreign)).toThrow(
      twoCopies
    )
    expect(() =>
      client.queryOptions(canister, "empty_record", foreign)
    ).toThrow(TypeError)
    expect(() => client.queryKey(canister, "maybe_nat", foreign)).toThrow(
      twoCopies
    )
    expect(() => client.queryKey(canister, "no_args", foreign)).toThrow(
      twoCopies
    )
    // Its own skipToken still skips.
    expect(client.queryOptions(canister, "maybe_nat", skipToken).queryFn).toBe(
      skipToken
    )
    const skipped = client.queryKey(canister, "maybe_nat", skipToken as never)
    expect(skipped[skipped.length - 1]).toBe("$skip")
    // reserved takes every value, a symbol included: it is encoded and read.
    const options = client.queryOptions(canister, "anything", foreign)
    expect(typeof options.queryFn).toBe("function")
    await expect(client.queryClient.fetchQuery(options)).resolves.toBe(6n)
    expect(() => client.queryKey(canister, "anything", foreign)).not.toThrow()
  })

  it("throws a TypeError for an update or oneway method, a certified composite query, or an unknown fourth argument", () => {
    const client = clientAs(replicaWith({}), alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    // The generated Actor's update and oneway methods do not compile here
    // (tests/traps.test-d.ts); typed by hand, without modes, they do, and the
    // check at run time refuses them.
    const handWritten = client.canister<HandWritten<shapes.Actor>>(
      shapes.actor,
      { id: SHAPES }
    )
    expect(() => client.queryOptions(handWritten, "bump", 1n)).toThrow(
      /bump is an update method/
    )
    expect(() => client.queryOptions(handWritten, "note", "x")).toThrow(
      TypeError
    )
    expect(() =>
      client.queryOptions(handWritten, "fire", "x", { update: "idempotent" })
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

  it("returns retry: false and, called with no onMutate run, calls the method as the caller current then", async () => {
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
    const auth = createTestAuth({ seed: 1, signedIn: false })
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
    // A read the write would invalidate, made before anyone signed in: the
    // sign-out below keeps the anonymous reads.
    const read = client.queryOptions(canister, "one", 1n)
    await client.queryClient.fetchQuery(read)
    await client.signIn()

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
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const certified = client.canister<shapes.Actor>(shapes.actor, {
      id: SHAPES,
      certified: true,
    })
    // Reads by nobody signed in, which a sign-in keeps, and by A.
    const anonymous = client.queryOptions(canister, "who", undefined)
    const certifiedAnonymous = client.queryOptions(certified, "one", 1n)
    await client.queryClient.fetchQuery(anonymous)
    await client.queryClient.fetchQuery(certifiedAnonymous)
    await client.signIn()
    const asA = client.queryOptions(canister, "who", undefined)
    const certifiedAsA = client.queryOptions(certified, "one", 1n)
    await client.queryClient.fetchQuery(asA)
    await client.queryClient.fetchQuery(certifiedAsA)
    // And one of B's, as a persister restores it into the cache.
    const b = createTestAuth({ seed: 2 }).getPrincipal()!.toText()
    const asB = [...asA.queryKey.slice(0, 2), b, ...asA.queryKey.slice(3)]
    client.queryClient.setQueryData(asB, b)
    await client
      .mutationOptions(canister, "note")
      .onSettled(undefined, null, "x")
    for (const queryKey of [
      anonymous.queryKey,
      certifiedAnonymous.queryKey,
      asA.queryKey,
      certifiedAsA.queryKey,
      asB,
    ]) {
      expect(client.queryClient.getQueryState(queryKey)?.isInvalidated).toBe(
        true
      )
    }
  })

  // An app that nests its own QueryClientProvider inside the client's keeps
  // its reads, and runs its writes, on its own QueryClient (#903).
  it("invalidates the reads on the QueryClient the mutation ran on, and on the client's own", async () => {
    const { replica, reader, ledger, balance, unsubscribe } = await wallet()
    const app = new QueryClient()
    const account = { owner: ALICE, subaccount: null }
    const appBalance = new QueryObserver(
      app,
      reader.queryOptions(ledger, "icrc1_balance_of", account)
    )
    const unsubscribeApp = appBalance.subscribe(() => {})
    await vi.waitFor(() =>
      expect(appBalance.getCurrentResult().data).toBe(1_000_000n)
    )
    const mutation = new MutationObserver(
      app,
      reader.mutationOptions(ledger, "icrc1_transfer")
    )

    await mutation.mutate(transfer(100n))

    // onSettled waited for both active reads to refetch: TanStack Query
    // tells it which QueryClient the run was on.
    expect(balance.getCurrentResult().data).toBe(1_000_000n - 100n - FEE)
    expect(appBalance.getCurrentResult().data).toBe(1_000_000n - 100n - FEE)
    expect(reads(replica)).toBe(4)
    unsubscribeApp()
    unsubscribe()
  })

  /**
   * A client on a local page, where the ic_env cookie is trusted, and a
   * `{ name: "backend" }` canister of it. The cookie is read afresh every
   * time, and `redeploy()` moves the name from SHAPES to REDEPLOYED, as a
   * local redeploy rewrites the cookie. `bump` waits for `hold` at SHAPES
   * and at BY_ID, a shapes canister the name never points to.
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
      [BY_ID]: backendAt(hold),
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

  /** What an app hands `useMutation` or a `MutationObserver` for `bump`, with an onMutate of its own or not. */
  type AppBumpOptions = MutationObserverOptions<
    bigint,
    ReactorError<string>,
    bigint,
    unknown
  >

  /**
   * Writes `bump` to the `{ name }` canister with the options `compose`
   * returns, and moves the name to another canister while the update is in
   * flight. The write must reach the first canister, whose cached reads it
   * invalidates, and leave the reads of the new one alone.
   */
  async function writeAcrossRedeploy(
    compose: (options: BumpOptions) => AppBumpOptions
  ) {
    const held = deferred()
    const { replica, client, backend, redeploy } = redeployable(held.promise)
    const before = client.queryOptions(backend, "one", 1n)
    expect(before.queryKey[3]).toBe(SHAPES)
    await client.queryClient.fetchQuery(before)

    const write = new MutationObserver(
      client.queryClient,
      compose(client.mutationOptions(backend, "bump"))
    ).mutate(1n)
    await vi.waitFor(() => expect(requestsFor(replica, "bump")).toHaveLength(1))
    // The update is in flight at the first canister; a redeploy gives the
    // name another one, and a read made now goes there.
    redeploy()
    const after = client.queryOptions(backend, "one", 1n)
    expect(after.queryKey[3]).toBe(REDEPLOYED)
    await client.queryClient.fetchQuery(after)
    held.resolve()
    await expect(write).resolves.toBe(2n)

    expect(requestsFor(replica, "bump")).toMatchObject([{ canisterId: SHAPES }])
    // The reads of the canister written to are stale; the other's are not.
    expect(
      client.queryClient.getQueryState(before.queryKey)?.isInvalidated
    ).toBe(true)
    expect(
      client.queryClient.getQueryState(after.queryKey)?.isInvalidated
    ).toBe(false)
  }

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
    (_label, compose) => writeAcrossRedeploy(compose)
  )

  it("keeps a { name } write and its invalidation on one canister when an onMutate of the app's replaces the given one", async () => {
    // TanStack's optimistic-update recipe, spread over the options: the
    // app's onMutate returns its own context and never calls the given one.
    await writeAcrossRedeploy((options) => ({
      ...options,
      onMutate: () => ({ previous: "the app's own context" }),
    }))
  })

  it("invalidates the canister a { name } in invalidates named when the write started, though the cookie moves the name before the write settles", async () => {
    const held = deferred()
    const { replica, client, backend, redeploy } = redeployable(held.promise)
    const writer = client.canister<shapes.Actor>(shapes.actor, { id: BY_ID })
    const before = client.queryOptions(backend, "one", 1n)
    expect(before.queryKey[3]).toBe(SHAPES)
    await client.queryClient.fetchQuery(before)

    // The write goes to a canister reached by its id, and names the reads it
    // changes through the { name }, the only target that a redeploy moves.
    const write = new MutationObserver(
      client.queryClient,
      client.mutationOptions(writer, "bump", { invalidates: [backend] })
    ).mutate(1n)
    await vi.waitFor(() => expect(requestsFor(replica, "bump")).toHaveLength(1))
    redeploy()
    const after = client.queryOptions(backend, "one", 1n)
    expect(after.queryKey[3]).toBe(REDEPLOYED)
    await client.queryClient.fetchQuery(after)
    held.resolve()
    await expect(write).resolves.toBe(2n)

    expect(requestsFor(replica, "bump")).toMatchObject([{ canisterId: BY_ID }])
    // The listed name pointed at SHAPES when the write started: its reads
    // there are stale, and the reads of where it points now are not.
    expect(
      client.queryClient.getQueryState(before.queryKey)?.isInvalidated
    ).toBe(true)
    expect(
      client.queryClient.getQueryState(after.queryKey)?.isInvalidated
    ).toBe(false)
  })

  it("sends a { name } write that waited offline to the canister resolved when it started, whose reads it invalidates", async () => {
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

  it("sends such a write to the canister resolved when it started, when a later render handed the waiting run new options", async () => {
    const { replica, client, backend, redeploy } = redeployable()
    const read = client.queryOptions(backend, "one", 1n)
    await client.queryClient.fetchQuery(read)

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
    // A component that renders again builds its options again, and TanStack
    // hands them to the waiting run: the mutationFn and onSettled it calls
    // are theirs, and the onMutate that resolved the run was not.
    const later = client.mutationOptions(backend, "bump")
    observer.setOptions(later)
    redeploy()
    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()
    await expect(write).resolves.toBe(2n)

    expect(
      client.queryClient.getMutationCache().getAll()[0]?.options.mutationFn
    ).toBe(later.mutationFn)
    expect(requestsFor(replica, "bump")).toMatchObject([{ canisterId: SHAPES }])
    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      true
    )
  })

  it("resolves the canister again when the write is sent, and refreshes that canister's reads, when the later render built the waiting run's options from another canister object of the same canister", async () => {
    const { replica, client, backend, redeploy } = redeployable()
    const read = client.queryOptions(backend, "one", 1n)
    await client.queryClient.fetchQuery(read)

    onlineManager.setOnline(false)
    const first = client.mutationOptions(backend, "bump")
    const observer = new MutationObserver(client.queryClient, first)
    const write = observer.mutate(1n)
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isPaused).toBe(true)
      expect(observer.getCurrentResult().context).toBeDefined()
    })
    // client.canister() returns one canister object for the same arguments,
    // and another for another timeoutMs. What a run resolved is kept by the
    // method of the canister object, so options built from this one find
    // nothing for the waiting run, though their mutationKey is the same and
    // TanStack hands them to it.
    const patient = client.canister<shapes.Actor>(shapes.actor, {
      name: "backend",
      timeoutMs: 30_000,
    })
    expect(patient).not.toBe(backend)
    const later = client.mutationOptions(patient, "bump")
    expect(later.mutationKey).toEqual(first.mutationKey)
    observer.setOptions(later)
    redeploy()
    onlineManager.setOnline(true)
    const moved = client.queryOptions(backend, "one", 1n)
    await client.queryClient.fetchQuery(moved)
    void client.queryClient.resumePausedMutations()
    await expect(write).resolves.toBe(2n)

    // The write and its invalidation stay on one canister: the one the name
    // points to when the write is sent.
    expect(requestsFor(replica, "bump")).toMatchObject([
      { canisterId: REDEPLOYED },
    ])
    expect(
      client.queryClient.getQueryState(moved.queryKey)?.isInvalidated
    ).toBe(true)
    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      false
    )
  })

  /**
   * A shapes canister whose `address` answers with its sender, held back
   * while `hold` is set, and a client on it signed in as seed 1.
   */
  function addressBook() {
    let hold: Promise<void> | undefined
    const calls = { before: undefined as (() => void) | undefined }
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        address: async ([seed], { caller }) => {
          await hold
          calls.before?.()
          return `${seed}:${caller}`
        },
      }),
    })
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const holdNext = () => {
      const held = deferred()
      hold = held.promise
      return held
    }
    return { replica, auth, client, canister, holdNext, calls }
  }

  const callerChanged = {
    kind: "cancelled",
    code: "caller_changed",
    mayHaveExecuted: false,
  }

  it("refuses a write paused offline when the account is switched before it is sent, and sends nothing", async () => {
    const { replica, auth, client, canister } = addressBook()
    onlineManager.setOnline(false)
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "address")
    )
    const write = observer.mutate("x")
    write.catch(() => undefined)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isPaused).toBe(true)
    )
    auth.switchTo(2)
    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()
    await expect(write).rejects.toMatchObject(callerChanged)
    expect(requestsFor(replica, "address")).toEqual([])
  })

  it("sends a write paused offline as its caller when nobody switched meanwhile", async () => {
    const { client, canister } = addressBook()
    const clickedAs = client.caller()
    onlineManager.setOnline(false)
    const observer = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "address")
    )
    const write = observer.mutate("x")
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isPaused).toBe(true)
    )
    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()
    await expect(write).resolves.toBe(`x:${clickedAs}`)
  })

  it("refuses a write queued behind its scope when the account is switched before its turn, and sends nothing", async () => {
    const { replica, auth, client, canister, holdNext } = addressBook()
    const clickedAs = client.caller()
    const options = {
      ...client.mutationOptions(canister, "address"),
      scope: { id: "address" },
    }
    const held = holdNext()
    const first = new MutationObserver(client.queryClient, options).mutate("a")
    await vi.waitFor(() =>
      expect(requestsFor(replica, "address")).toHaveLength(1)
    )
    const queued = new MutationObserver(client.queryClient, options)
    const second = queued.mutate("b")
    second.catch(() => undefined)
    await vi.waitFor(() =>
      expect(queued.getCurrentResult().isPaused).toBe(true)
    )
    auth.switchTo(2)
    held.resolve()
    await expect(first).resolves.toBe(`a:${clickedAs}`)
    await expect(second).rejects.toMatchObject(callerChanged)
    expect(requestsFor(replica, "address")).toHaveLength(1)
  })

  /** Pauses `observer`'s write offline, runs `between`, and comes back online. */
  async function pausedOffline(
    client: Client,
    observer: MutationObserver<unknown, unknown, string, unknown>,
    between: () => void
  ) {
    onlineManager.setOnline(false)
    const write = observer.mutate("x")
    write.catch(() => undefined)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isPaused).toBe(true)
    )
    between()
    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()
    return write
  }

  /** TanStack's optimistic-update recipe: an onMutate of the app's that returns its own context and never calls the given one. */
  const replacingOnMutate = (client: Client, canister: unknown) =>
    new MutationObserver<unknown, unknown, string, unknown>(
      client.queryClient,
      {
        ...client.mutationOptions(
          canister as Parameters<Client["mutationOptions"]>[0],
          "address" as never
        ),
        onMutate: () => ({ previous: "the app's own context" }),
      } as never
    )

  it("refuses a write paused offline across an account switch when an onMutate of the app's replaces the given one", async () => {
    const { replica, auth, client, canister } = addressBook()
    const write = pausedOffline(
      client,
      replacingOnMutate(client, canister),
      () => auth.switchTo(2)
    )
    await expect(write).rejects.toMatchObject(callerChanged)
    expect(requestsFor(replica, "address")).toEqual([])
  })

  it("sends a write paused offline as its caller when an onMutate of the app's replaces the given one", async () => {
    const { client, canister } = addressBook()
    const clickedAs = client.caller()
    const write = pausedOffline(
      client,
      replacingOnMutate(client, canister),
      () => undefined
    )
    await expect(write).resolves.toBe(`x:${clickedAs}`)
  })

  /** A mutationFn of the app's own around the given one, which it calls with both arguments, as the guide says. */
  const wrappingMutationFn = (client: Client, canister: unknown) => {
    const options = client.mutationOptions(
      canister as Parameters<Client["mutationOptions"]>[0],
      "address" as never
    )
    return new MutationObserver<unknown, unknown, string, unknown>(
      client.queryClient,
      {
        ...options,
        mutationFn: async (seed: string, context?: unknown) => {
          await Promise.resolve()
          return options.mutationFn(seed as never, context)
        },
      } as never
    )
  }

  it("refuses a write paused offline across an account switch when a mutationFn of the app's calls the given one with both arguments", async () => {
    const { replica, auth, client, canister } = addressBook()
    const write = pausedOffline(
      client,
      wrappingMutationFn(client, canister),
      () => auth.switchTo(2)
    )
    await expect(write).rejects.toMatchObject(callerChanged)
    expect(requestsFor(replica, "address")).toEqual([])
  })

  it("sends a write paused offline as its caller when a mutationFn of the app's calls the given one with both arguments", async () => {
    const { client, canister } = addressBook()
    const clickedAs = client.caller()
    const write = pausedOffline(
      client,
      wrappingMutationFn(client, canister),
      () => undefined
    )
    await expect(write).resolves.toBe(`x:${clickedAs}`)
  })

  it("refuses a write whose mutationFn and onMutate are both the app's own, though the mutationFn calls the given one with both arguments: nothing read who started it", async () => {
    const { replica, client, canister } = addressBook()
    const options = client.mutationOptions(canister, "address")
    const observer = new MutationObserver(client.queryClient, {
      ...options,
      onMutate: () => ({ previous: "the app's own context" }),
      mutationFn: (seed: string, context?: unknown) =>
        options.mutationFn(seed, context),
    })

    // The client's MutationCache reads the caller of a run of the client's
    // own mutationFn, and the given onMutate that of any run it is called
    // for. Here neither ran.
    await expect(observer.mutate("x")).rejects.toMatchObject(callerChanged)
    expect(requestsFor(replica, "address")).toEqual([])
  })

  /** Two ledgers with one interface, and a client that holds a balance on each. */
  function twoLedgers() {
    const first = new Map<string, bigint>([[ALICE, 1_000_000n]])
    const second = new Map<string, bigint>([[ALICE, 1_000_000n]])
    const replica = replicaWith({
      [LEDGER]: ledgerCanister(first),
      [ARCHIVE]: ledgerCanister(second),
    })
    const client = clientAs(replica, alice)
    const sentTo = () =>
      requestsFor(replica, "icrc1_transfer").map(({ canisterId }) => canisterId)
    return {
      replica,
      client,
      balances: { first, second },
      sentTo,
      ledger: client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER }),
      other: client.canister<icrc1.Actor>(icrc1.actor, { id: ARCHIVE }),
    }
  }

  it("writes to its own canister when a mutationFn of the app's hands it the context of a run that the options of another canister started", async () => {
    const { client, balances, sentTo, ledger, other } = twoLedgers()
    const options = client.mutationOptions(ledger, "icrc1_transfer")
    const otherOptions = client.mutationOptions(other, "icrc1_transfer")
    const observer = new MutationObserver(client.queryClient, {
      ...options,
      // Two transfers in one run, each through the client's function for its
      // ledger, with the context of the run, which `options` started.
      mutationFn: async (arg: icrc1.TransferArg, context?: unknown) => {
        await otherOptions.mutationFn({ ...arg, amount: 5n }, context)
        return options.mutationFn(arg, context)
      },
    })

    await observer.mutate(transfer(100n))

    expect(sentTo()).toEqual([ARCHIVE, LEDGER])
    expect(balances.second.get(BOB)).toBe(5n)
    expect(balances.first.get(BOB)).toBe(100n)
  })

  it("refreshes the reads of each canister such a run wrote to, when an onSettled of the app's calls the given one of both options", async () => {
    const { client, ledger, other } = twoLedgers()
    const account = { owner: ALICE, subaccount: null }
    const read = client.queryOptions(ledger, "icrc1_balance_of", account)
    const otherRead = client.queryOptions(other, "icrc1_balance_of", account)
    await client.queryClient.fetchQuery(read)
    await client.queryClient.fetchQuery(otherRead)
    const options = client.mutationOptions(ledger, "icrc1_transfer")
    const otherOptions = client.mutationOptions(other, "icrc1_transfer")
    const observer = new MutationObserver(client.queryClient, {
      ...options,
      mutationFn: async (arg: icrc1.TransferArg, context?: unknown) => {
        await otherOptions.mutationFn({ ...arg, amount: 5n }, context)
        return options.mutationFn(arg, context)
      },
      // Each given onSettled finds what its own canister kept for the run.
      onSettled: async (
        data: bigint | undefined,
        error: ReactorError<icrc1.TransferError> | null,
        variables: icrc1.TransferArg,
        onMutateResult: unknown,
        context?: unknown
      ) => {
        const settled = [
          data,
          error,
          variables,
          onMutateResult,
          context,
        ] as const
        await otherOptions.onSettled(...settled)
        await options.onSettled(...settled)
      },
    })

    await observer.mutate(transfer(100n))

    expect(client.queryClient.getQueryState(read.queryKey)?.isInvalidated).toBe(
      true
    )
    expect(
      client.queryClient.getQueryState(otherRead.queryKey)?.isInvalidated
    ).toBe(true)
  })

  it("refreshes the reads each options names, when such a run wrote through two methods of one canister and an onSettled of the app's calls the given one of both options", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const who = client.queryOptions(canister, "who", undefined)
    const one = client.queryOptions(canister, "one", 1n)
    await client.queryClient.fetchQuery(who)
    await client.queryClient.fetchQuery(one)
    const invalidated = () =>
      [who, one].map(
        ({ queryKey }) =>
          client.queryClient.getQueryState(queryKey)?.isInvalidated
      )
    const options = client.mutationOptions(canister, "address", {
      invalidates: [[canister, "who"]],
    })
    const noteOptions = client.mutationOptions(canister, "note", {
      invalidates: [[canister, "one"]],
    })
    let afterNote: unknown
    const observer = new MutationObserver(client.queryClient, {
      ...options,
      // Two writes to one canister in one run, each through the client's
      // function for its method, with the context of the run.
      mutationFn: async (seed: string, context?: unknown) => {
        await noteOptions.mutationFn(seed, context)
        return options.mutationFn(seed, context)
      },
      onSettled: async (
        data: string | undefined,
        error: ReactorError | null,
        variables: string,
        onMutateResult: unknown,
        context?: unknown
      ) => {
        await noteOptions.onSettled(
          undefined,
          error,
          variables,
          onMutateResult,
          context
        )
        afterNote = invalidated()
        await options.onSettled(data, error, variables, onMutateResult, context)
      },
    })

    await observer.mutate("x")

    expect(afterNote).toEqual([false, true])
    expect(invalidated()).toEqual([true, true])
  })

  it("shares what such a run resolved between two options for one method of one canister object, the reads it refreshes included", async () => {
    const replica = replicaWith({ [SHAPES]: whoCanister(new Map()) })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const who = client.queryOptions(canister, "who", undefined)
    const one = client.queryOptions(canister, "one", 1n)
    await client.queryClient.fetchQuery(who)
    await client.queryClient.fetchQuery(one)
    const invalidated = () =>
      [who, one].map(
        ({ queryKey }) =>
          client.queryClient.getQueryState(queryKey)?.isInvalidated
      )
    const options = client.mutationOptions(canister, "address", {
      invalidates: [[canister, "who"]],
    })
    // The same method of the same canister object, with other reads to
    // refresh: a limit, which the JSDoc of mutationFn states (give both the
    // same invalidates).
    const again = client.mutationOptions(canister, "address", {
      invalidates: [[canister, "one"]],
    })
    let afterAgain: unknown
    const observer = new MutationObserver(client.queryClient, {
      ...options,
      mutationFn: async (seed: string, context?: unknown) => {
        await again.mutationFn(seed, context)
        return options.mutationFn(seed, context)
      },
      onSettled: async (
        data: string | undefined,
        error: ReactorError | null,
        variables: string,
        onMutateResult: unknown,
        context?: unknown
      ) => {
        await again.onSettled(
          undefined,
          error,
          variables,
          onMutateResult,
          context
        )
        afterAgain = invalidated()
        await options.onSettled(data, error, variables, onMutateResult, context)
      },
    })

    await observer.mutate("x")

    // Both refresh the reads of the options that started the run.
    expect(afterAgain).toEqual([true, false])
    expect(invalidated()).toEqual([true, false])
  })

  it("refuses the retry of a write when the account is switched after the first attempt failed, and sends it no more", async () => {
    const { replica, auth, client, canister } = addressBook()
    // The first attempt is turned away before the canister sees it, so
    // nothing ran and a retry may go out, but only as its caller.
    replica.refuseNext(400)
    const write = new MutationObserver(client.queryClient, {
      ...client.mutationOptions(canister, "address"),
      // An app's own retry, against the advice.
      retry: (failureCount: number) => {
        auth.switchTo(2)
        return failureCount < 1
      },
      retryDelay: 0,
    }).mutate("x")
    await expect(write).rejects.toMatchObject(callerChanged)
    // Only the request that was turned away.
    expect(requestsFor(replica, "address")).toMatchObject([
      { refused: expect.stringContaining("HTTP 400") },
    ])
  })

  it("refuses the retry of a write that may have run as a retried write, not as its caller's, when the account is switched after the first attempt", async () => {
    const { replica, auth, client, canister, calls } = addressBook()
    calls.before = () => {
      calls.before = undefined
      auth.switchTo(2)
      throw new Error("trapped")
    }
    const write = new MutationObserver(client.queryClient, {
      ...client.mutationOptions(canister, "address"),
      // An app's own retry, against the advice.
      retry: 1,
      retryDelay: 0,
    }).mutate("x")
    // The trap may have followed a commit, so the run must not end saying
    // that nothing ran, which `caller_changed` would.
    await expect(write).rejects.toMatchObject({
      kind: "outcome_unknown",
      code: "retried_write",
      mayHaveExecuted: true,
      cause: { kind: "rejected", rejectCode: 5, mayHaveExecuted: true },
    })
    expect(requestsFor(replica, "address")).toHaveLength(1)
  })

  it("refuses a write TanStack restored from a persister, whose caller is not known, and sends nothing", async () => {
    const { replica, client, canister } = addressBook()
    const options = client.mutationOptions(canister, "address")
    const observer = new MutationObserver(client.queryClient, options)
    onlineManager.setOnline(false)
    observer.mutate("x").catch(() => undefined)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isPaused).toBe(true)
    )
    // What a persister writes and, after a reload, reads back.
    const persisted = dehydrate(client.queryClient)
    client.queryClient.getMutationCache().clear()
    // A restored mutation takes its mutationFn from the defaults.
    client.queryClient.setMutationDefaults(options.mutationKey, {
      mutationFn: options.mutationFn as never,
    })
    hydrate(client.queryClient, persisted)
    onlineManager.setOnline(true)
    await client.queryClient.resumePausedMutations()
    const [restored] = client.queryClient.getMutationCache().getAll()
    await vi.waitFor(() =>
      expect(restored?.state.error).toMatchObject(callerChanged)
    )
    expect(requestsFor(replica, "address")).toEqual([])
  })

  it("takes a call with no run context for one by hand, made as the caller current then, whatever onMutate was called with none before it", async () => {
    const { auth, client, canister } = addressBook()
    const options = client.mutationOptions(canister, "address")
    // Both called with the argument alone, as a function of the app's own
    // that passes on no context calls them: the client knows no run by
    // them, so nothing ties the write to who called onMutate.
    options.onMutate("x")
    auth.switchTo(2)
    const second = client.caller()
    await expect(options.mutationFn("x")).resolves.toBe(`x:${second}`)
    // Called on another object, such as the options an app spread them
    // into, it is the same call.
    await expect(options.mutationFn.call({ ...options }, "y")).resolves.toBe(
      `y:${second}`
    )
  })

  it("tells the pending runs of one observer apart by their contexts: each goes out as the caller who started it, or not at all", async () => {
    const { replica, auth, client, canister } = addressBook()
    const options = client.mutationOptions(canister, "address")
    const observer = new MutationObserver(client.queryClient, options)
    // The first account's write, then the second's, both held back offline.
    // TanStack builds both runs with the observer's one options object.
    onlineManager.setOnline(false)
    const first = observer.mutate("a")
    first.catch(() => undefined)
    auth.switchTo(2)
    const second = client.caller()
    const later = observer.mutate("b")
    const runs = client.queryClient.getMutationCache().getAll()
    await vi.waitFor(() =>
      expect(runs.every((run) => run.state.isPaused)).toBe(true)
    )
    expect(runs).toHaveLength(2)
    expect(runs[0]?.options).toBe(runs[1]?.options)
    onlineManager.setOnline(true)
    void client.queryClient.resumePausedMutations()

    await expect(first).rejects.toMatchObject(callerChanged)
    await expect(later).resolves.toBe(`b:${second}`)
    expect(requestsFor(replica, "address")).toHaveLength(1)
  })

  it("fails a run of its options before anything is sent when TanStack Query hands the client's MutationCache no run context (a release older than 5.89)", async () => {
    const { replica, client, canister } = addressBook()
    const cache = client.queryClient.getMutationCache()
    const started = cache.config.onMutate as unknown as (
      variables: unknown,
      mutation: unknown
    ) => unknown
    const run = cache.build(
      client.queryClient,
      client.mutationOptions(canister, "address")
    )
    // As a TanStack Query before 5.89 calls it when mutate() starts a run:
    // with the argument and the mutation, and no context. What it throws
    // fails the run before mutationFn is called.
    expect(() => started("x", run)).toThrow(TypeError)
    expect(() => started("x", run)).toThrow(/@tanstack\/query-core 5\.89/)
    expect(requestsFor(replica, "address")).toEqual([])
    // A mutation of the app's own on the same QueryClient is left alone.
    const unrelated = cache.build(client.queryClient, {
      mutationFn: (n: number) => Promise.resolve(n + 1),
    })
    expect(() => started(1, unrelated)).not.toThrow()
  })

  it("reads no caller, and builds no auth, for a mutation of the app's on the client's QueryClient", async () => {
    let built = 0
    // In a page, where the client builds its auth on first use.
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com", protocol: "https:" },
    })
    const client = createClient({
      network: "local",
      auth: () => {
        built += 1
        throw new Error("the auth could not be built")
      },
    })
    const unrelated = new MutationObserver(client.queryClient, {
      mutationFn: (n: number) => Promise.resolve(n + 1),
    })
    await expect(unrelated.mutate(1)).resolves.toBe(2)
    expect(built).toBe(0)
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

describe("timeoutMs", () => {
  // #875: a bound on how long one call waits, for reads and mutations.
  const within = <T>(call: Promise<T>) =>
    Promise.race([call, sleep(2_000).then(() => "still waiting")])

  /** A ledger whose transfers and balances never answer. */
  const held = () => {
    const fake = ledgerCanister(new Map([[ALICE as string, 1_000_000n]]))
    const replica = replicaWith({
      [LEDGER]: {
        query: (method, arg, context) =>
          method === "icrc1_balance_of"
            ? new Promise(() => {})
            : fake.query!(method, arg, context),
        update: () => new Promise(() => {}),
      },
    })
    return { replica, client: clientAs(replica, alice) }
  }
  const transfer = (amount: bigint): icrc1.TransferArg => ({
    to: { owner: BOB, subaccount: null },
    amount,
    fee: null,
    memo: null,
    from_subaccount: null,
    created_at_time: 1_700_000_000_000_000_000n,
  })

  it.each([
    ["its own timeoutMs", {}, { timeoutMs: 50 }],
    ["the canister's timeoutMs", { timeoutMs: 50 }, {}],
    [
      "its own timeoutMs over the canister's",
      { timeoutMs: 600_000 },
      { timeoutMs: 50 },
    ],
  ] as const)(
    "rejects a mutation whose request went out outcome_unknown with %s, and offers it to resendOf",
    async (_, target, options) => {
      const { replica, client } = held()
      const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
        id: LEDGER,
        ...target,
      })
      const mutation = new MutationObserver(
        client.queryClient,
        client.mutationOptions(ledger, "icrc1_transfer", options)
      )
      const error = await within(mutation.mutate(transfer(1n))).catch(
        (failure: unknown) => failure
      )
      expect(error).toMatchObject({
        kind: "outcome_unknown",
        mayHaveExecuted: true,
        code: "timeout",
      })
      expect(mutation.getCurrentResult().error).toBe(error)
      expect(
        client.resendOf(error, ledger, "icrc1_transfer", {
          dedupedBy: (arg) => arg.created_at_time,
        })
      ).toBeDefined()
      expect(requestsFor(replica, "icrc1_transfer")).toHaveLength(1)
    }
  )

  it("keeps a mutation re-sending an offered write outcome_unknown when it times out before it goes out", async () => {
    const { replica, client } = held()
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
    const mutation = new MutationObserver(
      client.queryClient,
      client.mutationOptions(ledger, "icrc1_transfer", { timeoutMs: 50 })
    )
    const first = await within(mutation.mutate(transfer(1n))).catch(
      (failure: unknown) => failure
    )
    const dedupedBy = (arg: icrc1.TransferArg) => arg.created_at_time
    const offer = client.resendOf(first, ledger, "icrc1_transfer", {
      dedupedBy,
    })
    expect(offer).toBeDefined()
    replica.refuseNext(429)
    const again = await within(mutation.mutate(offer!.arg)).catch(
      (failure: unknown) => failure
    )
    expect(again).toMatchObject({
      kind: "outcome_unknown",
      mayHaveExecuted: true,
      code: "timeout",
    })
    expect(
      client.resendOf(again, ledger, "icrc1_transfer", { dedupedBy })
    ).toBeDefined()
    expect(requestsFor(replica, "icrc1_transfer")).toHaveLength(2)
  })

  it("rejects a read of a canister with timeoutMs cancelled, with nothing executed", async () => {
    const { replica, client } = held()
    const ledger = client.canister<icrc1.Actor>(icrc1.actor, {
      id: LEDGER,
      timeoutMs: 50,
    })
    await expect(
      within(
        client.queryClient.fetchQuery(
          client.queryOptions(ledger, "icrc1_balance_of", {
            owner: ALICE,
            subaccount: null,
          })
        )
      )
    ).rejects.toMatchObject({
      kind: "cancelled",
      mayHaveExecuted: false,
      code: "timeout",
    })
    expect(requestsFor(replica, "icrc1_balance_of")).toHaveLength(1)
  })

  it.each([0, 0.5, Number.NaN, 2 ** 31, "50"])(
    "throws a TypeError for a mutation's timeoutMs %s",
    (timeoutMs) => {
      const { client } = held()
      const ledger = client.canister<icrc1.Actor>(icrc1.actor, { id: LEDGER })
      expect(() =>
        client.mutationOptions(ledger, "icrc1_transfer", {
          timeoutMs: timeoutMs as number,
        })
      ).toThrow(/2147483647/)
    }
  )
})

/** A client in a page, on `replica`, with nobody signed in. */
function createClientSignedOut(replica: ReturnType<typeof replicaWith>) {
  return clientWithAuth(replica, createTestAuth({ seed: 3, signedIn: false }))
}
