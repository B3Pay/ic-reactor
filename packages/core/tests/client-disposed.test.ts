/**
 * Calls on a client after `dispose()`: every one, whatever its kind and
 * whoever the client called as, rejects `cancelled` with code
 * `client_disposed` and `mayHaveExecuted: false`, and sends nothing.
 *
 * A disposed client calls as the anonymous principal. A call path that asks
 * who calls before it asks whether the client is still there refuses a write
 * as `unauthenticated` (`anonymous_write`) instead, which tells the person to
 * sign in when nothing about signing in is wrong: a CLI that disposes its
 * client on Ctrl-C would report "nobody is signed in" for its last write.
 *
 * A call already sent when the client is disposed settles as the replica
 * answers; one still waiting to be sent is cancelled like a new one.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { c, principal } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  MutationObserver,
  skipToken,
  type QueryFunctionContext,
} from "@tanstack/query-core"
import type { Client } from "../src/client.js"
import { isReactorError } from "../src/errors.js"
import type { Canister } from "../src/index.js"
import type { CanisterQueryOptions } from "../src/types.js"
import { createTestAuth } from "../src/testing/test-auth.js"
import {
  ARCHIVE,
  MANAGEMENT,
  SHAPES,
  canisterRequests,
  clientAs,
  clientWithAuth,
  deferred,
  replicaWith,
  requestsFor,
  serve,
} from "./canister-helpers.js"
import { withIdentity } from "./client-helpers.js"
import * as archive from "./fixtures/archive.js"
import * as management from "./fixtures/management.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const alice = Ed25519KeyIdentity.generate()

/** The archive canister's interface, as the func types of `archive.did` describe it. */
const archiveService = c.service({
  read_range: archive.QueryArchiveFn,
  notify: archive.NotifyFn,
})
type ArchiveActor = {
  read_range: (arg: archive.GetBlocksArgs) => Promise<archive.BlockRange>
  notify: (text: string) => Promise<bigint>
}

/**
 * A replica running the shapes canister, the management canister and an
 * archive. `bump` waits for `hold` when one is given, so a test can dispose
 * the client while the replica holds the update.
 */
function replicaOf(hold?: { entered: () => void; until: Promise<void> }) {
  return replicaWith({
    [SHAPES]: serve<shapes.Actor>(shapes.actor, {
      who: (_args, { caller }) => principal(caller),
      one: ([n]) => n + 1n,
      bump: async ([n]) => {
        if (hold !== undefined) {
          hold.entered()
          await hold.until
        }
        return { tag: "ok", value: n + 1n }
      },
      fire: () => undefined,
      address: ([seed], { caller }) => `${seed}:${caller}`,
    }),
    [MANAGEMENT]: serve<management.Actor>(management.actor, {
      start_canister: () => undefined,
      fetch_canister_logs: () => ({ canister_log_records: [] }),
    }),
    [ARCHIVE]: serve<ArchiveActor>(archiveService, {
      read_range: () => ({ blocks: [] }),
      notify: ([text]) => BigInt(text.length),
    }),
  })
}

type Replica = ReturnType<typeof replicaOf>

/** What a call is made on: the client and the canisters it made before it was disposed. */
interface Made {
  readonly client: Client
  readonly canister: Canister<shapes.Actor>
  readonly ic: Canister<management.Actor>
}

const made = (client: Client): Made => ({
  client,
  canister: client.canister<shapes.Actor>(shapes.actor, { id: SHAPES }),
  ic: client.canister<management.Actor>(management.actor, { id: MANAGEMENT }),
})

/** The two ways a client says who calls: a fixed identity, and an auth that is signed in. */
const CLIENTS: readonly {
  readonly built: string
  readonly make: (replica: Replica) => Client
}[] = [
  {
    built: "built with an identity",
    make: (replica) => clientAs(replica, alice),
  },
  {
    built: "signed in through its auth",
    make: (replica) => clientWithAuth(replica, createTestAuth({ seed: 1 })),
  },
]

