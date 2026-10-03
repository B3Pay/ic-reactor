/**
 * The view of a client pinned to a principal: the internal seam that
 * `@ic-reactor/react`'s `useClient()` reads through
 * `Symbol.for("ic-reactor.client.as")` (#813).
 *
 * A server renders as nobody, and so does a hydrating render, whoever the
 * browser's session says calls. The keys such a render builds must be the
 * anonymous ones the server dehydrated, while the client's live caller is
 * already the user. The view builds keys and read options for the principal
 * it was pinned to, with the client's own options otherwise, and is the
 * client's own for everything else. A read it builds still goes out as its
 * key's principal or not at all (D20), and a write through it signs as
 * whoever is current when it runs.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { c } from "@candid-core/schema"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { MutationObserver, QueryObserver } from "@tanstack/query-core"
import { createClient, isReactorError, type Client } from "../src/index.js"
import { createTestClient } from "../src/testing/index.js"
import { ANONYMOUS } from "./canister-helpers.js"

const AS = Symbol.for("ic-reactor.client.as")

/** Calls the seam as `useClient()` does: on the provider's client, with the principal React rendered. */
function pin(client: Client, principal: string): Client {
  const seam = (client as unknown as Record<symbol, unknown>)[AS]
  if (typeof seam !== "function") throw new Error("the client has no seam")
  return (seam as (this: Client, principal: string) => Client).call(
    client,
    principal
  )
}

const SEED_1 = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** A query that answers with its caller, and an update that does too. */
const WHO = c.service({
  whoami: c.func([], [c.text], "query"),
  stamp: c.func([], [c.text], "update"),
})
type Who = {
  whoami: () => Promise<string>
  stamp: () => Promise<string>
}

const made: ReturnType<typeof createTestClient>[] = []
afterEach(() => {
  for (const test of made.splice(0)) test.client.dispose()
})

/** A test client signed in as seed 1, over a replica that runs {@link WHO}. */
function signedIn() {
  const test = createTestClient({ identity: 1 })
  test.mock<Who>(WHO, CANISTER, {
    whoami: ({ caller }) => `read by ${caller}`,
    stamp: ({ caller }) => `written by ${caller}`,
  })
  made.push(test)
  const who = test.client.canister<Who>(WHO, { id: CANISTER })
  const sent = (method: string) =>
    test.requests
      .filter(({ methodName }) => methodName === method)
      .map(({ caller }) => caller)
  return { ...test, who, sent }
}