/** Every kind of call an app makes, each with the method and canister its error names. */
const CALLS: readonly {
  readonly name: string
  readonly method: string
  readonly canisterId: string
  readonly call: (made: Made) => Promise<unknown>
}[] = [
  {
    name: "a direct query",
    method: "who",
    canisterId: SHAPES,
    call: ({ canister }) => canister.who(),
  },
  {
    name: "a direct update",
    method: "bump",
    canisterId: SHAPES,
    call: ({ canister }) => canister.bump(1n),
  },
  {
    name: "a direct oneway",
    method: "fire",
    canisterId: SHAPES,
    call: ({ canister }) => canister.fire("x"),
  },
  {
    name: "a read's query function",
    method: "one",
    canisterId: SHAPES,
    call: ({ client, canister }) =>
      client.queryClient.fetchQuery(client.queryOptions(canister, "one", 1n)),
  },
  {
    name: "an idempotent update read's query function",
    method: "address",
    canisterId: SHAPES,
    call: ({ client, canister }) =>
      client.queryClient.fetchQuery(
        client.queryOptions(canister, "address", "x", { update: "idempotent" })
      ),
  },
  {
    name: "a mutation's function",
    method: "bump",
    canisterId: SHAPES,
    call: ({ client, canister }) =>
      new MutationObserver(
        client.queryClient,
        client.mutationOptions(canister, "bump")
      ).mutate(1n),
  },
  {
    name: "a query func reference",
    method: "read_range",
    canisterId: ARCHIVE,
    call: ({ client }) =>
      client.func<ArchiveActor["read_range"]>(archive.QueryArchiveFn, {
        principal: principal(ARCHIVE),
        method: "read_range",
      })({ start: 0n, length: 1n }),
  },
  {
    name: "an update func reference",
    method: "notify",
    canisterId: ARCHIVE,
    call: ({ client }) =>
      client.func<ArchiveActor["notify"]>(archive.NotifyFn, {
        principal: principal(ARCHIVE),
        method: "notify",
      })("hello"),
  },
  {
    name: "a management canister update",
    method: "start_canister",
    canisterId: MANAGEMENT,
    call: ({ ic }) => ic.start_canister({ canister_id: principal(SHAPES) }),
  },
  {
    name: "a management canister query",
    method: "fetch_canister_logs",
    canisterId: MANAGEMENT,
    call: ({ ic }) =>
      ic.fetch_canister_logs({ canister_id: principal(SHAPES) }),
  },
]

/** What every call on a disposed client rejects with. */
const disposed = (method: string, canisterId: string) => ({
  kind: "cancelled",
  code: "client_disposed",
  mayHaveExecuted: false,
  method,
  canisterId,
})

/** Runs a read's query function as TanStack Query would. */
function runQueryFn<D, E>({ queryFn }: CanisterQueryOptions<D, E>): Promise<D> {
  if (queryFn === skipToken) throw new Error("the read is not skipped")
  return queryFn({
    signal: new AbortController().signal,
  } as QueryFunctionContext)
}

const rejection = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    (value) => {
      throw new Error(`expected a rejection, got ${String(value)}`)
    },
    (error: unknown) => error
  )