describe("a client pinned to a principal", () => {
  it("builds the keys of the pinned principal while another one is live", () => {
    const { client, who } = signedIn()
    expect(client.caller()).toBe(SEED_1)

    const view = pin(client, ANONYMOUS)

    expect(view.caller()).toBe(ANONYMOUS)
    expect(view.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(view.queryKey(who, "whoami")).toEqual([
      "ic-reactor",
      client.network,
      ANONYMOUS,
      CANISTER,
      "whoami",
      ...client.queryKey(who, "whoami").slice(5),
    ])
    expect(view.queryKey(who)[2]).toBe(ANONYMOUS)
    expect(view.queryOptions(who, "whoami").queryKey).toEqual(
      view.queryKey(who, "whoami")
    )
    // The client itself still builds for its live caller.
    expect(client.queryKey(who, "whoami")[2]).toBe(SEED_1)
    expect(client.queryOptions(who, "whoami").queryKey[2]).toBe(SEED_1)
    // Pinned to a user, it says that user is signed in.
    expect(pin(client, SEED_1).authState()).toEqual({
      status: "signed-in",
      principal: SEED_1,
    })
  })

  it("builds the client's own read options but for the key", async () => {
    const { client, who, auth } = signedIn()
    const options = pin(client, ANONYMOUS).queryOptions(who, "whoami")
    const idempotent = pin(client, ANONYMOUS).queryOptions(
      who,
      "stamp",
      undefined,
      { update: "idempotent" }
    )
    await auth.signOut()

    // No held reads and no disabled options: what the client itself builds
    // for the anonymous caller, function for function.
    const own = client.queryOptions(who, "whoami")
    const { queryFn: _a, ...rest } = options
    const { queryFn: _b, ...ownRest } = own
    expect(rest).toEqual(ownRest)
    expect(Object.keys(options).sort()).toEqual(Object.keys(own).sort())
    const { queryFn: _c, ...idempotentRest } = idempotent
    const { queryFn: _d, ...ownIdempotent } = client.queryOptions(
      who,
      "stamp",
      undefined,
      { update: "idempotent" }
    )
    expect(idempotentRest).toEqual(ownIdempotent)
  })

  it("finds what a server prefetched as nobody, under the same key", async () => {
    const server = createTestClient({ identity: 1, signedIn: false })
    made.push(server)
    server.mock<Who>(WHO, CANISTER, { whoami: () => "prefetched" })
    const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
    await server.client.queryClient.prefetchQuery(
      server.client.queryOptions(serverWho, "whoami")
    )
    const { client, who } = signedIn()

    const view = pin(client, ANONYMOUS)

    expect(view.queryOptions(who, "whoami").queryKey).toEqual(
      server.client.queryOptions(serverWho, "whoami").queryKey
    )
  })

  it("cancels a read it built while someone else is current, and sends nothing", async () => {
    const { client, who, auth, sent } = signedIn()
    const view = pin(client, ANONYMOUS)
    const options = view.queryOptions(who, "whoami")

    const failure: unknown = await client.queryClient
      .fetchQuery({ ...options, retry: false })
      .catch((error: unknown) => error)

    expect(isReactorError(failure) && failure.kind).toBe("cancelled")
    expect(isReactorError(failure) && failure.code).toBe("caller_changed")
    expect(sent("whoami")).toEqual([])

    // Once nobody is current, the same read goes out, as nobody.
    await auth.signOut()
    await expect(
      client.queryClient.fetchQuery({ ...options, retry: false })
    ).resolves.toBe(`read by ${ANONYMOUS}`)
    expect(sent("whoami")).toEqual([ANONYMOUS])
  })

  it("leaves a key that holds data as it found it when a read it built is cancelled", async () => {
    const { client, who, auth, sent } = signedIn()
    const view = pin(client, ANONYMOUS)
    const options = { ...view.queryOptions(who, "whoami"), retry: false }
    // What a server dehydrated as nobody, stale by now.
    client.queryClient.setQueryData(options.queryKey, "prefetched", {
      updatedAt: 1,
    })
    const errors: unknown[] = []
    const stop = client.queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        errors.push(event.action.error)
      }
    })

    // TanStack 5.90 and later resolve the reverted fetch with the data the
    // key holds; earlier ones reject it with their CancelledError.
    await client.queryClient.fetchQuery(options).catch(() => undefined)
    stop()

    expect(sent("whoami")).toEqual([])
    expect(client.queryClient.getQueryState(options.queryKey)).toMatchObject({
      status: "success",
      fetchStatus: "idle",
      data: "prefetched",
      dataUpdatedAt: 1,
      error: null,
    })
    expect(
      errors.filter((error) => isReactorError(error) && error.code)
    ).toEqual([])

    // Still stale: once nobody is current, an observer reads it again.
    await auth.signOut()
    const observer = new QueryObserver(client.queryClient, options)
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toBe(`read by ${ANONYMOUS}`)
    )
    unsubscribe()
    expect(sent("whoami")).toEqual([ANONYMOUS])
  })

  it("clears the cancellation from a key with no data once its principal is current again", async () => {
    const { client, who, auth, sent } = signedIn()
    const pinned = { ...pin(client, ANONYMOUS).queryOptions(who, "whoami") }
    await client.queryClient.fetchQuery(pinned).catch(() => undefined)
    // Kept while the user is current: a hydrating suspense read that was
    // refused needs it, or it would fetch again at once and be refused again.
    expect(client.queryClient.getQueryState(pinned.queryKey)).toMatchObject({
      status: "error",
      error: { kind: "cancelled", code: "caller_changed" },
    })

    // The client's own read, refused because its caller left, keeps D20's
    // error even where the key holds data, and once that caller is back.
    const own = { ...client.queryOptions(who, "whoami"), retry: false }
    client.queryClient.setQueryData(own.queryKey, "earlier", { updatedAt: 1 })
    let statusSeen: string | undefined
    const unsubscribe = client.subscribe(() => {
      statusSeen ??= client.queryClient.getQueryState(pinned.queryKey)?.status
    })
    await auth.signOut()
    unsubscribe()
    await expect(client.queryClient.fetchQuery(own)).rejects.toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
    })

    // Cleared before any listener heard of the sign-out.
    expect(statusSeen).toBe("pending")
    expect(client.queryClient.getQueryState(pinned.queryKey)).toMatchObject({
      status: "pending",
      fetchStatus: "idle",
      error: null,
    })
    await auth.signIn()
    expect(client.queryClient.getQueryState(own.queryKey)?.status).toBe("error")
    expect(sent("whoami")).toEqual([])
  })

  it("cancels a read pinned to a user who is no longer signed in", async () => {
    const { client, who, auth, sent } = signedIn()
    const view = pin(client, SEED_1)
    await auth.signOut()

    const observer = new QueryObserver(client.queryClient, {
      ...view.queryOptions(who, "whoami"),
      retry: false,
    })
    const result = await observer.refetch()

    expect(isReactorError(result.error) && result.error.code).toBe(
      "caller_changed"
    )
    expect(sent("whoami")).toEqual([])
  })

  it("refuses an idempotent update it built for nobody, and sends nothing", async () => {
    const { client, who, auth, sent } = signedIn()
    const view = pin(client, ANONYMOUS)
    const options = view.queryOptions(who, "stamp", undefined, {
      update: "idempotent",
    })
    // Nobody is current now, so the read is not cancelled: it runs as the
    // principal it was pinned to, who may not send an update.
    await auth.signOut()

    const failure: unknown = await client.queryClient
      .fetchQuery({ ...options, retry: false })
      .catch((error: unknown) => error)

    expect(isReactorError(failure) && failure.kind).toBe("unauthenticated")
    expect(isReactorError(failure) && failure.code).toBe("anonymous_write")
    expect(sent("stamp")).toEqual([])
  })

  it("writes as the caller current when the write runs", async () => {
    const { client, who, sent } = signedIn()
    const view = pin(client, ANONYMOUS)

    expect(view.mutationOptions).toBe(client.mutationOptions)
    const write = new MutationObserver(
      client.queryClient,
      view.mutationOptions(who, "stamp")
    )
    await expect(write.mutate()).resolves.toBe(`written by ${SEED_1}`)
    // A direct call through a canister the view made follows the live caller too.
    const direct = view.canister<Who>(WHO, { id: CANISTER })
    await expect(direct.stamp()).resolves.toBe(`written by ${SEED_1}`)
    expect(sent("stamp")).toEqual([SEED_1, SEED_1])
  })

  it("is the client's own for everything but its keys, its reads and who it says calls", () => {
    const { client, who } = signedIn()

    const view = pin(client, ANONYMOUS)

    // One view per client and principal, so a component's dependencies do
    // not change from one render to the next.
    expect(pin(client, ANONYMOUS)).toBe(view)
    expect(Object.isFrozen(view)).toBe(true)
    for (const member of [
      "network",
      "queryClient",
      "subscribe",
      "signIn",
      "signOut",
      "dispose",
      "canister",
      "mutationOptions",
      "func",
    ] as const) {
      expect(view[member]).toBe(client[member])
    }
    // A canister made through either one is the client's, for both.
    const fromView = view.canister<Who>(WHO, { id: CANISTER })
    expect(fromView).toBe(who)
    expect(() => client.queryOptions(fromView, "whoami")).not.toThrow()
    expect(() => view.queryKey(who, "whoami")).not.toThrow()
    // A view of a wrapper (a test's spy over a client) keeps the wrapper's members.
    const spied = Object.create(client, {
      dispose: { value: () => {}, enumerable: true },
    }) as Client
    expect(pin(spied, ANONYMOUS).dispose).toBe(spied.dispose)
  })

  it("keeps no view of a principal that is neither current nor anonymous, however many switches", () => {
    const { client, auth } = signedIn()
    const anonymous = pin(client, ANONYMOUS)
    const first = pin(client, SEED_1)
    expect(pin(client, SEED_1)).toBe(first)

    for (let seed = 2; seed < 200; seed++) {
      auth.switchTo(seed)
      pin(client, client.caller())
    }

    // The anonymous view a hydrating render asks for is kept; a user's view
    // is not kept past their session.
    expect(pin(client, ANONYMOUS)).toBe(anonymous)
    expect(pin(client, SEED_1)).not.toBe(first)
  })

  it("is the client itself when its caller is fixed", () => {
    const fixed = createClient({
      network: "ic",
      identity: Ed25519KeyIdentity.generate(),
    })
    const anonymous = createClient({ network: "ic", identity: "anonymous" })

    expect(pin(fixed, ANONYMOUS)).toBe(fixed)
    expect(pin(anonymous, ANONYMOUS)).toBe(anonymous)
    fixed.dispose()
    anonymous.dispose()
  })
})