describe.each(CLIENTS)("a client $built, after dispose()", ({ make }) => {
  it.each(CALLS)(
    "rejects $name cancelled (client_disposed), and sends nothing",
    async ({ method, canisterId, call }) => {
      const replica = replicaOf()
      const live = made(make(replica))
      // The same call goes out while the client is live, so "nothing sent"
      // below is not a blind spot of the replica's log.
      await call(live)
      expect(requestsFor(replica, method)).toHaveLength(1)

      live.client.dispose()

      const error = await rejection(call(live))
      expect(isReactorError(error)).toBe(true)
      expect(error).toMatchObject(disposed(method, canisterId))
      expect(requestsFor(replica, method)).toHaveLength(1)
    }
  )

  it("cancels the query and mutation functions of options built before it was disposed", async () => {
    const replica = replicaOf()
    const { client, canister } = made(make(replica))
    const read = client.queryOptions(canister, "one", 1n)
    const updateRead = client.queryOptions(canister, "address", "x", {
      update: "idempotent",
    })
    const write = client.mutationOptions(canister, "bump")

    client.dispose()

    await expect(rejection(runQueryFn(read))).resolves.toMatchObject(
      disposed("one", SHAPES)
    )
    await expect(rejection(runQueryFn(updateRead))).resolves.toMatchObject(
      disposed("address", SHAPES)
    )
    await expect(rejection(write.mutationFn(1n))).resolves.toMatchObject(
      disposed("bump", SHAPES)
    )
    expect(canisterRequests(replica)).toEqual([])
  })

  it("runs a mutation's onMutate, and its onSettled invalidates nothing", async () => {
    const replica = replicaOf()
    const { client, canister } = made(make(replica))
    client.dispose()
    // A read of the canister written to, cached after the disposal emptied
    // the cache: a write that may have run would mark it invalidated.
    const key = client.queryKey(canister, "one", 1n)
    client.queryClient.setQueryData(key, 2n)
    const invalidate = vi.spyOn(client.queryClient, "invalidateQueries")
    const mutation = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "bump")
    )

    await expect(rejection(mutation.mutate(1n))).resolves.toMatchObject(
      disposed("bump", SHAPES)
    )

    expect(mutation.getCurrentResult()).toMatchObject({
      status: "error",
      error: disposed("bump", SHAPES),
    })
    expect(invalidate).not.toHaveBeenCalled()
    expect(client.queryClient.getQueryState(key)?.isInvalidated).toBe(false)
    expect(canisterRequests(replica)).toEqual([])
  })
})

describe("a client nobody signed in to", () => {
  it("refuses a write unauthenticated while it is live, and cancels it once it is disposed", async () => {
    const replica = replicaOf()
    const readOnly = made(clientAs(replica, "anonymous"))
    const signedOut = made(
      clientWithAuth(replica, createTestAuth({ seed: 1, signedIn: false }))
    )

    for (const { canister, client } of [readOnly, signedOut]) {
      await expect(rejection(canister.bump(1n))).resolves.toMatchObject({
        kind: "unauthenticated",
        code: "anonymous_write",
        mayHaveExecuted: false,
      })
      client.dispose()
      await expect(rejection(canister.bump(1n))).resolves.toMatchObject(
        disposed("bump", SHAPES)
      )
    }
    expect(canisterRequests(replica)).toEqual([])
  })
})

describe("a call in flight when the client is disposed", () => {
  it("settles a write the replica already has as the replica answers, and its onSettled runs on the emptied cache", async () => {
    const entered = deferred()
    const release = deferred()
    const replica = replicaOf({
      entered: entered.resolve,
      until: release.promise,
    })
    const { client, canister } = made(clientAs(replica, alice))
    const invalidate = vi.spyOn(client.queryClient, "invalidateQueries")
    const mutation = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "bump")
    )

    const write = mutation.mutate(1n)
    await entered.promise
    client.dispose()
    release.resolve()

    await expect(write).resolves.toBe(2n)
    expect(mutation.getCurrentResult().status).toBe("success")
    // The write ran, so its reads are invalidated: there are none left.
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(client.queryClient.getQueryCache().getAll()).toEqual([])
    expect(requestsFor(replica, "bump")).toHaveLength(1)
  })

  it("cancels a write still waiting for its caller's identity, and sends nothing", async () => {
    const asked = deferred()
    const gate = deferred()
    const auth = createTestAuth({ seed: 1 })
    const slowAuth = withIdentity(auth, async () => {
      const identity = await auth.getIdentity()
      asked.resolve()
      await gate.promise
      return identity
    })
    const replica = replicaOf()
    const { client, canister } = made(clientWithAuth(replica, slowAuth))

    const write = rejection(canister.bump(1n))
    await asked.promise
    client.dispose()
    gate.resolve()

    await expect(write).resolves.toMatchObject(disposed("bump", SHAPES))
    expect(canisterRequests(replica)).toEqual([])
  })
})
